// Aviso para recuperar el trabajo sin guardar que quedó en el borrador local (por ejemplo tras un 401,
// una recarga o cerrar la pestaña). Usa la fila de confirmación de la consola (`.trk-confirm`, `.sb`).
import type { TrackDraft } from "@/application/hooks/useTrackDraft";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es");
};

export function DraftBanner({
  pending,
  onRecover,
  onDiscard,
}: {
  pending: TrackDraft[];
  onRecover: (draft: TrackDraft) => void;
  onDiscard: (draft: TrackDraft) => void;
}) {
  if (pending.length === 0) return null;
  const d = pending[0];
  const which = d.track.id === null ? "pista nueva" : `pista ${d.track.id} guardada`;
  return (
    <div className="trk-confirm" role="alertdialog" aria-label="Borrador sin guardar">
      <span>
        Hay un borrador sin guardar de «{d.track.name}» ({which}), del {when(d.savedAt)}.
        {pending.length > 1 ? ` Hay ${pending.length - 1} más.` : ""} ¿Quieres recuperarlo?
      </span>
      <button type="button" className="sb red" onClick={() => onRecover(d)}>
        Recuperar borrador
      </button>
      <button type="button" className="sb" onClick={() => onDiscard(d)}>
        Descartar borrador
      </button>
    </div>
  );
}
