// Selección del editor: puntos, un tramo (arista) y zonas. Funciones puras sobre índices.
import type { Target } from "@/domain/track/transforms";
import { edgesOf } from "@/domain/track/geometry";
import type { Track } from "@/domain/track/types";

export interface Selection {
  /** Índices de los puntos seleccionados. */
  points: number[];
  /** Tramo elegido (sus dos puntos también quedan seleccionados), o `null`. */
  edge: number | null;
  /** Índices de las zonas seleccionadas. */
  zones: number[];
}

export const EMPTY_SELECTION: Selection = { points: [], edge: null, zones: [] };

/** Cantidad de objetos seleccionados (puntos + zonas). */
export const groupSize = (s: Selection): number => s.points.length + s.zones.length;

export const isEmptySelection = (s: Selection): boolean => groupSize(s) === 0;

/** Agrega o quita `i` de una lista sin duplicar. */
export const toggleIndex = (list: number[], i: number): number[] =>
  list.includes(i) ? list.filter((x) => x !== i) : [...list, i];

/** Selecciona solo un punto. */
export const pointSelection = (i: number): Selection => ({ points: [i], edge: null, zones: [] });

/** Selecciona los dos puntos de un tramo y recuerda el tramo. */
export function edgeSelection(track: Track, ei: number): Selection {
  const edge = edgesOf(track)[ei];
  return edge ? { points: [edge[0], edge[1]], edge: ei, zones: [] } : EMPTY_SELECTION;
}

/** Selecciona todos los puntos y todas las zonas. */
export const selectAll = (track: Track): Selection => ({
  points: track.points.map((_, i) => i),
  edge: null,
  zones: track.zones.map((_, i) => i),
});

/** Quita de la selección lo que ya no existe en la pista (tras borrar o deshacer). */
export function sanitizeSelection(s: Selection, track: Track): Selection {
  const points = s.points.filter((i) => i >= 0 && i < track.points.length);
  const zones = s.zones.filter((i) => i >= 0 && i < track.zones.length);
  const edge = s.edge !== null && s.edge < edgesOf(track).length ? s.edge : null;
  if (points.length === s.points.length && zones.length === s.zones.length && edge === s.edge)
    return s;
  return { points, edge: edge !== null && points.length >= 2 ? edge : null, zones };
}

/** Objetivo de una transformación de grupo. */
export const selectionTarget = (s: Selection): Target => ({ v: [...s.points], z: [...s.zones] });

/** ¿Es la misma selección? */
export const sameSelection = (a: Selection, b: Selection): boolean =>
  a.edge === b.edge &&
  a.points.length === b.points.length &&
  a.zones.length === b.zones.length &&
  a.points.every((v, i) => v === b.points[i]) &&
  a.zones.every((v, i) => v === b.zones[i]);
