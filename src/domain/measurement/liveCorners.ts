// Esquinas, lados y ángulos del trazo EN VIVO (celular): el camino es abierto y crece punto a punto, así
// que las esquinas se detectan sobre la marcha y deben ser ESTABLES (sin parpadeo). Son funciones puras:
// el estado se pasa y se devuelve, y el dibujo solo lo lee.
//
// Reglas de estabilidad:
//  a) una esquina solo se confirma cuando el camino ya avanzó una distancia mínima después de ella
//     (LIVE_CONFIRM_MIN_M, o varias veces la tolerancia), para que el tramo actual no se tome por esquina;
//  b) lo confirmado no desaparece ni se mueve más de LIVE_MAX_DRIFT_M de donde se confirmó;
//  c) se recalcula como máximo cada LIVE_RECOMPUTE_MS y solo si llegó un punto nuevo;
//  d) con menos de LIVE_MIN_PATH_M de avance desde el inicio no se muestra nada (GPS parado incluido).
import {
  distToSegment,
  polygonDims,
  rdpKeep,
  TOL_MAX_M,
  TOL_MIN_M,
  TOL_RATIO,
  vertexName,
  NOISE_FACTOR,
} from "@/domain/measurement/dimensions";
import type { Pt } from "@/domain/measurement/plot";

/** Con menos avance que esto (m) desde el inicio no se detecta ni se muestra nada. */
export const LIVE_MIN_PATH_M = 10;
/** Distancia mínima (m) que debe avanzar el camino después de una esquina para confirmarla. */
export const LIVE_CONFIRM_MIN_M = 6;
/** Un giro de menos de estos grados no es una esquina. */
export const LIVE_MIN_TURN_DEG = 30;
/** Recalcula como máximo cada tanto (ms), y solo si llegó un punto nuevo. */
export const LIVE_RECOMPUTE_MS = 1000;
/** Lo confirmado no se aleja más de esto (m) del lugar donde se confirmó. */
export const LIVE_MAX_DRIFT_M = 1;
/** El ángulo de una esquina solo se muestra si el lado siguiente mide al menos esto (m): así no salta. */
export const LIVE_MIN_NEXT_SIDE_M = 2;
/** Con más lados que esto solo se rotulan longitudes, sin ángulos. */
export const LIVE_MAX_ANGLE_SIDES = 12;

export interface LiveCorner {
  /** Posición actual (se puede afinar hasta LIVE_MAX_DRIFT_M). */
  p: Pt;
  /** Posición en que se confirmó. */
  p0: Pt;
  /** Índice del camino donde se detectó. */
  idx: number;
}

export interface LiveState {
  corners: LiveCorner[];
  /** Cuántos puntos tenía el camino en el último cálculo. */
  pathLen: number;
  /** Hora (ms) del último cálculo. */
  at: number;
  /** Tolerancia usada en el último cálculo (m): sirve para decidir si el camino ya se cerró. */
  tol: number;
}

export const newLiveState = (): LiveState => ({ corners: [], pathLen: 0, at: -Infinity, tol: 0 });

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Giro (grados, 0 a 180) al pasar de a→b a b→c. */
function turnDeg(a: Pt, b: Pt, c: Pt): number {
  const u = { x: b.x - a.x, y: b.y - a.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  if (Math.hypot(u.x, u.y) < 1e-9 || Math.hypot(v.x, v.y) < 1e-9) return 0;
  return (Math.abs(Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y)) * 180) / Math.PI;
}

/** Longitud del camino entre los índices i y j. */
function arc(path: readonly Pt[], i: number, j: number): number {
  let total = 0;
  for (let k = i; k < j; k++) total += dist(path[k], path[k + 1]);
  return total;
}

