// Borrador local del Trazador de pistas (EN-28): copia de seguridad del trabajo SIN guardar.
// No es un almacén de pistas (esas viven solo en la API): sirve para que un 401, un cierre de pestaña
// o una recarga no pierdan lo que el piloto estaba editando. Una clave por pista (`id` o `new`), así que
// dos pestañas con pistas distintas no se pisan. No guarda el JWT ni ningún secreto: solo la pista.
import type { Track } from "@/domain/track/types";

export const DRAFT_PREFIX = "velocista.track-draft.v1:";
const VERSION = 1;

export interface TrackDraft {
  v: typeof VERSION;
  key: string;
  /** ISO 8601 del último guardado del borrador. */
  savedAt: string;
  track: Track;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** El almacén del navegador, o `null` si no existe o está bloqueado (modo privado, políticas). */
function defaultStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Clave del borrador: el id de la pista guardada, o `new` para las que aún no están en la API. */
export const draftKey = (id: number | null): string =>
  DRAFT_PREFIX + (id === null ? "new" : String(id));

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** ¿Tiene la forma de una pista? Un borrador corrupto o de otra versión se ignora. */
export function isTrackLike(x: unknown): x is Track {
  if (!isObject(x)) return false;
  if (typeof x.name !== "string" || typeof x.closed !== "boolean") return false;
  if (!(x.id === null || num(x.id))) return false;
  if (!(x.profileId === null || typeof x.profileId === "string")) return false;
  if (!isObject(x.board) || !num(x.board.widthCm) || !num(x.board.heightCm)) return false;
  if (!isObject(x.start) || !num(x.start.edge) || !num(x.start.t)) return false;
  if (!Array.isArray(x.points) || x.points.length > 5000) return false;
  if (
    !x.points.every(
      (p) => isObject(p) && num(p.x) && num(p.y) && num(p.radius) && typeof p.gap === "boolean",
    )
  )
    return false;
  if (!Array.isArray(x.zones) || x.zones.length > 1000) return false;
  return x.zones.every(
    (z) =>
      isObject(z) &&
      num(z.x) &&
      num(z.y) &&
      num(z.width) &&
      num(z.height) &&
      typeof z.name === "string",
  );
}

/** Guarda (o reemplaza) el borrador de la pista; devuelve si se pudo. */
export function saveDraft(
  track: Track,
  store: Store | null = defaultStore(),
  now = new Date(),
): boolean {
  if (!store) return false;
  const key = draftKey(track.id);
  const draft: TrackDraft = { v: VERSION, key, savedAt: now.toISOString(), track };
  try {
    store.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false; // sin espacio o bloqueado: el borrador es opcional
  }
}

function parse(key: string, raw: string | null): TrackDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<TrackDraft>;
    if (!isObject(d) || d.v !== VERSION || typeof d.savedAt !== "string" || !isTrackLike(d.track))
      return null;
    return { v: VERSION, key, savedAt: d.savedAt, track: d.track };
  } catch {
    return null;
  }
}

export function loadDraft(key: string, store: Store | null = defaultStore()): TrackDraft | null {
  if (!store) return null;
  try {
    return parse(key, store.getItem(key));
  } catch {
    return null;
  }
}

export function clearDraft(key: string, store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(key);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Todos los borradores válidos, del más reciente al más antiguo. Los corruptos se ignoran. */
export function listDrafts(store: Store | null = defaultStore()): TrackDraft[] {
  if (!store) return [];
  const out: TrackDraft[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key || !key.startsWith(DRAFT_PREFIX)) continue;
      const d = parse(key, store.getItem(key));
      if (d) out.push(d);
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
