// Comandos de edición puros (portados de las funciones de edición del prototipo, ~1663-1745).
// Cada comando recibe una pista y devuelve una pista nueva; nunca mutan la entrada.
import { build, edgesOf } from "@/domain/track/geometry";
import type { Track, TrackZone } from "@/domain/track/types";

/** Redondeo a un decimal, como el prototipo. */
export const r1 = (v: number): number => Math.round(v * 10) / 10;

const clonePoints = (track: Track) => track.points.map((p) => ({ ...p }));

/** Agrega un punto al final de la línea. */
export function appendPoint(track: Track, x: number, y: number, radius: number): Track {
  return {
    ...track,
    points: [...clonePoints(track), { x: r1(x), y: r1(y), radius: +radius || 0, gap: false }],
  };
}

/** Cierra el circuito (necesita al menos 3 puntos). */
export function closeTrack(track: Track): Track | null {
  if (track.points.length < 3 || track.closed) return null;
  return { ...track, closed: true };
}

/** Inserta un punto en la arista `ei`, cerca de la proyección de (x, y). */
export function insertPointAt(
  track: Track,
  ei: number,
  x: number,
  y: number,
  radius: number,
): { track: Track; index: number } | null {
  const edge = edgesOf(track)[ei];
  if (!edge) return null;
  const [i, j] = edge;
  const A = track.points[i];
  const B = track.points[j];
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0.02, Math.min(0.98, ((x - A.x) * dx + (y - A.y) * dy) / L2));
  const points = clonePoints(track);
  points.splice(i + 1, 0, {
    x: r1(A.x + dx * t),
    y: r1(A.y + dy * t),
    radius: +radius || 0,
    gap: false,
  });
  const start =
    track.start.edge > ei ? { ...track.start, edge: track.start.edge + 1 } : { ...track.start };
  return { track: { ...track, points, start }, index: i + 1 };
}

/** Borra puntos; si quedan menos de 3 abre el circuito y si la salida queda fuera de rango la reinicia. */
export function deletePoints(track: Track, idxs: number[]): Track {
  const set = new Set(idxs);
  const points = track.points.filter((_, i) => !set.has(i)).map((p) => ({ ...p }));
  const closed = points.length < 3 ? false : track.closed;
  const next: Track = { ...track, points, closed };
  const start = track.start.edge >= edgesOf(next).length ? { edge: 0, t: 0.5 } : { ...track.start };
  return { ...next, start };
}

/** Fija el radio de varios puntos (mínimo 0). */
export function setRadius(track: Track, idxs: number[], radius: number): Track {
  const points = clonePoints(track);
  idxs.forEach((i) => {
    if (points[i]) points[i].radius = Math.max(0, r1(radius));
  });
  return { ...track, points };
}

/** Cambia el largo de un tramo moviendo su punto final a lo largo de la misma dirección. */
export function setEdgeLength(track: Track, ei: number, length: number): Track {
  const edge = edgesOf(track)[ei];
  if (!edge) return track;
  const [i, j] = edge;
  const points = clonePoints(track);
  const A = points[i];
  const B = points[j];
  const cur = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  B.x = r1(A.x + ((B.x - A.x) / cur) * length);
  B.y = r1(A.y + ((B.y - A.y) / cur) * length);
  return { ...track, points };
}

/** Marca o quita el corte del tramo que sale del punto `i`. */
export function toggleGap(track: Track, i: number): Track {
  if (!track.points[i]) return track;
  const points = clonePoints(track);
  points[i].gap = !points[i].gap;
  return { ...track, points };
}

/** Invierte el sentido de la línea, conservando cortes y salida. */
export function reverseTrack(track: Track): Track {
  const n = track.points.length;
  const oldGap = track.points.map((p) => !!p.gap);
  const E = edgesOf(track).length;
  const points = clonePoints(track).reverse();
  points.forEach((p, k) => {
    p.gap = track.closed ? oldGap[(n - 2 - k + n) % n] : k < n - 1 ? oldGap[n - 2 - k] : false;
  });
  const se = track.start.edge;
  const start = {
    edge: track.closed ? (n - 2 - se + n) % n : Math.max(0, E - 1 - se),
    t: 1 - track.start.t,
  };
  return { ...track, points, start };
}

/** Ajusta el radio del vértice `i` y el de sus vecinos recortados a lo que realmente entra. */
export function fixRadii(track: Track, i: number): Track {
  const V = build(track).V;
  const n = track.points.length;
  const todo = new Set([i]);
  let grow = true;
  while (grow) {
    grow = false;
    for (const k of [...todo])
      for (const m of [(k - 1 + n) % n, (k + 1) % n])
        if (!todo.has(m) && V[m] && V[m].r > 0 && V[m].r - V[m].rEff > 0.15) {
          todo.add(m);
          grow = true;
        }
  }
  const points = clonePoints(track);
  todo.forEach((k) => {
    points[k].radius = Math.floor(V[k].rEff * 10) / 10;
  });
  return { ...track, points };
}

/** Agrega una zona prohibida. */
export function addZone(track: Track, zone: TrackZone): Track {
  return { ...track, zones: [...track.zones.map((z) => ({ ...z })), zone] };
}

/** Borra zonas por índice. */
export function deleteZones(track: Track, idxs: number[]): Track {
  const set = new Set(idxs);
  return { ...track, zones: track.zones.filter((_, i) => !set.has(i)).map((z) => ({ ...z })) };
}