/** Ruido del camino abierto: mediana de la distancia de cada punto a la recta que une los de ±k lugares. */
export function openNoise(path: readonly Pt[], k = 3): number {
  const n = path.length;
  if (n < 2 * k + 3) return 0;
  const d: number[] = [];
  for (let i = k; i < n - k; i++) d.push(distToSegment(path[i], path[i - k], path[i + k]));
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

/** Lo más lejos que llegó el camino del punto de inicio (m). */
export const reach = (path: readonly Pt[]): number =>
  path.length ? Math.max(...path.map((p) => dist(p, path[0]))) : 0;

export interface Detected {
  idx: number;
  /** Posición de la esquina: el cruce de las rectas de sus dos lados (más fiel que el punto ruidoso del GPS). */
  p: Pt;
}

/** Recta que mejor pasa por los puntos (centro y dirección, por componentes principales). */
function fitLine(pts: readonly Pt[]): { c: Pt; d: Pt } {
  const c = {
    x: pts.reduce((t, q) => t + q.x, 0) / pts.length,
    y: pts.reduce((t, q) => t + q.y, 0) / pts.length,
  };
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const q of pts) {
    sxx += (q.x - c.x) ** 2;
    syy += (q.y - c.y) ** 2;
    sxy += (q.x - c.x) * (q.y - c.y);
  }
  const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { c, d: { x: Math.cos(a), y: Math.sin(a) } };
}

/** Puntos que se dejan fuera en cada extremo de un lado al ajustar su recta (la esquina redondea). */
const FIT_MARGIN = 2;
/** Menos de estos puntos en un lado y no se ajusta su recta. */
const FIT_MIN_POINTS = 4;

/**
 * Esquina refinada: cruce de las rectas ajustadas al lado anterior y al siguiente. Si faltan puntos, las
 * rectas son casi paralelas o el cruce cae lejos del punto detectado, se queda con el punto detectado.
 */
function refineCorner(
  path: readonly Pt[],
  prev: number,
  idx: number,
  next: number,
  tol: number,
): Pt | null {
  // dos pasadas: el punto que elige Ramer-Douglas-Peucker puede quedar unos puntos antes o después de la
  // esquina verdadera; la segunda pasada parte los lados en el punto más cercano al cruce de la primera
  let at = idx;
  let result: Pt | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const q = intersectSides(path, prev, at, next, tol);
    if (!q) break;
    result = q;
    let best = at;
    let bestD = Infinity;
    for (let k = Math.max(prev + 1, at - 8); k <= Math.min(next - 1, at + 8); k++) {
      const d = dist(path[k], q);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    at = best;
  }
  return result;
}

/** Cruce de las rectas de los dos lados de la esquina `idx`, o `null` si no se puede ajustar. */
function intersectSides(
  path: readonly Pt[],
  prev: number,
  idx: number,
  next: number,
  tol: number,
): Pt | null {
  const before = path.slice(prev + FIT_MARGIN, idx - FIT_MARGIN + 1);
  const after = path.slice(idx + FIT_MARGIN, next - FIT_MARGIN + 1);
  if (before.length < FIT_MIN_POINTS || after.length < FIT_MIN_POINTS) return null;
  const a = fitLine(before);
  const b = fitLine(after);
  const det = a.d.x * b.d.y - a.d.y * b.d.x;
  if (Math.abs(det) < Math.sin((15 * Math.PI) / 180)) return null;
  const t = ((b.c.x - a.c.x) * b.d.y - (b.c.y - a.c.y) * b.d.x) / det;
  const q = { x: a.c.x + t * a.d.x, y: a.c.y + t * a.d.y };
  return dist(q, path[idx]) <= Math.max(2 * tol, 6) ? q : null;
}

/**
 * Esquinas del camino abierto tal como está ahora (sin estabilizar): Ramer-Douglas-Peucker con una
 * tolerancia que sigue el tamaño y el ruido, y después se descartan las que giran poco, las de lados
 * muy cortos y las que aún no tienen LIVE_CONFIRM_MIN_M de camino detrás.
 */
