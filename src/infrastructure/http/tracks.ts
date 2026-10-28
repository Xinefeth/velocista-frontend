// Cliente REST de pistas (EN-28) sobre `request()`: JWT y gestión del 401 ya resueltos allí.
// Actúa como anti-corruption layer: traduce el contrato (snake_case) al modelo `Track` del dominio.
// Contrato fijo con el backend: GET/POST /tracks, GET/PUT/DELETE /tracks/{id}, GET /tracks/{id}/export.
import { lengthCmOf } from "@/domain/track/limits";
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Cuerpo de POST/PUT: calcula `length_cm` con la geometría (redondeado a 0,01) y no envía campos de solo lectura. */
export function toTrackBody(track: Track): TrackBodyApi {
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
    length_cm: lengthCmOf(track),
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
