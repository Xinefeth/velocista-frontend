// Cotas de un plano: longitud de cada lado, nombre de cada vértice (A, B, C…), ángulo interior y
// lugar de cada etiqueta. Son funciones puras: el dibujo (lienzo) y el archivo DXF solo las usan.
// Todo está en metros y en grados; los puntos van en el plano de la medición (y hacia arriba).
import { fmtEs } from "@/domain/measurement/labels";
import type { Pt } from "@/domain/measurement/plot";

/** Dos puntos más cerca que esto (m) se consideran el mismo. */
const SAME_M = 1e-9;

export interface SideDim {
  index: number;
  /** Nombre del lado según sus vértices: «AB», «BC»… */
  name: string;
  from: Pt;
  to: Pt;
  length: number;
  /** Punto medio del lado. */
  mid: Pt;
  /** Dirección unitaria hacia afuera del contorno (perpendicular al lado). */
  outward: Pt;
  /** Texto de la cota, por ejemplo «8.00 m». */
  label: string;
}

export interface VertexDim {
  index: number;
  /** Letra del vértice: A, B, C… (AA, AB… después de la Z). */
  name: string;
  point: Pt;
  /** Ángulo interior en grados, entre 0 y 360 (más de 180 = ángulo reflejo, esquina hacia adentro). */
  interior: number;
  reflex: boolean;
  /** Dirección unitaria hacia afuera del contorno, por la bisectriz del vértice. */
  outward: Pt;
  /** Texto del ángulo, por ejemplo «90°». */
  label: string;
}

export interface PolygonDims {
  sides: SideDim[];
  vertices: VertexDim[];
  perimeter: number;
  area: number;
  /** 1 si el contorno va en sentido antihorario, −1 si va en sentido horario. */
  orientation: 1 | -1;
}

/** A, B, C… Z, AA, AB… */
export function vertexName(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l < SAME_M ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** Quita puntos repetidos seguidos y el cierre repetido (primer punto igual al último). */
export function cleanRing(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) if (!out.length || len(sub(p, out.at(-1)!)) > SAME_M) out.push(p);
  while (out.length > 1 && len(sub(out[0], out.at(-1)!)) <= SAME_M) out.pop();
  return out;
}

/** Texto de un ángulo: sin decimales si es entero (a 0,05° o menos) y con uno si no. */
export const angleLabel = (deg: number) =>
  `${fmtEs(deg, Math.abs(deg - Math.round(deg)) < 0.05 ? 0 : 1)}°`;

/** Texto de la cota de un lado. */
export const lengthLabel = (m: number) => `${fmtEs(m, 2)} m`;

/**
 * Lados, ángulos interiores y vértices de un contorno cerrado. `null` si tiene menos de 3 vértices
 * distintos o no encierra área.
 */
export function polygonDims(points: readonly Pt[]): PolygonDims | null {
  const ring = cleanRing(points);
  const n = ring.length;
  if (n < 3) return null;
  let twice = 0;
  for (let i = 0; i < n; i++) twice += cross(ring[i], ring[(i + 1) % n]);
  if (Math.abs(twice) < SAME_M) return null;
  const orientation: 1 | -1 = twice > 0 ? 1 : -1;

  const sides: SideDim[] = ring.map((from, i) => {
    const to = ring[(i + 1) % n];
    const d = sub(to, from);
    const length = len(d);
    const u = unit(d);
    // a la derecha del sentido de la marcha si es antihorario; a la izquierda si es horario
    const outward = orientation === 1 ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
    return {
      index: i,
      name: vertexName(i) + vertexName((i + 1) % n),
      from,
      to,
      length,
      mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      outward,
      label: lengthLabel(length),
    };
  });

  const vertices: VertexDim[] = ring.map((point, i) => {
    const prev = ring[(i + n - 1) % n];
    const next = ring[(i + 1) % n];
    const toPrev = unit(sub(prev, point));
    const toNext = unit(sub(next, point));
    // ángulo interior: del lado que sale hacia el siguiente al que llega del anterior, hacia adentro
    const from = orientation === 1 ? toNext : toPrev;
    const to = orientation === 1 ? toPrev : toNext;
    let interior = (Math.atan2(cross(from, to), dot(from, to)) * 180) / Math.PI;
    if (interior < 0) interior += 360;
    const reflex = interior > 180 + 1e-9;
    // la bisectriz hacia adentro es la suma de los dos lados; al revés si el ángulo es reflejo
    const sum = { x: toPrev.x + toNext.x, y: toPrev.y + toNext.y };
    let outward = reflex ? unit(sum) : unit({ x: -sum.x, y: -sum.y });
    if (len(outward) < SAME_M) outward = sides[i].outward; // vértice llano: se usa el lado
    return {
      index: i,
      name: vertexName(i),
      point,
      interior,
      reflex,
      outward,
      label: angleLabel(interior),
    };
  });

  return {
    sides,
    vertices,
    perimeter: sides.reduce((s, x) => s + x.length, 0),
    area: Math.abs(twice) / 2,
    orientation,
  };
}

