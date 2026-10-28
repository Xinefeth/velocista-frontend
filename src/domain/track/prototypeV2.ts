// Importación del JSON del prototipo (formato v2): {app:"trazador-de-pistas", v:2, pista, perfil}.
// Se traduce al vocabulario del contrato (pts→points, r→radius, g→gap, w/h→width/height, e→edge).
// El perfil embebido NO se importa (las reglas vienen de la API); solo se devuelve su id.
import type { Track } from "@/domain/track/types";

export class TrackImportError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** ¿Es el sobre v2 del prototipo? */
export function isPrototypeV2(data: unknown): boolean {
  return isObject(data) && data.app === "trazador-de-pistas" && isObject(data.pista);
}

export interface PrototypeImport {
  /** Pista sin guardar (`id` nulo y sin perfil asignado). */
  track: Track;
  /** Id del perfil embebido; el llamador lo asigna solo si existe en la API. */
  profileId: string | null;
}

/** Traduce el sobre v2 a una pista de dominio; lanza `TrackImportError` si el formato no sirve. */
export function fromPrototypeV2(data: unknown): PrototypeImport {
  if (!isObject(data)) throw new TrackImportError("El archivo no es un objeto JSON");
  const pista = isObject(data.pista) ? data.pista : data;
  if (!Array.isArray(pista.pts)) throw new TrackImportError("Falta la lista de puntos (pts)");
  if (!isObject(pista.board)) throw new TrackImportError("Falta el tablero (board)");
  const w = pista.board.w;
  const h = pista.board.h;
  if (typeof w !== "number" || typeof h !== "number")
    throw new TrackImportError("El tablero no tiene ancho y alto");
  const points = pista.pts.map((raw, i) => {
    if (!isObject(raw) || typeof raw.x !== "number" || typeof raw.y !== "number")
      throw new TrackImportError(`El punto ${i + 1} no tiene coordenadas`);
    return { x: raw.x, y: raw.y, radius: num(raw.r, 0), gap: raw.g === true };
  });
  const zonesRaw = Array.isArray(pista.zones) ? pista.zones : [];
  const zones = zonesRaw.map((raw, i) => {
    if (!isObject(raw)) throw new TrackImportError(`La zona ${i + 1} no es válida`);
    return {
      x: num(raw.x, 0),
      y: num(raw.y, 0),
      width: num(raw.w, 0),
      height: num(raw.h, 0),
      name: typeof raw.name === "string" ? raw.name : "",
    };
  });
  const start = isObject(pista.start) ? pista.start : {};
  const perfil = isObject(data.perfil) ? data.perfil : null;
  return {
    track: {
      id: null,
      name: typeof pista.name === "string" && pista.name.trim() ? pista.name : "Pista importada",
      board: { widthCm: w, heightCm: h },
      closed: pista.closed === true,
      points,
      zones,
      start: { edge: num(start.e, 0), t: num(start.t, 0.5) },
      profileId: null,
    },
    profileId: perfil && typeof perfil.id === "string" ? perfil.id : null,
  };
}
