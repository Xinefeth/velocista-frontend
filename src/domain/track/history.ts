// Historial deshacer/rehacer puro (máx. 200 pasos), portado de `commit/undo/redo` del prototipo.
// Es genérico y solo guarda en memoria; un paso por gesto.

export const HISTORY_LIMIT = 200;

export interface History<T> {
  past: T[];
  future: T[];
}

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** Registra el estado previo a un cambio; el rehacer se descarta. */
export function pushHistory<T>(h: History<T>, before: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...h.past, before];
  if (past.length > limit) past.shift();
  return { past, future: [] };
}

/** Deshace: devuelve el estado anterior y el historial nuevo, o `null` si no hay. */
export function undoHistory<T>(
  h: History<T>,
  current: T,
): { value: T; history: History<T> } | null {
  if (!h.past.length) return null;
  const past = h.past.slice(0, -1);
  return { value: h.past[h.past.length - 1], history: { past, future: [...h.future, current] } };
}

/** Rehace: devuelve el estado siguiente y el historial nuevo, o `null` si no hay. */
export function redoHistory<T>(
  h: History<T>,
  current: T,
): { value: T; history: History<T> } | null {
  if (!h.future.length) return null;
  const future = h.future.slice(0, -1);
  return { value: h.future[h.future.length - 1], history: { past: [...h.past, current], future } };
}

/** Igualdad estructural barata para detectar comandos sin efecto. */
export const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