export interface SideDiff {
  name: string;
  plan: number;
  measured: number;
  /** Medido menos plano (m). */
  diff: number;
  /** Diferencia en % del plano. */
  pct: number;
}

/**
 * Diferencia lado por lado entre el plano y lo medido. Los lados se corresponden por posición
 * (el primer lado medido es el primero del plano), así que solo se compara si ambos contornos tienen
 * los mismos vértices; si no, `null`.
 */
export function sideDiffs(plan: readonly Pt[], measured: readonly Pt[]): SideDiff[] | null {
  const a = polygonDims(plan);
  const b = polygonDims(measured);
  if (!a || !b || a.sides.length !== b.sides.length) return null;
  return a.sides.map((s, i) => ({
    name: s.name,
    plan: s.length,
    measured: b.sides[i].length,
    diff: b.sides[i].length - s.length,
    pct: s.length > 0 ? ((b.sides[i].length - s.length) / s.length) * 100 : 0,
  }));
}

/** Texto de una diferencia con signo, por ejemplo «+0.12 m». */
export const diffLabel = (diff: number) =>
  `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtEs(Math.abs(diff), 2)} m`;

export interface ChainSide {
  index: number;
  from: Pt;
  to: Pt;
  /** Largo del lado: el dado (por ejemplo lo caminado) o la distancia en línea recta. */
  length: number;
  mid: Pt;
  outward: Pt;
  label: string;
}

/**
 * Lados de un recorrido abierto que pasa por las esquinas `corners` (el inicio primero). Sirve para
 * mostrar los lados ya cerrados en el celular, sin ángulos. `lengths` trae lo caminado en cada lado;
 * si falta, se usa la distancia en línea recta. «Hacia afuera» es alejándose del centro del recorrido.
 */
export function chainSides(corners: readonly Pt[], lengths: readonly number[] = []): ChainSide[] {
  if (corners.length < 2) return [];
  const center = {
    x: corners.reduce((s, p) => s + p.x, 0) / corners.length,
    y: corners.reduce((s, p) => s + p.y, 0) / corners.length,
  };
  const out: ChainSide[] = [];
  for (let i = 0; i + 1 < corners.length; i++) {
    const from = corners[i];
    const to = corners[i + 1];
    const d = sub(to, from);
    if (len(d) < SAME_M) continue;
    const u = unit(d);
    let outward = { x: u.y, y: -u.x };
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    if (dot(outward, sub(mid, center)) < 0) outward = { x: -outward.x, y: -outward.y };
    const length = lengths[i] ?? len(d);
    out.push({ index: i, from, to, length, mid, outward, label: lengthLabel(length) });
  }
  return out;
}

// ---- colocación de etiquetas (en píxeles del lienzo) ----

export interface LabelRequest {
  id: string;
  /** Punto del dibujo al que pertenece la etiqueta. */
  x: number;
  y: number;
  /** Tamaño del texto con su fondo. */
  w: number;
  h: number;
  /** Dirección unitaria preferida (hacia afuera del contorno), ya en píxeles del lienzo. */
  dx: number;
  dy: number;
}

export interface PlacedLabel {
  id: string;
  /** Centro de la etiqueta. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** `false` si no se encontró un hueco libre y la etiqueta se dejó (recortada al área) sobre otra. */
  free: boolean;
}

