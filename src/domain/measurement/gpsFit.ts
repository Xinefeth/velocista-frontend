// ¿Sirve el GPS en un lugar de este tamaño? (SP-06, HU-37): lo comparten la consola (error del GPS)
// y la página del celular (aviso de lugar chico), para que haya una sola regla.
import { fmtEs } from "@/domain/measurement/labels";

/** Error máximo aceptado frente a lo medido para decir que el GPS «sirve» (lo usa el backend). */
export const TARGET_PCT = 10;

/** Veredicto para un lugar cuyo lado más corto mide `side` metros. */
export function gpsFits(side: number, minSide: number | null) {
  if (minSide == null) return null;
  if (!(side > 0)) return { tone: "warn" as const, title: "Escribe el lado más corto del lugar" };
  if (side >= minSide)
    return {
      tone: "good" as const,
      title: "Sí, el GPS sirve en este lugar",
      sub: `Con un lado de ${fmtEs(side, 0)} m el error del GPS queda bajo el ${TARGET_PCT} %.`,
    };
  return {
    tone: "bad" as const,
    title: "No, el lugar es chico para el GPS",
    sub: `Hace falta un lado de al menos ${fmtEs(minSide, 0)} m. Mide por pasos.`,
  };
}

/** Por encima de este tamaño (m) se considera que el valor sale de una lectura o una prueba mala. */
export const MAX_PLAUSIBLE_MIN_SIDE_M = 500;

/** ¿Es un tamaño creíble para un terreno a pie? Finito, mayor que 0 y hasta 500 m. */
export const isPlausibleSize = (value: number | null | undefined): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_PLAUSIBLE_MIN_SIDE_M;

/** Error de cierre (%) por debajo del cual la medición se considera confiable. */
export const RELIABLE_CLOSURE_PCT = 3;

/**
 * Avisos del servidor que se muestran: «lugar chico para el GPS» se oculta si el tamaño en que se
 * basa (`min_gps_size_m`) no es creíble (0, negativo, NaN o absurdo): sería avisar por una lectura mala.
 */
export function visibleWarnings(
  warnings: readonly string[],
  minGpsSizeM: number | null | undefined,
): string[] {
  return warnings.filter((w) => w !== "gps_space_too_small" || isPlausibleSize(minGpsSizeM));
}

interface XY {
  x: number;
  y: number;
}

/** Envolvente convexa (cadena monótona de Andrew); quita puntos repetidos y colineales. */
function convexHull(points: XY[]): XY[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const build = (list: XY[]) => {
    const out: XY[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(pts), ...build([...pts].reverse())];
}

/**
 * Lado corto del terreno (m): el menor ancho del rectángulo envolvente girado, que es el menor ancho
 * de la envolvente convexa y se alcanza sobre uno de sus lados. En un terreno alargado perímetro / 4
 * (o el lado largo) sale muy distinto del lado que de verdad limita al GPS. `null` si el trazo no
 * encierra área (menos de 3 puntos distintos, puntos alineados o coordenadas no finitas).
 */
export function shortSide(points: readonly XY[] | null | undefined): number | null {
  if (!points || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const hull = convexHull(points as XY[]);
  if (hull.length < 3) return null;
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    // ancho del trazo perpendicular a este lado: la mayor distancia de un punto a la recta
    let far = 0;
    for (const p of hull)
      far = Math.max(far, Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len);
    best = Math.min(best, far);
  }
  return Number.isFinite(best) && best > 0 ? best : null;
}

/**
 * Lado corto (m) y mínimo, si el terreno de una medición cerrada es chico para el GPS según el error
 * medido en SP-06; `null` si alcanza, si falta alguno de los dos o si alguno no es creíble (0,
 * negativo, NaN o absurdo): no se avisa por una lectura mala.
 */
export function smallField(
  side: number | null,
  minSide: number | null,
): { side: number; minSide: number } | null {
  if (!isPlausibleSize(side) || !isPlausibleSize(minSide)) return null;
  return gpsFits(side, minSide)?.tone === "bad" ? { side, minSide } : null;
}
