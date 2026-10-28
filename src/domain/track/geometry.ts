// Geometría de la pista, portada de `Track2` (trazador-de-pistas.html, líneas ~656-783).
// La pista es una poligonal de control con un radio por vértice: cada vértice con radio > 0 se
// convierte en una curva tangente a sus dos tramos (como un "filete" de CAD); radio 0 = esquina viva.
import {
  DEG,
  type Crossing,
  type Geometry,
  type SamplePoint,
  type StraightRun,
  type Track,
  type VertexInfo,
} from "@/domain/track/types";

/** Separación en cm entre muestras de la línea. */
export const STEP = 0.5;

type GeometryInput = Pick<Track, "points" | "closed">;

/** Pares de vértices que forman cada arista (cierra el último con el primero si es circuito). */
export function edgesOf(track: GeometryInput): [number, number][] {
  const n = track.points.length;
  if (n < 2) return [];
  const m = track.closed ? n : n - 1;
  const out: [number, number][] = [];
  for (let i = 0; i < m; i++) out.push([i, (i + 1) % n]);
  return out;
}

/** Vector unitario y largo entre dos puntos. */
function unit(a: { x: number; y: number }, b: { x: number; y: number }): [number, number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-9;
  return [dx / L, dy / L, L];
}

/** Muestrea la línea completa (rectas y arcos) y calcula el largo total. */
export function build(track: GeometryInput): Geometry {
  const P = track.points;
  const n = P.length;
  // Un circuito necesita al menos 3 puntos: con menos, `closed` se ignora (igual que el prototipo).
  const closed = !!track.closed && n >= 3;
  const V: VertexInfo[] = P.map(() => ({
    turn: 0,
    t: 0,
    r: 0,
    rEff: 0,
    tEff: 0,
    fit: 1,
    bad: null,
    d1: null,
    d2: null,
  }));
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const a = P[(i - 1 + n) % n];
    const b = P[i];
    const c = P[(i + 1) % n];
    const [ux, uy, l1] = unit(a, b);
    const [wx, wy, l2] = unit(b, c);
    if (l1 < 1e-6 || l2 < 1e-6) {
      V[i].bad = "dup";
      continue;
    }
    const turn = Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy);
    V[i].turn = turn;
    V[i].d1 = [ux, uy];
    V[i].d2 = [wx, wy];
    if (Math.abs(turn) > 179.5 * DEG) {
      V[i].bad = "reversa";
      continue;
    }
    const r = Math.max(0, +b.radius || 0);
    V[i].r = r;
    V[i].t = Math.abs(turn) > 1e-9 ? r * Math.tan(Math.abs(turn) / 2) : 0;
  }
  const E = edgesOf({ points: P, closed });
  // Si dos curvas vecinas no caben en su tramo, se reduce el radio de ambas (`fit`).
  E.forEach(([i, j]) => {
    const L = Math.hypot(P[j].x - P[i].x, P[j].y - P[i].y);
    const need = V[i].t + V[j].t;
    if (need > L + 1e-6) {
      const f = L / need;
      V[i].fit = Math.min(V[i].fit, f);
      V[j].fit = Math.min(V[j].fit, f);
    }
  });
  V.forEach((v) => {
    v.tEff = v.t * v.fit;
    v.rEff = v.r * v.fit;
  });

  const pts: SamplePoint[] = [];
  const corners: Geometry["corners"] = [];
  const gaps: Geometry["gaps"] = [];
  const arcs: Geometry["arcs"] = [];
  const straights: Geometry["straights"] = [];
  const push = (x: number, y: number, st: boolean, src: string) =>
    pts.push({ x, y, st, src, s: 0 });

  // Punto donde empieza el tramo que sale del vértice i.
  const startOf = (i: number) => {
    const v = V[i];
    const p = P[i];
    if (!v.d2 || v.tEff === 0) return { x: p.x, y: p.y };
    return { x: p.x + v.d2[0] * v.tEff, y: p.y + v.d2[1] * v.tEff };
  };
  // Punto donde termina el tramo que llega al vértice j.
  const endOf = (j: number) => {
    const v = V[j];
    const p = P[j];
    if (!v.d1 || v.tEff === 0) return { x: p.x, y: p.y };
    return { x: p.x - v.d1[0] * v.tEff, y: p.y - v.d1[1] * v.tEff };
  };
  function arcAt(j: number) {
    const v = V[j];
    const p = P[j];
    if (!v.d1 || v.bad) {
      push(p.x, p.y, false, "v" + j);
      return;
    }
    if (Math.abs(v.turn) < 1e-9) return;
    if (v.rEff < 1e-6) {
      // Esquina viva.
      push(p.x, p.y, false, "v" + j);
      corners.push({ v: j, x: p.x, y: p.y, a: 180 - Math.abs(v.turn) / DEG });
      return;
    }
    const T1x = p.x - v.d1[0] * v.tEff;
    const T1y = p.y - v.d1[1] * v.tEff;
    const s = Math.sign(v.turn);
    const cx = T1x + -v.d1[1] * v.rEff * s;
    const cy = T1y + v.d1[0] * v.rEff * s;
    const a0 = Math.atan2(T1y - cy, T1x - cx);
    const sw = v.turn;
    const k = Math.max(2, Math.ceil((v.rEff * Math.abs(sw)) / STEP));
    for (let q = 1; q <= k; q++) {
      const a = a0 + (sw * q) / k;
      push(cx + v.rEff * Math.cos(a), cy + v.rEff * Math.sin(a), false, "v" + j);
    }
    arcs.push({ v: j, cx, cy, r: v.rEff, a0, sw });
  }
  if (n >= 2) {
    const first = closed ? startOf(0) : { x: P[0].x, y: P[0].y };
    push(first.x, first.y, false, "e0");
    E.forEach(([i, j], ei) => {
      const a = closed || i > 0 ? startOf(i) : { x: P[i].x, y: P[i].y };
      const b = closed || j < n - 1 ? endOf(j) : { x: P[j].x, y: P[j].y };
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const k = Math.max(1, Math.ceil(L / STEP));
      const i0 = pts.length - 1;
      for (let q = 1; q <= k; q++)
        push(a.x + ((b.x - a.x) * q) / k, a.y + ((b.y - a.y) * q) / k, true, "e" + ei);
      straights.push({ e: ei, a, b, L, i0, i1: pts.length - 1 });
      if (P[i].gap && L > 0) gaps.push({ e: ei, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, room: L });
      if (closed || j < n - 1) arcAt(j);
    });
  }
  let L = 0;
  if (pts.length) pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    pts[i].s = L;
  }
  return { pts, V, E, corners, gaps, arcs, straights, L, closed };
}

