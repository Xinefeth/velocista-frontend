// Borrador local con clave por pista: escribe mientras hay cambios sin guardar y los ofrece al volver.
// Sirve para que un 401 (la consola se desmonta al pedir iniciar sesión), una recarga o el cierre de la
// pestaña no pierdan el trabajo. La pista guardada en la API es la única fuente de verdad: el borrador
// se borra en cuanto no hay cambios pendientes (se guardó, o se deshizo hasta el estado limpio).
import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackEditorStore } from "@/application/state/trackEditorStore";
import {
  clearDraft,
  draftKey,
  listDrafts,
  saveDraft,
  type TrackDraft,
} from "@/infrastructure/persistence/trackDraft";

/** Un borrador guardado (la UI lo recibe desde aquí, sin importar de infraestructura). */
export type { TrackDraft };

/** Espera antes de escribir, para no guardar en cada movimiento del ratón. */
export const DRAFT_DELAY_MS = 400;

export interface TrackDraftState {
  /** Borradores encontrados al montar y aún sin resolver (recuperar o descartar), el más reciente primero. */
  pending: TrackDraft[];
  /** Recupera un borrador: la pista queda abierta como cambio sin guardar. */
  recover: (draft: TrackDraft) => void;
  /** Descarta un borrador pendiente. */
  discard: (draft: TrackDraft) => void;
  /** Borra el borrador de la pista abierta (al descartar sus cambios a propósito). */
  discardCurrent: () => void;
  /** Borra el borrador de una pista guardada (p. ej. cuando se borra la pista). */
  discardFor: (id: number) => void;
}

export function useTrackDraft(store: TrackEditorStore): TrackDraftState {
  const [pending, setPending] = useState<TrackDraft[]>(() => listDrafts());
  // Lo que está pendiente se lee desde el efecto sin volver a suscribirse en cada cambio.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastKey: string | null = null;

    const write = () => {
      timer = undefined;
      const s = store.getState();
      if (!s.track || !s.dirty) return;
      const key = draftKey(s.track.id);
      // No se pisa un borrador que el piloto todavía no decidió recuperar o descartar.
      if (pendingRef.current.some((d) => d.key === key)) return;
      if (saveDraft(s.track)) lastKey = key;
    };

    const onChange = () => {
      const s = store.getState();
      if (!s.track) {
        clearTimeout(timer);
        timer = undefined;
        return;
      }
      if (!s.dirty) {
        // Sin cambios pendientes (se guardó o se deshizo todo): el borrador sobra.
        clearTimeout(timer);
        timer = undefined;
        const key = draftKey(s.track.id);
        if (!pendingRef.current.some((d) => d.key === key)) clearDraft(key);
        if (lastKey && lastKey !== key && !pendingRef.current.some((d) => d.key === lastKey))
          clearDraft(lastKey);
        lastKey = null;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(write, DRAFT_DELAY_MS);
    };

    const unsubscribe = store.subscribe(onChange);
    return () => {
      unsubscribe();
      // Al desmontar (p. ej. el 401 muestra el inicio de sesión) se escribe ya, sin esperar el retraso.
      if (timer !== undefined) {
        clearTimeout(timer);
        write();
      }
    };
  }, [store]);

  const recover = useCallback(
    (draft: TrackDraft) => {
      store.restore(draft.track);
      setPending((list) => list.filter((d) => d.key !== draft.key));
    },
    [store],
  );
  const discard = useCallback((draft: TrackDraft) => {
    clearDraft(draft.key);
    setPending((list) => list.filter((d) => d.key !== draft.key));
  }, []);
  const discardCurrent = useCallback(() => {
    const track = store.getState().track;
    if (track) clearDraft(draftKey(track.id));
  }, [store]);

  const discardFor = useCallback((id: number) => {
    const key = draftKey(id);
    clearDraft(key);
    setPending((list) => list.filter((d) => d.key !== key));
  }, []);

  return { pending, recover, discard, discardCurrent, discardFor };
}
