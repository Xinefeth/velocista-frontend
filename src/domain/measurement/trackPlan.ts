// CU-1 · Lleva una pista guardada en el Trazador (dibujo en cm sobre el tablero) a tamaño real
// (metros) para usarla como plano de referencia en Odometría. Funciones puras, sin DOM ni red.
import { build, crossings } from "@/domain/track/geometry";
import type { Track } from "@/domain/track/types";
import { area, perimeter, type Pt } from "@/domain/measurement/plot";
import { vertexName } from "@/domain/measurement/dimensions";

/** Escala elegida: 1:N, o el largo real de uno de los lados dibujados. */
export type PlanScale =
  | { kind: "ratio"; n: number }
  | { kind: "side"; index: number; realM: number };

export interface TrackPlan {
  /** Contorno con las curvas muestreadas, en metros, primer vértice dibujado en (0, 0). */
  contour: Pt[];
  /** Vértices dibujados (sin arcos), en metros: sirven para lados y ángulos. */
  corners: Pt[];
  perimeter_m: number;
  area_m2: number;
  rounded: boolean;
  /** Escala efectiva 1:N (útil cuando se dio el largo real de un lado). */
  scaleN: number;
  name: string;
}

export interface DrawnSide {
  index: number;
  name: string;
  lengthCm: number;
}

/** Cada cuántos cm del dibujo se conserva una muestra del contorno (como `designPath`). */
export const PLAN_SAMPLE_CM = 5;

export const TRACK_PLAN_SCALE_ERROR = "Escribe la escala 1:N o el largo real de un lado.";
export const TRACK_PLAN_OPEN = "La pista está abierta: cierra el circuito en el Trazador";
export const TRACK_PLAN_CROSSES = "La línea de la pista se cruza: no encierra un área";
export const TRACK_PLAN_FEW_POINTS = "La pista necesita al menos 3 vértices.";

/** Por qué una pista no sirve como plano, o `null` si sirve (la lista no la ofrece si hay motivo). */
export function trackPlanProblem(track: Track): string | null {
  if (track.points.length < 3) return TRACK_PLAN_FEW_POINTS;
  if (!track.closed) return TRACK_PLAN_OPEN;
  // el área guardada puede faltar en pistas viejas: el cruce se decide siempre con la geometría
  return crossings(build(track).pts, true).length ? TRACK_PLAN_CROSSES : null;
}

/** Giro (°) en `b` al ir de `a` a `c`. */
function turnDeg(a: Pt, b: Pt, c: Pt): number {
  const t1 = Math.atan2(b.y - a.y, b.x - a.x);
  const t2 = Math.atan2(c.y - b.y, c.x - b.x);
  const d = Math.abs(t2 - t1) % (2 * Math.PI);
  return ((d > Math.PI ? 2 * Math.PI - d : d) * 180) / Math.PI;
}
/** Giro mínimo para tratar una muestra como esquina viva y conservarla. */
const SHARP_DEG = 10;

/** Lados dibujados (AB, BC…) con su largo en cm del tablero. */
export function drawnSides(track: Pick<Track, "points" | "closed">): DrawnSide[] {
  const P = track.points;
  const n = P.length;
  const count = track.closed ? n : n - 1;
  const out: DrawnSide[] = [];
  for (let i = 0; i < count; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    out.push({
      index: i,
      name: `${vertexName(i)}${vertexName((i + 1) % n)}`,
      lengthCm: Math.hypot(b.x - a.x, b.y - a.y),
    });
  }
  return out;
}

/** Lado dibujado más largo (el que se propone para dar el largo real). */
export function longestSide(track: Pick<Track, "points" | "closed">): number {
  const sides = drawnSides(track);
  return sides.reduce(
    (best, s) => (s.lengthCm > (sides[best]?.lengthCm ?? -1) ? s.index : best),
    0,
  );
}

/** Metros por cada cm dibujado, o `null` si la escala no sirve. */
function factorOf(track: Track, scale: PlanScale): number | null {
  const ok = (v: number) => Number.isFinite(v) && v > 0;
  if (scale.kind === "ratio") return ok(scale.n) ? scale.n / 100 : null;
  const side = drawnSides(track)[scale.index];
  if (!side || !ok(scale.realM) || !ok(side.lengthCm)) return null;
  return scale.realM / (side.lengthCm / 100) / 100;
}

/**
 * Plano a tamaño real de una pista guardada. Perímetro y área son los del contorno dibujado
 * (con sus arcos); los lados y ángulos salen de los vértices dibujados (esquina a esquina).
 */
export function trackPlan(track: Track, scale: PlanScale): TrackPlan | { error: string } {
  const problem = trackPlanProblem(track);
  if (problem) return { error: problem };
  const factor = factorOf(track, scale);
  if (factor === null) return { error: TRACK_PLAN_SCALE_ERROR };
  const o = track.points[0];
  const move = (p: { x: number; y: number }): Pt => ({
    x: (p.x - o.x) * factor,
    y: (p.y - o.y) * factor,
  });
  const samples = build(track).pts;
  const step = Math.max(1, Math.round(PLAN_SAMPLE_CM / 0.5));
  const contour: Pt[] = [];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    // se conservan una de cada `step` muestras y todas las esquinas vivas (sin arco)
    if (
      i % step === 0 ||
      turnDeg(samples[(i + n - 1) % n], samples[i], samples[(i + 1) % n]) > SHARP_DEG
    )
      contour.push(move(samples[i]));
  }
  const corners = track.points.map(move);
  return {
    contour,
    corners,
    perimeter_m: perimeter(contour),
    area_m2: Math.abs(area(contour)),
    rounded: track.points.some((p) => p.radius > 0),
    scaleN: factor * 100,
    name: track.name,
  };
}

export const isTrackPlanError = (r: TrackPlan | { error: string }): r is { error: string } =>
  "error" in r;

/** Lo que el usuario eligió en el selector: pista y escala tal como se escriben. */
export interface TrackPick {
  trackId: number | null;
  mode: "ratio" | "side";
  /** Escala 1:N escrita (por defecto 1). */
  n: string;
  /** Lado dibujado del que se da el largo real; `null` = el más largo. */
  side: number | null;
  /** Largo real (m) de ese lado, escrito. */
  realM: string;
}

export const EMPTY_PICK: TrackPick = {
  trackId: null,
  mode: "ratio",
  n: "1",
  side: null,
  realM: "",
};

const parseNum = (v: string): number => (v.trim() ? Number(v.trim().replace(",", ".")) : NaN);

/** Escala que describe lo escrito (puede ser inválida: `trackPlan` lo dice con su error). */
export function scaleOfPick(track: Track, pick: TrackPick): PlanScale {
  return pick.mode === "ratio"
    ? { kind: "ratio", n: parseNum(pick.n) }
    : { kind: "side", index: pick.side ?? longestSide(track), realM: parseNum(pick.realM) };
}

/** Plano de lo elegido, `null` si aún no se eligió pista (o ya no existe en la lista). */
export function planOfPick(
  tracks: readonly Track[],
  pick: TrackPick,
): TrackPlan | { error: string } | null {
  const track = tracks.find((t) => t.id === pick.trackId);
  return track ? trackPlan(track, scaleOfPick(track, pick)) : null;
}