export function detectOpenCorners(path: readonly Pt[]): {
  corners: Detected[];
  tol: number;
  minSide: number;
} {
  const n = path.length;
  if (n < 5 || reach(path) < LIVE_MIN_PATH_M) return { corners: [], tol: 0, minSide: 0 };
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const tol = Math.min(
    TOL_MAX_M,
    Math.max(TOL_MIN_M, diag * TOL_RATIO, NOISE_FACTOR * openNoise(path)),
  );
  // con ruido hace falta más camino detrás de la esquina para ubicarla bien: 6 veces la tolerancia
  const confirm = Math.min(16, Math.max(LIVE_CONFIRM_MIN_M, 6 * tol));
  const minSide = Math.max(3, diag * 0.04);

  const kept = rdpKeep(path, tol);
  let cand = kept.slice(1, -1);
  for (let guard = 0; guard < 1000 && cand.length; guard++) {
    // el candidato que peor cumple: se quita y se vuelve a evaluar con sus nuevos vecinos
    let worst = -1;
    let worstTurn = Infinity;
    cand.forEach((idx, j) => {
      const prev = j === 0 ? 0 : cand[j - 1];
      const last = j === cand.length - 1;
      const next = last ? n - 1 : cand[j + 1];
      const turn = turnDeg(path[prev], path[idx], path[next]);
      const bad =
        turn < LIVE_MIN_TURN_DEG ||
        dist(path[prev], path[idx]) < minSide ||
        (last ? arc(path, idx, n - 1) < confirm : dist(path[idx], path[next]) < minSide);
      if (bad && turn < worstTurn) {
        worstTurn = turn;
        worst = j;
      }
    });
    if (worst < 0) break;
    cand = cand.filter((_, j) => j !== worst);
  }
  const corners: Detected[] = [];
  cand.forEach((idx, j) => {
    const last = j === cand.length - 1;
    const q = refineCorner(path, j === 0 ? 0 : cand[j - 1], idx, last ? n - 1 : cand[j + 1], tol);
    // la última esquina aún tiene poco camino detrás: no se confirma hasta poder ubicarla bien con las
    // rectas de sus dos lados (el punto crudo del GPS queda unos metros antes o después y luego no se mueve)
    if (last && !q) return;
    corners.push({ idx, p: q ?? path[idx] });
  });
  return { corners, tol, minSide };
}

/**
 * Un paso del seguimiento: recibe el camino actual y la hora, y devuelve el estado con las esquinas
 * confirmadas. Si no llegó ningún punto nuevo, o hace menos de LIVE_RECOMPUTE_MS del último cálculo,
 * devuelve el mismo estado sin recalcular.
 */
