// Límites de una pista y su validación antes de enviar a la API (EN-28, Requirement 10).
// Los valores los propone el backend y están pendientes del PO: viven solo aquí para poder cambiarlos.
import { build } from "@/domain/track/geometry";
import type { Track } from "@/domain/track/types";

export const TRACK_LIMITS = {
  nameLength: [1, 80],
  points: [2, 500],
  zones: [0, 100],
  boardCm: [50, 2000],
  radiusCm: [0, 200],
  /** |x| e |y| máximos en cm; los puntos pueden quedar fuera del tablero (lo detecta la regla `margin`). */
  coordAbsCm: 10000,
  /** Ancho y alto de zona: mayor que 0 y hasta este valor, en cm. */
  zoneSizeMaxCm: 2000,
  zoneNameLength: 80,
  startT: [0, 1],
  /** `length_cm` mayor que 0 y hasta este valor. */
  lengthCmMax: 100000,
} as const;

/** Error de validación con la misma ruta que devolvería el servidor (p. ej. `points[3].radius`). */
export interface LimitError {
  path: string;
  message: string;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Largo total de la línea en cm, redondeado a 0,01 (lo que se envía como `length_cm`). */
export function lengthCmOf(track: Track): number {
  return Math.round(build(track).L * 100) / 100;
}

/** Valida todos los límites; devuelve la lista de errores (vacía si la pista se puede guardar). */
export function validateTrack(track: Track): LimitError[] {
  const errs: LimitError[] = [];
  const add = (path: string, message: string) => errs.push({ path, message });
  const L = TRACK_LIMITS;
  const n = track.points.length;

  const name = track.name.trim();
  if (name.length < L.nameLength[0] || name.length > L.nameLength[1])
    add("name", `El nombre debe tener entre ${L.nameLength[0]} y ${L.nameLength[1]} caracteres`);

  if (n < L.points[0] || n > L.points[1])
    add("points", `La pista necesita entre ${L.points[0]} y ${L.points[1]} puntos (tiene ${n})`);
  if (track.zones.length > L.zones[1])
    add("zones", `Máximo ${L.zones[1]} zonas (tiene ${track.zones.length})`);

  const side = (path: string, v: number) => {
    if (!finite(v) || v < L.boardCm[0] || v > L.boardCm[1])
      add(path, `El tablero debe medir entre ${L.boardCm[0]} y ${L.boardCm[1]} cm por lado`);
  };
  side("board.width_cm", track.board.widthCm);
  side("board.height_cm", track.board.heightCm);

  track.points.forEach((p, i) => {
    for (const axis of ["x", "y"] as const) {
      const v = p[axis];
      if (!finite(v)) add(`points[${i}].${axis}`, "Debe ser un número finito");
      else if (Math.abs(v) > L.coordAbsCm)
        add(`points[${i}].${axis}`, `Debe estar entre -${L.coordAbsCm} y ${L.coordAbsCm} cm`);
    }
    if (!finite(p.radius) || p.radius < L.radiusCm[0] || p.radius > L.radiusCm[1])
      add(
        `points[${i}].radius`,
        `El radio debe estar entre ${L.radiusCm[0]} y ${L.radiusCm[1]} cm`,
      );
  });

  track.zones.forEach((z, i) => {
    for (const axis of ["x", "y"] as const) {
      const v = z[axis];
      if (!finite(v)) add(`zones[${i}].${axis}`, "Debe ser un número finito");
      else if (Math.abs(v) > L.coordAbsCm)
        add(`zones[${i}].${axis}`, `Debe estar entre -${L.coordAbsCm} y ${L.coordAbsCm} cm`);
    }
    for (const dim of ["width", "height"] as const) {
      const v = z[dim];
      if (!finite(v) || v <= 0 || v > L.zoneSizeMaxCm)
        add(`zones[${i}].${dim}`, `Debe ser mayor que 0 y como máximo ${L.zoneSizeMaxCm} cm`);
    }
    if (z.name.length > L.zoneNameLength)
      add(`zones[${i}].name`, `Máximo ${L.zoneNameLength} caracteres`);
  });

  if (track.closed && n < 3) add("closed", "Un circuito cerrado necesita al menos 3 puntos");

  if (!finite(track.start.t) || track.start.t < L.startT[0] || track.start.t > L.startT[1])
    add("start.t", "La salida debe estar entre 0 y 1");
  const maxEdge = track.closed ? n - 1 : n - 2;
  if (
    !Number.isInteger(track.start.edge) ||
    track.start.edge < 0 ||
    track.start.edge > Math.max(0, maxEdge)
  )
    add("start.edge", `El tramo de salida debe ser un entero entre 0 y ${Math.max(0, maxEdge)}`);

  // El largo solo se calcula si la geometría es válida (números finitos).
  if (
    !errs.some((e) => e.path.startsWith("points[") || e.path === "points" || e.path === "closed")
  ) {
    const len = lengthCmOf(track);
    if (!(len > 0) || len > L.lengthCmMax)
      add("length_cm", `El largo debe ser mayor que 0 y como máximo ${L.lengthCmMax} cm`);
  }
  return errs;
}

export interface NormalizeResult {
  track: Track;
  /** Avisos para el piloto sobre lo que se corrigió. */
  warnings: string[];
}

/**
 * Deja la pista en un estado que la API acepta: `closed` solo con ≥ 3 puntos y `start` dentro de rango.
 * (En el prototipo `build()` ignora `closed` con n < 3 y su UI nunca lo activa; solo un archivo importado
 * puede llegar a ese estado.)
 */
export function normalizeTrack(track: Track): NormalizeResult {
  const warnings: string[] = [];
  const n = track.points.length;
  let closed = track.closed;
  if (closed && n < 3) {
    closed = false;
    warnings.push("Un circuito cerrado necesita al menos 3 puntos: la pista quedó abierta.");
  }
  const maxEdge = Math.max(0, closed ? n - 1 : n - 2);
  let edge = Number.isFinite(track.start.edge) ? Math.round(track.start.edge) : 0;
  let t = Number.isFinite(track.start.t) ? track.start.t : 0.5;
  if (edge < 0 || edge > maxEdge) {
    edge = 0;
    t = 0.5;
    warnings.push("La salida estaba fuera de rango: se reinició al primer tramo.");
  }
  t = Math.max(0, Math.min(1, t));
  return { track: { ...track, closed, start: { edge, t } }, warnings };
}