const overlaps = (a: PlacedLabel, b: PlacedLabel, gap: number) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

/**
 * Coloca cada etiqueta lo más cerca posible de su punto, hacia afuera del contorno, sin pisar a las
 * ya puestas y sin salirse del área visible (`width` × `height`). Las etiquetas se atienden en el
 * orden dado: las primeras tienen prioridad. Si no hay hueco, la etiqueta queda recortada al área.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  width: number,
  height: number,
  gap = 2,
  fixed: readonly Omit<PlacedLabel, "id" | "free">[] = [],
): PlacedLabel[] {
  // `fixed` son huecos ya ocupados (por ejemplo un resumen en una esquina): no se devuelven
  const taken = fixed.map((f) => ({ ...f, id: "", free: true }));
  const placed: PlacedLabel[] = [];
  const clamp = (v: number, size: number, max: number) =>
    max <= size ? max / 2 : Math.min(max - size / 2, Math.max(size / 2, v));
  const inside = (c: { x: number; y: number; w: number; h: number }) =>
    c.x - c.w / 2 >= -1e-6 &&
    c.x + c.w / 2 <= width + 1e-6 &&
    c.y - c.h / 2 >= -1e-6 &&
    c.y + c.h / 2 <= height + 1e-6;

  for (const req of requests) {
    // sin dirección preferida se prueba hacia abajo; así siempre hay a dónde moverse
    const r = Math.hypot(req.dx, req.dy) < 1e-9 ? { ...req, dx: 0, dy: 1 } : req;
    // cuánto hay que alejar el centro para que la etiqueta no toque su punto
    const reach = (Math.abs(r.dx) * r.w) / 2 + (Math.abs(r.dy) * r.h) / 2 + 3;
    const tries: { x: number; y: number }[] = [];
    // primero hacia afuera, cada vez más lejos; después de lado (perpendicular) y hacia adentro
    for (const away of [0, 6, 14, 24, 36])
      tries.push({ x: r.x + r.dx * (reach + away), y: r.y + r.dy * (reach + away) });
    for (const side of [1, -1])
      for (const away of [0, 10, 22])
        tries.push({
          x: r.x + r.dx * (reach + away) - r.dy * side * (r.w / 2 + 6),
          y: r.y + r.dy * (reach + away) + r.dx * side * (r.h / 2 + 6),
        });
    tries.push({ x: r.x - r.dx * reach, y: r.y - r.dy * reach });

    let chosen: PlacedLabel | null = null;
    for (const t of tries) {
      const c: PlacedLabel = { id: r.id, x: t.x, y: t.y, w: r.w, h: r.h, free: true };
      if (
        inside(c) &&
        !placed.some((p) => overlaps(c, p, gap)) &&
        !taken.some((p) => overlaps(c, p, gap))
      ) {
        chosen = c;
        break;
      }
    }
    if (!chosen) {
      // sin hueco: se recorta al área, que es lo mínimo que se garantiza
      const t = tries[0];
      chosen = {
        id: r.id,
        x: clamp(t.x, r.w, width),
        y: clamp(t.y, r.h, height),
        w: r.w,
        h: r.h,
        free: false,
      };
    }
    placed.push(chosen);
  }
  return placed;
}

// ---- esquinas reales de un contorno con muchos puntos (por ejemplo un recorrido GPS) ----

export interface CornerOptions {
  /** Esquinas marcadas por el usuario: si hay 3 o más, son las esquinas y no se simplifica nada. */
  marked?: readonly Pt[];
  /** Un contorno con tantos vértices o menos ya se considera hecho de esquinas reales. */
  keepAsIs?: number;
  /** Tolerancia de Ramer-Douglas-Peucker en metros; por defecto, proporcional al tamaño. */
  tolerance?: number;
  /** Lados más cortos que esto (m) se funden con su vecino; por defecto, proporcional al tamaño. */
  minSide?: number;
  /** Un vértice cuyo ángulo interior queda a menos de estos grados de 180° es llano y se quita. */
  flatDeg?: number;
  /** Tope de esquinas: si quedan más, se sube la tolerancia hasta cumplirlo. */
  maxCorners?: number;
}

