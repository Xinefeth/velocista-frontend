// Barras de herramientas del plano: herramienta activa, plantillas, rejilla y ángulo, deshacer/rehacer,
// guardar y pista nueva. Usa los controles de la consola: `.seg`, `.chips`, `.inp` (select) y `.sb`.
import { useTrackEditor } from "@/application/state/TrackEditorProvider";
import { TEMPLATES } from "@/domain/track/templates";

const GRID_STEPS = [1, 2, 5, 10, 20];
const ANGLE_STEPS = [5, 10, 15, 30, 45];

export function TrackToolbar({ onNew }: { onNew: () => void }) {
  const editor = useTrackEditor();
  const has = editor.track !== null;
  const saving = editor.saveState.status === "saving";
  const isNew = editor.track?.id === null;
  const { options } = editor;
  return (
    <>
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
          <button
            type="button"
            aria-pressed={editor.tool === "zone"}
            disabled={!has}
            title="Dibujar una zona prohibida (Z)"
            onClick={() => editor.setTool("zone")}
          >
            Zona
          </button>
        </div>
        <div className="chips" role="group" aria-label="Vista">
          <button
            type="button"
            aria-pressed={options.nodes}
            disabled={!has}
            title="Mostrar todos los puntos de control (N)"
            onClick={() => editor.setOptions({ nodes: !options.nodes })}
          >
            Puntos
          </button>
          <button
            type="button"
            aria-pressed={options.snap}
            disabled={!has}
            title="Ajustar a la rejilla (G); Alt la desactiva mientras arrastras"
            onClick={() => editor.setOptions({ snap: !options.snap })}
          >
            Rejilla
          </button>
        </div>
        <label className="note" htmlFor="trk-grid-step">
          Paso
        </label>
        <select
          id="trk-grid-step"
          className="inp trk-mini"
          value={options.step}
          disabled={!has || !options.snap}
          onChange={(e) => editor.setOptions({ step: Number(e.target.value) })}
        >
          {GRID_STEPS.map((s) => (
            <option key={s} value={s}>
              {s} cm
            </option>
          ))}
        </select>
        <label className="note" htmlFor="trk-ang-step">
          Ángulo
        </label>
        <select
          id="trk-ang-step"
          className="inp trk-mini"
          value={options.angStep}
          disabled={!has}
          onChange={(e) => editor.setOptions({ angStep: Number(e.target.value) })}
        >
          {ANGLE_STEPS.map((s) => (
            <option key={s} value={s}>
              {s}°
            </option>
          ))}
        </select>
      </div>
      <div className="trk-bar trk-tpls">
        <span className="note">Plantillas</span>
        <div className="chips" role="group" aria-label="Plantillas">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={editor.tool === "tpl" && editor.template === t.id}
              disabled={!has}
              title={`${t.hint}: clic sobre un tramo recto`}
              onClick={() => editor.setTool("tpl", t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div className="trk-bar">
        <div className="trk-menu" role="group" aria-label="Historial">
          <button
            type="button"
            className="sb"
            disabled={!editor.canUndo}
            title="Deshacer (Ctrl+Z)"
            onClick={editor.undo}
          >
            Deshacer
          </button>
          <button
            type="button"
            className="sb"
            disabled={!editor.canRedo}
            title="Rehacer (Ctrl+Mayús+Z o Ctrl+Y)"
            onClick={editor.redo}
          >
            Rehacer
          </button>
        </div>
        <button type="button" className="sb" onClick={onNew} title="Empezar una pista en blanco">
          Nueva pista
        </button>
        <button
          type="button"
          className="sb red"
          disabled={!has || saving || (!isNew && !editor.dirty)}
          title={isNew ? "Guardar en la API (Ctrl+S)" : "Actualizar en la API (Ctrl+S)"}
          onClick={() => void editor.save()}
        >
          {saving ? "Guardando…" : isNew ? "Guardar" : "Actualizar"}
        </button>
      </div>
    </>
  );
}
