// Envoltorio React del controlador del lienzo: crea el controlador una vez, le conecta el <canvas>
// y le entrega el almacén del editor por una interfaz pequeña (`TrackCanvasHost`).
import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvas } from "@/application/hooks/useCanvas";
import { useTrackEditor } from "@/application/state/TrackEditorProvider";
import {
  TrackCanvasController,
  type TrackCanvasHost,
} from "@/ui/components/track/TrackCanvasController";
import type { Scene } from "@/ui/components/track/drawScene";

const HINTS = {
  select:
    "Clic para elegir un punto o un tramo · Mayús+clic o arrastre para varios · Ctrl+A todo · arrastra la bandera para mover la salida · doble clic en un tramo agrega un punto · Supr borra.",
  draw: "Clic para agregar puntos. Clic en el primer punto cierra el circuito. Con el circuito cerrado, clic sobre la línea agrega un punto. Enter o V para volver a seleccionar.",
} as const;

export function TrackCanvas() {
  const editor = useTrackEditor();
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const [message, setMessage] = useState("");
  const [coords, setCoords] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const controller = useMemo(() => {
    const host: TrackCanvasHost = {
      // El documento se lee del almacén (siempre fresco); la verificación viene de React.
      getScene: (): Scene | null => {
        const s = editorRef.current.store.getState();
        if (!s.track) return null;
        return {
          track: s.track,
          analysis: editorRef.current.analysis,
          rules: editorRef.current.rules,
          issueSel: s.issueSel,
          selection: s.selection,
          tool: s.tool,
          showNodes: s.options.nodes,
        };
      },
      getRadius: () => editorRef.current.store.getState().options.radius,
      preview: (t) => editorRef.current.store.preview(t),
      apply: (t, sel) => editorRef.current.store.apply(t, sel),
      commit: (before) => editorRef.current.store.commit(before),
      undo: () => editorRef.current.store.undo(),
      redo: () => editorRef.current.store.redo(),
      save: () => void editorRef.current.save(),
      setSelection: (s) => editorRef.current.store.setSelection(s),
      setTool: (t) => editorRef.current.store.setTool(t),
      toggleNodes: () =>
        editorRef.current.store.setOptions({
          nodes: !editorRef.current.store.getState().options.nodes,
        }),
      notify: (text) => {
        setMessage(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setMessage(""), 4000);
      },
      coords: setCoords,
    };
    return new TrackCanvasController(host);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  const ref = useCanvas((cv) => controller.render(cv));
  useEffect(() => {
    const cv = ref.current;
    return cv ? controller.attach(cv) : undefined;
  }, [controller, ref]);

  const track = editor.track;
  return (
    <>
      <div className="trk-bar">
        <button type="button" className="sb" onClick={() => controller.fit()} disabled={!track}>
          Ajustar vista
        </button>
        <button
          type="button"
          className="sb"
          aria-label="Acercar"
          onClick={() => controller.zoomBy(1.25)}
          disabled={!track}
        >
          +
        </button>
        <button
          type="button"
          className="sb"
          aria-label="Alejar"
          onClick={() => controller.zoomBy(0.8)}
          disabled={!track}
        >
          −
        </button>
        <span className="note trk-grow" aria-live="polite">
          {message || HINTS[editor.tool]}
        </span>
        <span className="m trk-coords" aria-hidden="true">
          {coords}
        </span>
      </div>
      <div className="trk-stage">
        <canvas
          ref={ref}
          className="trk-canvas"
          tabIndex={0}
          role="img"
          aria-label={track ? `Plano de la pista ${track.name}` : "Plano de la pista (vacío)"}
        />
        {!track && (
          <div className="trk-empty">
            <b>Ninguna pista abierta</b>
            <span>Elige una pista guardada o un ejemplo, o empieza una pista nueva.</span>
          </div>
        )}
        {track && track.points.length === 0 && (
          <div className="trk-empty">
            <b>Pista vacía</b>
            <span>
              Con la herramienta «Dibujar», haz clic en el plano para poner el primer punto.
            </span>
          </div>
        )}
      </div>
    </>
  );
}