export interface RealCorners {
  points: Pt[];
  /** `marked` si vienen de esquinas marcadas, `original` si el contorno ya era pequeño, `simplified` si se calcularon. */
  source: "marked" | "original" | "simplified";
  /** Tolerancia final usada (m); 0 si no se simplificó. */
  tolerance: number;
}

/** Un contorno con hasta este número de vértices se toma tal cual (esquinas marcadas o recorrido por pasos). */
export const KEEP_AS_IS = 24;
/** La tolerancia es este porcentaje de la diagonal del contorno, acotada entre TOL_MIN_M y TOL_MAX_M. */
export const TOL_RATIO = 0.02;
export const TOL_MIN_M = 0.3;
export const TOL_MAX_M = 4;
/** La tolerancia no baja de este múltiplo del ruido estimado del recorrido (el ruido se ve en cada punto). */
export const NOISE_FACTOR = 5;
/** Un lado más corto que este porcentaje de la diagonal (y 0.3 m como mínimo) no es un lado real. */
export const MIN_SIDE_RATIO = 0.04;
export const MIN_SIDE_FLOOR_M = 0.3;
/** Un ángulo a menos de estos grados de 180° se considera llano. */
export const FLAT_DEG = 5;
/** Más esquinas que esto no se rotulan con ángulos en el dibujo ni en el DXF. */
export const MAX_ANGLE_CORNERS = 40;
/** Tope de esquinas rotuladas: por encima se sube la tolerancia. */
export const MAX_CORNERS = 60;