/** Cruces de la línea consigo misma (hash espacial; ignora tramos vecinos). */
export function crossings(pts: SamplePoint[], closed: boolean): Crossing[] {
  const n = pts.length;
  const cell = 6;
  const hash = new Map<string, number[]>();
  const out: Crossing[] = [];
  const segs = closed ? n : n - 1;
  const sg = (i: number): [SamplePoint, SamplePoint] => [pts[i], pts[(i + 1) % n]];
  for (let i = 0; i < segs; i++) {
    const [a, b] = sg(i);
    const x0 = Math.floor(Math.min(a.x, b.x) / cell);
    const x1 = Math.floor(Math.max(a.x, b.x) / cell);
    const y0 = Math.floor(Math.min(a.y, b.y) / cell);
    const y1 = Math.floor(Math.max(a.y, b.y) / cell);
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++) {
        const k = gx + ":" + gy;
        const list = hash.get(k);
        if (list) list.push(i);
        else hash.set(k, [i]);
      }
  }
  const seen = new Set<string>();
  for (const list of hash.values())
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) {
        const i = list[p];
        const j = list[q];
        let d = Math.abs(i - j);
        if (closed) d = Math.min(d, segs - d);
        if (d < 3) continue;
        const key = Math.min(i, j) + "-" + Math.max(i, j);
        if (seen.has(key)) continue;
        seen.add(key);
        const [a, b] = sg(i);
        const [c, e] = sg(j);
        const den = (b.x - a.x) * (e.y - c.y) - (b.y - a.y) * (e.x - c.x);
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c.x - a.x) * (e.y - c.y) - (c.y - a.y) * (e.x - c.x)) / den;
        const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
        if (t >= 0 && t < 1 && u >= 0 && u < 1) {
          const x = a.x + t * (b.x - a.x);
          const y = a.y + t * (b.y - a.y);
          if (!out.some((o) => Math.hypot(o.x - x, o.y - y) < 3)) {
            const ang =
              Math.abs(
                Math.atan2(
                  (b.x - a.x) * (e.y - c.y) - (b.y - a.y) * (e.x - c.x),
                  (b.x - a.x) * (e.x - c.x) + (b.y - a.y) * (e.y - c.y),
                ),
              ) / DEG;
            out.push({ x, y, i, j, ang: Math.min(ang, 180 - ang) });
          }
        }
      }
  return out;
}

/** Tramos rectos continuos (varias aristas rectas seguidas cuentan como una). */
export function straightRuns(g: Geometry): StraightRun[] {
  const P = g.pts;
  const n = P.length;
  const runs: Omit<StraightRun, "mx" | "my">[] = [];
  if (n < 2) return [];
  let cur: Omit<StraightRun, "mx" | "my"> | null = null;
  const lim = g.closed ? 2 * n : n;
  for (let k = 1; k < lim; k++) {
    const a = P[(k - 1) % n];
    const b = P[k % n];
    if (g.closed && k % n === 0) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (b.st && len > 0) {
      if (!cur) cur = { L: 0, i0: k - 1, i1: k, src: b.src };
      cur.L += len;
      cur.i1 = k;
    } else if (b.st && len === 0) {
      /* nada */
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
    if (k >= n && !cur) break;
  }
  if (cur) runs.push(cur);
  // En circuitos cerrados el doble recorrido puede repetir rectas: se deduplica por inicio.
  const seen = new Set<number>();
  const out: StraightRun[] = [];
  for (const r of runs) {
    const key = r.i0 % n;
    if (seen.has(key) || r.L > g.L + 1e-6) continue;
    seen.add(key);
    const m = P[Math.floor((r.i0 + r.i1) / 2) % n];
    out.push({ ...r, mx: m.x, my: m.y });
  }
  return out;
}
