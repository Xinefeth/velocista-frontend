// Cliente REST de pistas (EN-28) sobre `request()`: JWT y gestión del 401 ya resueltos allí.
// Actúa como anti-corruption layer: traduce el contrato (snake_case) al modelo `Track` del dominio.
// Contrato fijo con el backend: GET/POST /tracks, GET/PUT/DELETE /tracks/{id}, GET /tracks/{id}/export.
import { measures } from "@/domain/track/measures";
import type { Track } from "@/domain/track/types";
import type { TrackApi, TrackBodyApi, TrackPageApi } from "@/infrastructure/contracts/tracks";
import { request, requestFile } from "@/infrastructure/http/api";

/** Tamaño de página al listar (como el resto de listas de la consola). */
export const TRACK_PAGE_SIZE = 200;

/** Traduce el recurso de la API al modelo de dominio. */
export function toTrack(r: TrackApi): Track {
  return {
    id: r.id,
    name: r.name,
    board: { widthCm: r.board.width_cm, heightCm: r.board.height_cm },
    closed: r.closed,
    points: r.points.map((p) => ({ x: p.x, y: p.y, radius: p.radius, gap: p.gap })),
    zones: r.zones.map((z) => ({ x: z.x, y: z.y, width: z.width, height: z.height, name: z.name })),
    start: { edge: r.start.edge, t: r.start.t },
    profileId: r.profile_id,
    lengthCm: r.length_cm,
    perimeterCm: r.perimeter_cm ?? null,
    areaCm2: r.area_cm2 ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Cuerpo de POST/PUT: calcula `length_cm` con la geometría (redondeado a 0,01) y no envía campos de solo lectura. */
export function toTrackBody(track: Track): TrackBodyApi {
  // Largo, perímetro y área se recalculan siempre de la geometría: nunca se envía un valor viejo.
  const m = measures(track);
  return {
    name: track.name.trim(),
    board: { width_cm: track.board.widthCm, height_cm: track.board.heightCm },
    closed: track.closed,
    points: track.points.map((p) => ({ x: p.x, y: p.y, radius: p.radius, gap: p.gap })),
    zones: track.zones.map((z) => ({
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      name: z.name,
    })),
    start: { edge: track.start.edge, t: track.start.t },
    profile_id: track.profileId,
    length_cm: m.lengthCm,
    perimeter_cm: m.perimeterCm,
    area_cm2: m.areaCm2,
  };
}

/** JSON de una pista sin guardar, con la misma forma que devuelve GET /tracks/{id} (sin campos de solo lectura). */
export const trackToJson = (track: Track): string => JSON.stringify(toTrackBody(track), null, 2);

const idPath = (id: number) => `/tracks/${encodeURIComponent(String(id))}`;

export const tracksApi = {
  /** Lista todas las pistas, página por página, hasta llegar a `total`. */
  async list(): Promise<Track[]> {
    const records: TrackApi[] = [];
    let page: TrackPageApi;
    do {
      page = await request<TrackPageApi>(
        `/tracks?limit=${TRACK_PAGE_SIZE}&offset=${records.length}`,
      );
      records.push(...page.items);
    } while (page.items.length > 0 && records.length < page.total);
    return records.map(toTrack);
  },
  async get(id: number): Promise<Track> {
    return toTrack(await request<TrackApi>(idPath(id)));
  },
  /** Crea una pista nueva (también sirve para importar). */
  async create(track: Track): Promise<Track> {
    return toTrack(
      await request<TrackApi>("/tracks", {
        method: "POST",
        body: JSON.stringify(toTrackBody(track)),
      }),
    );
  },
  /** Reemplaza una pista guardada (PUT completo; el último que guarda gana). */
  async update(track: Track): Promise<Track> {
    if (track.id === null) throw new Error("La pista aún no está guardada");
    return toTrack(
      await request<TrackApi>(idPath(track.id), {
        method: "PUT",
        body: JSON.stringify(toTrackBody(track)),
      }),
    );
  },
  async remove(id: number): Promise<void> {
    await request<null>(idPath(id), { method: "DELETE" });
  },
  /** JSON de exportación tal como lo entrega el servidor y el nombre sugerido (Content-Disposition). */
  exportJson(id: number): Promise<{ text: string; filename: string | null }> {
    return requestFile(`${idPath(id)}/export`);
  },
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Lee una pista con la forma del contrato (la que exporta la API: `board.width_cm`, `profile_id`…) y la
 * traduce al dominio, sin id. Ignora largo, perímetro, área y fechas (se recalculan). Lanza `Error` con un
 * mensaje claro si falta algo o tiene el tipo equivocado. No ejecuta ni interpreta nada del contenido.
 */
export function trackFromWire(data: unknown): Track {
  if (!isObject(data)) throw new Error("El archivo no contiene una pista.");
  if (typeof data.name !== "string") throw new Error("Falta el nombre de la pista (name).");
  const board = data.board;
  if (!isObject(board) || !isNum(board.width_cm) || !isNum(board.height_cm))
    throw new Error("Falta el tablero (board.width_cm y board.height_cm).");
  if (!Array.isArray(data.points)) throw new Error("Falta la lista de puntos (points).");
  const points = data.points.map((p, i) => {
    if (!isObject(p) || !isNum(p.x) || !isNum(p.y))
      throw new Error(`El punto ${i + 1} no tiene coordenadas x e y numéricas.`);
    if (p.radius !== undefined && !isNum(p.radius))
      throw new Error(`El radio del punto ${i + 1} no es un número.`);
    return { x: p.x, y: p.y, radius: isNum(p.radius) ? p.radius : 0, gap: p.gap === true };
  });
  const zonesRaw = data.zones === undefined ? [] : data.zones;
  if (!Array.isArray(zonesRaw)) throw new Error("La lista de zonas (zones) no es válida.");
  const zones = zonesRaw.map((z, i) => {
    if (!isObject(z) || !isNum(z.x) || !isNum(z.y) || !isNum(z.width) || !isNum(z.height))
      throw new Error(`La zona ${i + 1} necesita x, y, width y height numéricos.`);
    return { x: z.x, y: z.y, width: z.width, height: z.height, name: String(z.name ?? "") };
  });
  const start = isObject(data.start) ? data.start : {};
  return {
    id: null,
    name: data.name,
    board: { widthCm: board.width_cm, heightCm: board.height_cm },
    closed: data.closed === true,
    points,
    zones,
    start: { edge: isNum(start.edge) ? start.edge : 0, t: isNum(start.t) ? start.t : 0.5 },
    profileId: typeof data.profile_id === "string" ? data.profile_id : null,
  };
}