/** Distancia de un punto a un segmento. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < SAME_M) return len(sub(p, a));
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return len(sub(p, { x: a.x + ab.x * t, y: a.y + ab.y * t }));
}

/** Ramer-Douglas-Peucker sobre una cadena abierta; devuelve los índices que se conservan. */
export function rdpKeep(chain: readonly Pt[], tol: number): number[] {
  const keep = new Set<number>([0, chain.length - 1]);
  const stack: [number, number][] = [[0, chain.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let far = -1;
    let worst = tol;
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(chain[k], chain[i], chain[j]);
      if (d > worst) {
        worst = d;
        far = k;
      }
    }
    if (far >= 0) {
      keep.add(far);
      stack.push([i, far], [far, j]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

/**
 * Ruido típico del recorrido (m): mediana de la distancia de cada punto a la recta que une los puntos
 * 3 lugares antes y 3 después. En un recorrido limpio (por pasos, o muy suave) sale casi 0; en uno de
 * GPS con ruido de ±1 m sale cerca de 0.8 m. La mediana no se deja engañar por las esquinas.
 */
export function estimateNoise(ring: readonly Pt[], k = 3): number {
  const n = ring.length;
  if (n < 2 * k + 3) return 0;
  const d = ring.map((p, i) => distToSegment(p, ring[(i + n - k) % n], ring[(i + k) % n]));
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

/** Simplifica un contorno cerrado: se parte en el punto más lejano del primero y se simplifican las dos mitades. */
function simplifyRing(ring: readonly Pt[], tol: number): Pt[] {
  let far = 0;
  let best = -1;
  ring.forEach((p, i) => {
    const d = len(sub(p, ring[0]));
    if (d > best) {
      best = d;
      far = i;
    }
  });
  const first = ring.slice(0, far + 1);
  const second = [...ring.slice(far), ring[0]];
  const a = rdpKeep(first, tol).map((i) => first[i]);
  const b = rdpKeep(second, tol).map((i) => second[i]);
  return [...a, ...b.slice(1, -1)];
}

/** Ángulo interior de un vértice de un contorno de 3 o más puntos (grados, 0 a 360). */
function interiorAt(ring: readonly Pt[], i: number, orientation: 1 | -1): number {
  const n = ring.length;
  const toPrev = unit(sub(ring[(i + n - 1) % n], ring[i]));
  const toNext = unit(sub(ring[(i + 1) % n], ring[i]));
  const from = orientation === 1 ? toNext : toPrev;
  const to = orientation === 1 ? toPrev : toNext;
  const a = (Math.atan2(cross(from, to), dot(from, to)) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

/** Quita vértices llanos y funde los lados demasiado cortos, de uno en uno, hasta que no quede ninguno. */
function prune(points: Pt[], minSide: number, flatDeg: number): Pt[] {
  const ring = [...points];
  for (let guard = 0; guard < 10000 && ring.length > 3; guard++) {
    let twice = 0;
    for (let i = 0; i < ring.length; i++) twice += cross(ring[i], ring[(i + 1) % ring.length]);
    const orientation: 1 | -1 = twice >= 0 ? 1 : -1;
    // 1) el vértice más llano, si está a menos de flatDeg de 180°
    let flat = -1;
    let flatGap = flatDeg;
    ring.forEach((_, i) => {
      const gap = Math.abs(interiorAt(ring, i, orientation) - 180);
      if (gap <= flatGap) {
        flatGap = gap;
        flat = i;
      }
    });
    if (flat >= 0) {
      ring.splice(flat, 1);
      continue;
    }
    // 2) el lado más corto, si no llega a minSide: se quita el extremo que menos cambia la forma
    let short = -1;
    let shortLen = minSide;
    ring.forEach((p, i) => {
      const l = len(sub(ring[(i + 1) % ring.length], p));
      if (l < shortLen) {
        shortLen = l;
        short = i;
      }
    });
    if (short < 0) break;
    const tri = (i: number) => {
      const n = ring.length;
      return Math.abs(cross(sub(ring[i], ring[(i + n - 1) % n]), sub(ring[(i + 1) % n], ring[i])));
    };
    const a = short;
    const b = (short + 1) % ring.length;
    ring.splice(tri(a) <= tri(b) ? a : b, 1);
  }
  return ring;
}

/**
 * Esquinas reales de un contorno. Un recorrido GPS trae cientos de puntos y rotular cada uno vuelve el
 * plano ilegible; aquí se queda solo con las esquinas:
 * 1) si el usuario marcó esquinas, son esas;
 * 2) si el contorno ya es pequeño (por pasos o con esquinas marcadas), se usa tal cual;
 * 3) si no, Ramer-Douglas-Peucker con una tolerancia que es lo mayor de: 2 % de la diagonal y 5 veces
 *    el ruido estimado del recorrido, entre 0.3 y 4 m (supera el ruido del GPS sin comerse esquinas de
 *    verdad: el ruido es absoluto, no depende del tamaño del terreno), y después se quitan los
 *    vértices llanos (ángulo a 5° o menos de 180°) y se funden los lados muy cortos (menos del 4 % de la
 *    diagonal). Si aun así hay demasiadas, se sube la tolerancia hasta el tope.
 * El contorno sigue cerrado y conserva su sentido.
 */
export function realCorners(points: readonly Pt[], options: CornerOptions = {}): RealCorners {
  const ring = cleanRing(points);
  if (options.marked && cleanRing(options.marked).length >= 3)
    return { points: cleanRing(options.marked), source: "marked", tolerance: 0 };
  if (ring.length <= (options.keepAsIs ?? KEEP_AS_IS))
    return { points: ring, source: "original", tolerance: 0 };

  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const base =
    options.tolerance ??
    Math.min(TOL_MAX_M, Math.max(TOL_MIN_M, diag * TOL_RATIO, NOISE_FACTOR * estimateNoise(ring)));
  const minSide = options.minSide ?? Math.max(MIN_SIDE_FLOOR_M, diag * MIN_SIDE_RATIO);
  const flatDeg = options.flatDeg ?? FLAT_DEG;
  const cap = options.maxCorners ?? MAX_CORNERS;

  let tol = base;
  let out = prune(simplifyRing(ring, tol), minSide, flatDeg);
  // si el contorno es muy enredado se sube la tolerancia (hasta 8 veces) hasta cumplir el tope
  for (let k = 0; k < 8 && out.length > cap; k++) {
    tol *= 1.5;
    out = prune(simplifyRing(ring, tol), minSide, flatDeg);
  }
  // un contorno que se simplifica por debajo de 3 puntos no sirve: se deja el original
  if (out.length < 3 || !polygonDims(out))
    return { points: ring, source: "original", tolerance: 0 };
  return { points: out, source: "simplified", tolerance: tol };
}
