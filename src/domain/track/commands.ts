// Comandos de edición puros (portados de las funciones de edición del prototipo, ~1663-1745).
// Cada comando recibe una pista y devuelve una pista nueva; nunca mutan la entrada.
import { build, edgesOf } from "@/domain/track/geometry";
import { TRACK_LIMITS } from "@/domain/track/limits";
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

/** Pista vacía para empezar a dibujar (igual que `blankDoc` del prototipo). */
export function blankTrack(): Track {
  return {
    id: null,
    name: "Pista nueva",
    board: { widthCm: 300, heightCm: 250 },
    closed: false,
    points: [],
    zones: [],
    start: { edge: 0, t: 0.5 },
    profileId: null,
  };
}

/** Mueve la bandera de salida al punto de un tramo recto más cercano a (wx, wy). */
export function moveStartTo(track: Track, wx: number, wy: number): Track {
  let best: { d: number; edge: number; t: number } | null = null;
  for (const st of build(track).straights) {
    const dx = st.b.x - st.a.x;
    const dy = st.b.y - st.a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((wx - st.a.x) * dx + (wy - st.a.y) * dy) / L2));
    const d = Math.hypot(wx - (st.a.x + dx * t), wy - (st.a.y + dy * t));
    if (!best || d < best.d) best = { d, edge: st.e, t };
  }
  if (!best) return track;
  return { ...track, start: { edge: best.edge, t: Math.round(best.t * 1000) / 1000 } };
}

/** Cambia el nombre de la pista. */
export const setName = (track: Track, name: string): Track => ({ ...track, name });

/** Cambia el tamaño del tablero. */
export const setBoard = (track: Track, widthCm: number, heightCm: number): Track => ({
  ...track,
  board: { widthCm, heightCm },
});

/** Cambia el perfil asociado a la pista. */
export const setProfile = (track: Track, profileId: string | null): Track => ({
  ...track,
  profileId,
});

/** Abre o cierra el circuito (cerrar necesita al menos 3 puntos). */
export function setClosed(track: Track, closed: boolean): Track | null {
  if (closed && track.points.length < 3) return null;
  return track.closed === closed ? track : { ...track, closed };
}

/** Lado mínimo de una zona al dibujarla o redimensionarla, en cm. */
export const MIN_ZONE_CM = 2;

/** Zona nueva a partir de dos esquinas (cualquier orden); `null` si es muy pequeña o ya hay 100 zonas. */
export function newZone(
  track: Track,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Track | null {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  if (w < MIN_ZONE_CM || h < MIN_ZONE_CM || track.zones.length >= TRACK_LIMITS.zones[1])
    return null;
  const zone: TrackZone = {
    x: r1(Math.min(x0, x1)),
    y: r1(Math.min(y0, y1)),
    width: r1(w),
    height: r1(h),
    name: "zona " + (track.zones.length + 1),
  };
  return addZone(track, zone);
}

/** Cambia datos de una zona (nombre, posición o tamaño). */
export function setZone(track: Track, i: number, patch: Partial<TrackZone>): Track {
  if (!track.zones[i]) return track;
  return { ...track, zones: track.zones.map((z, k) => (k === i ? { ...z, ...patch } : { ...z })) };
}

/** Mueve la zona `i` de `before` para que su esquina inferior izquierda quede en (x, y). */
export function moveZoneTo(before: Track, i: number, x: number, y: number): Track {
  return setZone(before, i, { x: r1(x), y: r1(y) });
}

/**
 * Redimensiona la zona `i` de `before` arrastrando su esquina inferior derecha a (cx, cy):
 * el borde izquierdo y el superior no se mueven (como el prototipo).
 */
export function resizeZone(before: Track, i: number, cx: number, cy: number): Track {
  const o = before.zones[i];
  if (!o) return before;
  const right = Math.max(o.x + MIN_ZONE_CM, cx);
  const bottom = Math.min(o.y + o.height - MIN_ZONE_CM, cy);
  return setZone(before, i, {
    width: r1(right - o.x),
    y: r1(bottom),
    height: r1(o.y + o.height - bottom),
  });
}

/** Copia la zona `i` un poco desplazada; `null` si ya hay 100 zonas. */
export function duplicateZone(track: Track, i: number): Track | null {
  const z = track.zones[i];
  if (!z || track.zones.length >= TRACK_LIMITS.zones[1]) return null;
  return addZone(track, {
    ...z,
    x: r1(z.x + 10),
    y: r1(z.y - 10),
    name: (z.name || "zona") + " (copia)",
  });
}

/** Borra los puntos y las zonas elegidos. */
export function deleteSelection(track: Track, sel: { points: number[]; zones: number[] }): Track {
  const withoutZones = sel.zones.length ? deleteZones(track, sel.zones) : track;
  return sel.points.length ? deletePoints(withoutZones, sel.points) : withoutZones;
}

/** Pone la salida en el tramo `ei`, en la proyección de (wx, wy) sobre el tramo recto. */
export function setStartAt(track: Track, ei: number, wx: number, wy: number): Track {
  const st = build(track).straights.find((s) => s.e === ei);
  let t = 0.5;
  if (st && st.L > 0)
    t = Math.max(
      0,
      Math.min(
        1,
        ((wx - st.a.x) * (st.b.x - st.a.x) + (wy - st.a.y) * (st.b.y - st.a.y)) / (st.L * st.L),
      ),
    );
  return { ...track, start: { edge: ei, t: Math.round(t * 1000) / 1000 } };
}

/**
 * Corrección de un clic del aviso «ajuste»: baja al radio que entra el vértice `i` y también sus vecinos
 * recortados (sus radios se calculan juntos, así que arreglar uno solo desplazaría el problema).
 */
export function fitRadii(track: Track, i: number): Track {
  const V = build(track).V;
  const n = track.points.length;
  const cut = (k: number) => !!V[k] && V[k].r > 0 && V[k].r - V[k].rEff > 0.15;
  const todo = new Set<number>([i]);
  for (let grown = true; grown; ) {
    grown = false;
    for (const k of [...todo])
      for (const m of [(k - 1 + n) % n, (k + 1) % n])
        if (!todo.has(m) && cut(m)) {
          todo.add(m);
          grown = true;
        }
  }
  const points = clonePoints(track);
  todo.forEach((k) => {
    if (points[k] && V[k]) points[k].radius = Math.floor(V[k].rEff * 10) / 10;
  });
  return { ...track, points };
}
