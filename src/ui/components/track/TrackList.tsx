// Pistas guardadas en la API: abrir, borrar (con confirmación en la página) y reintentar si falla.
// También ofrece los dos ejemplos del prototipo como pistas sin guardar para probar la vista.
import { useState } from "react";
import { fmt } from "@/domain/track/rules";
import type { Track } from "@/domain/track/types";

export function TrackList({
  tracks,
  loading,
  error,
  currentId,
  examples,
  onReload,
  onOpen,
  onOpenExample,
  onRemove,
}: {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  currentId: number | null;
  examples: Track[];
  onReload: () => void;
  onOpen: (id: number) => void;
  onOpenExample: (track: Track) => void;
  onRemove: (id: number) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  return (
    <>
      {loading && (
        <p className="hint" role="status">
          Cargando pistas…
        </p>
      )}
      {error && (
        <p className="hint warn" role="alert">
          {error}{" "}
          <button type="button" className="sb" onClick={onReload}>
            Reintentar
          </button>
        </p>
      )}
      {!loading && !error && tracks.length === 0 && (
        <p className="empty">Todavía no hay pistas guardadas.</p>
      )}
      <ul className="trk-list" aria-label="Pistas guardadas">
        {tracks.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="trk-item"
              aria-current={t.id === currentId ? "true" : undefined}
              onClick={() => t.id !== null && onOpen(t.id)}
            >
              <b>{t.name}</b>
              <span className="trk-len">
                {t.lengthCm !== undefined ? `${fmt(t.lengthCm / 100)} m` : "—"}
              </span>
              <small>
                {t.board.widthCm} × {t.board.heightCm} cm · {t.points.length} puntos
              </small>
            </button>
            {confirming === t.id ? (
              <div
                className="trk-confirm"
                role="alertdialog"
                aria-label={`Confirmar borrado de ${t.name}`}
              >
                <span>¿Borrar «{t.name}»?</span>
                <button
                  type="button"
                  className="sb red"
                  onClick={() => {
                    if (t.id !== null) onRemove(t.id);
                    setConfirming(null);
                  }}
                >
                  Sí, borrar
                </button>
                <button type="button" className="sb" onClick={() => setConfirming(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="trk-rowact">
                <button type="button" className="sb ghost" onClick={() => setConfirming(t.id)}>
                  Borrar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="note">Ejemplos del prototipo (sin guardar):</p>
      <div className="chips" role="group" aria-label="Ejemplos del prototipo">
        {examples.map((t) => (
          <button key={t.name} type="button" onClick={() => onOpenExample(t)}>
            {t.name}
          </button>
        ))}
      </div>
    </>
  );
}
