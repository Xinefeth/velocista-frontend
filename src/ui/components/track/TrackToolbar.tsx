// Barra de herramientas del plano: herramienta activa, mostrar puntos y pista nueva.
// Usa los controles de la consola: `.seg` (segmentado), `.chips` (interruptor) y `.sb` (botón).
import { useTrackEditor } from "@/application/state/TrackEditorProvider";

export function TrackToolbar() {
  const editor = useTrackEditor();
  const has = editor.track !== null;
  return (
    <div className="trk-bar">
      <div className="seg" role="group" aria-label="Herramienta">
        <button
          type="button"
          aria-pressed={editor.tool === "select"}
          disabled={!has}
          title="Seleccionar y mover (V)"
          onClick={() => editor.setTool("select")}
        >
          Seleccionar
        </button>
        <button
          type="button"
          aria-pressed={editor.tool === "draw"}
          disabled={!has}
          title="Dibujar puntos (P)"
          onClick={() => editor.setTool("draw")}
        >
          Dibujar
        </button>
      </div>
      <div className="chips" role="group" aria-label="Vista">
        <button
          type="button"
          aria-pressed={editor.options.nodes}
          disabled={!has}
          title="Mostrar todos los puntos de control (N)"
          onClick={() => editor.setOptions({ nodes: !editor.options.nodes })}
        >
          Puntos
        </button>
      </div>
      <button
        type="button"
        className="sb"
        onClick={editor.newTrack}
        title="Empezar una pista en blanco"
      >
        Nueva pista
      </button>
    </div>
  );
}
