// Importación de pistas desde un archivo JSON (EN-28, requisito 13). Acepta tres formas:
//  (a) la pista tal como la exporta la API (`GET /tracks/{id}/export`),
//  (b) el sobre `{format, version, track}` por si el backend lo adopta (pregunta abierta 10),
//  (c) el sobre v2 del prototipo `{app:"trazador-de-pistas", v:2, pista, perfil}`.
// El resultado es una pista sin id que se abre como «sin guardar»: guardarla la crea con POST.
import { useCallback } from "react";
import { normalizeTrack, validateTrack } from "@/domain/track/limits";
import { fromPrototypeV2, isPrototypeV2 } from "@/domain/track/prototypeV2";
import type { Track } from "@/domain/track/types";
import { trackFromWire } from "@/infrastructure/http/tracks";

/** Tope de tamaño del archivo (1 MB): una pista de 500 puntos pesa unos 40 KB. */
export const MAX_IMPORT_BYTES = 1_000_000;

export type ImportResult =
  | { ok: true; track: Track; notices: string[] }
  | { ok: false; message: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Convierte el texto de un archivo en una pista lista para abrir, o explica por qué no sirve. */
export function parseTrackFile(
  text: string,
  /** Ids de los perfiles que existen en la API; `null` si todavía no se cargaron. */
  knownProfileIds: readonly string[] | null,
): ImportResult {
  if (text.length > MAX_IMPORT_BYTES)
    return { ok: false, message: "El archivo pesa más de 1 MB: no parece una pista." };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "El archivo no es un JSON válido." };
  }
  let track: Track;
  let wantedProfile: string | null;
  try {
    if (isPrototypeV2(data) || (isObject(data) && Array.isArray(data.pts))) {
      const r = fromPrototypeV2(data);
      track = r.track;
      wantedProfile = r.profileId;
    } else {
      // Sobre `{format, version, track}`: se abre y se lee la pista de dentro.
      const inner = isObject(data) && isObject(data.track) ? data.track : data;
      track = trackFromWire(inner);
      wantedProfile = track.profileId;
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "El archivo no es una pista del Trazador.",
    };
  }

  const notices: string[] = [];
  const normalized = normalizeTrack({ ...track, profileId: null });
  notices.push(...normalized.warnings);
  track = normalized.track;
  const errors = validateTrack(track);
  if (errors.length > 0) {
    const shown = errors
      .slice(0, 3)
      .map((e) => e.message)
      .join(" · ");
    const more = errors.length > 3 ? ` (y ${errors.length - 3} más)` : "";
    return { ok: false, message: `La pista no cumple los límites: ${shown}${more}` };
  }
  if (wantedProfile) {
    if (knownProfileIds?.includes(wantedProfile)) track = { ...track, profileId: wantedProfile };
    else
      notices.push(
        `El perfil «${wantedProfile}» no existe en la API: la pista quedó sin perfil. Elige uno para verificarla.`,
      );
  }
  return { ok: true, track, notices };
}

/** Lee un archivo como texto (con `FileReader`, que existe en todos los navegadores y en jsdom). */
const readText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

export interface TrackImport {
  /** Lee el archivo elegido por el piloto. */
  readFile: (file: File) => Promise<ImportResult>;
}

export function useTrackImport(knownProfileIds: readonly string[] | null): TrackImport {
  const readFile = useCallback(
    async (file: File): Promise<ImportResult> => {
      if (file.size > MAX_IMPORT_BYTES)
        return { ok: false, message: "El archivo pesa más de 1 MB: no parece una pista." };
      try {
        return parseTrackFile(await readText(file), knownProfileIds);
      } catch {
        return { ok: false, message: "No se pudo leer el archivo." };
      }
    },
    [knownProfileIds],
  );
  return { readFile };
}