export function stepLive(state: LiveState, path: readonly Pt[], nowMs: number): LiveState {
  if (path.length === state.pathLen || nowMs - state.at < LIVE_RECOMPUTE_MS) return state;
  const { corners: found, tol, minSide } = detectOpenCorners(path);
  // dos esquinas más cerca que esto son la misma (un lado real mide al menos minSide)
  const radius = Math.max(5, 2 * tol, minSide);
  const next: LiveCorner[] = [];
  const used = new Set<number>();
  // lo ya confirmado se queda siempre; solo se afina la posición si el cambio es pequeño
  for (const c of state.corners) {
    let best = -1;
    let bestD = radius;
    found.forEach((f, i) => {
      const d = dist(c.p, f.p);
      if (!used.has(i) && d <= bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      const q = found[best].p;
      next.push(dist(q, c.p0) <= LIVE_MAX_DRIFT_M ? { ...c, p: q } : c);
    } else next.push(c);
  }
  // esquinas nuevas: solo las que van después de la última confirmada y no repiten a ninguna
  const lastIdx = next.length ? next[next.length - 1].idx : -1;
  found.forEach((f, i) => {
    if (used.has(i) || f.idx <= lastIdx) return;
    const q = f.p;
    if (next.some((c) => dist(c.p, q) <= radius)) return;
    next.push({ p: q, p0: q, idx: f.idx });
  });
  return { corners: next, pathLen: path.length, at: nowMs, tol };
}

export interface LiveSide {
  from: Pt;
  to: Pt;
  length: number;
}

export interface LiveAngle {
  /** Esquina donde va el ángulo. */
  at: Pt;
  /** Grados enteros: 0 a 180 con el camino abierto; interior (0 a 360) con el camino cerrado. */
  deg: number;
  /** Dirección unitaria hacia afuera, para colocar la etiqueta. */
  outward: Pt;
  /** Letra del vértice (A es el inicio). */
  name: string;
}

export interface LiveView {
  /** Lados ya terminados, entre el inicio y las esquinas. */
  sides: LiveSide[];
  /** Tramo actual, aún abierto (vacío si el camino ya se cerró). */
  current: LiveSide | null;
  angles: LiveAngle[];
  /** El camino volvió cerca del inicio: el contorno se cierra y los ángulos son los interiores. */
  closed: boolean;
}

export interface LiveViewOptions {
  /** Largos caminados de cada lado terminado (por pasos); si faltan, la distancia en línea recta. */
  walked?: readonly number[];
  /** Largo caminado del tramo actual; si falta, la distancia en línea recta. */
  currentWalked?: number;
  /** Distancia al inicio (m) por debajo de la cual el camino se considera cerrado. */
  closeWithin?: number;
}

const unit = (p: Pt): Pt => {
  const l = Math.hypot(p.x, p.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: p.x / l, y: p.y / l };
};

/**
 * Lados terminados, tramo actual y ángulos a partir del inicio, las esquinas confirmadas y la posición
 * actual. Los ángulos de un camino abierto son el ángulo entre dos lados consecutivos (el menor, de 0 a
 * 180°) y solo salen cuando el lado siguiente mide LIVE_MIN_NEXT_SIDE_M o más. Con el camino cerrado
 * (la posición está cerca del inicio y hay 2 o más esquinas) los ángulos son los interiores del contorno,
 * con el inicio incluido; ahí sí puede salir un ángulo reflejo (más de 180°).
 */
export function liveView(
  start: Pt,
  corners: readonly Pt[],
  here: Pt,
  options: LiveViewOptions = {},
): LiveView {
  const verts = [start, ...corners];
  const k = corners.length;
  const closed =
    k >= 2 && dist(here, start) <= (options.closeWithin ?? 0) && dist(verts[k], start) >= 1;
  const sides: LiveSide[] = [];
  for (let i = 0; i < k; i++)
    sides.push({
      from: verts[i],
      to: verts[i + 1],
      length: options.walked?.[i] ?? dist(verts[i], verts[i + 1]),
    });
  if (closed) {
    sides.push({ from: verts[k], to: start, length: dist(verts[k], start) });
    const dims = polygonDims(verts);
    const angles: LiveAngle[] = dims
      ? dims.vertices.map((v) => ({
          at: v.point,
          deg: Math.round(v.interior),
          outward: v.outward,
          name: v.name,
        }))
      : [];
    return { sides, current: null, angles, closed: true };
  }
  const current: LiveSide | null =
    k === 0 && dist(here, start) < 0.3
      ? null
      : {
          from: verts[k],
          to: here,
          length: options.currentWalked ?? dist(verts[k], here),
        };
  const angles: LiveAngle[] = [];
  if (k + 1 <= LIVE_MAX_ANGLE_SIDES)
    for (let j = 1; j <= k; j++) {
      const prev = verts[j - 1];
      const cur = verts[j];
      const nxt = j === k ? here : verts[j + 1];
      if (dist(cur, nxt) < LIVE_MIN_NEXT_SIDE_M) continue;
      const a = unit({ x: prev.x - cur.x, y: prev.y - cur.y });
      const b = unit({ x: nxt.x - cur.x, y: nxt.y - cur.y });
      let outward = unit({ x: -(a.x + b.x), y: -(a.y + b.y) });
      if (Math.hypot(outward.x, outward.y) < 1e-9) outward = { x: -a.y, y: a.x };
      angles.push({
        at: cur,
        deg: Math.round(180 - turnDeg(prev, cur, nxt)),
        outward,
        name: vertexName(j),
      });
    }
  return { sides, current, angles, closed: false };
}

/** Distancia al inicio (m) por debajo de la cual el camino se considera cerrado: de 3 a 8 m según el ruido. */
export const closeRadius = (tol: number): number => Math.min(8, Math.max(3, 1.5 * tol));
