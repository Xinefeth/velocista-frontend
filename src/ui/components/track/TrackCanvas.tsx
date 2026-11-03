// Envoltorio React del controlador del lienzo: crea el controlador una vez, le conecta el <canvas>
// y le entrega el almacén del editor por una interfaz pequeña (`TrackCanvasHost`).
// También muestra el menú contextual cuando el controlador lo pide.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCanvas } from "@/application/hooks/useCanvas";
import { useTrackEditor } from "@/application/state/TrackEditorProvider";
import { build } from "@/domain/track/geometry";
import { ContextMenu } from "@/ui/components/track/ContextMenu";
import { buildMenu, type MenuItem } from "@/ui/components/track/contextItems";
import {
  TrackCanvasController,
  type MenuRequest,
  type TrackCanvasHost,
} from "@/ui/components/track/TrackCanvasController";
import type { Scene } from "@/ui/components/track/drawScene";

const HINTS = {
  select:
    "Clic para elegir un punto, un tramo o una zona · Mayús+clic o arrastre para varios · Ctrl+A todo · arrastra la bandera para mover la salida · doble clic en un tramo agrega un punto · clic derecho abre el menú · Supr borra.",
  draw: "Clic para agregar puntos (Mayús ajusta el ángulo, Alt desactiva la rejilla). Clic en el primer punto cierra el circuito. Con el circuito cerrado, clic sobre la línea agrega un punto. Enter o V para volver a seleccionar.",
  zone: "Arrastra para dibujar una zona donde la línea no puede pasar (postes, logos, rampas). V para volver a seleccionar.",
  tpl: "Clic sobre un tramo recto para insertar la figura hacia ese lado · Esc para salir.",
} as const;

export function TrackCanvas() {
  const editor = useTrackEditor();
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const simRef = useRef(editor.sim.state);
  simRef.current = editor.sim.state;
  const [message, setMessage] = useState("");
  const [coords, setCoords] = useState("");
  const [menu, setMenu] = useState<{ request: MenuRequest; items: MenuItem[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const controllerRef = useRef<TrackCanvasController>();

  const closeMenu = useCallback(() => setMenu(null), []);

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
          dims: s.options.dims,
          sim: simRef.current.on
            ? { s: simRef.current.s, w: simRef.current.width, l: simRef.current.length }
            : null,
        };
      },
      getOptions: () => editorRef.current.store.getState().options,
      getTemplate: () => editorRef.current.store.getState().template,
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
      toggleDims: () =>
        editorRef.current.store.setOptions({
          dims: !editorRef.current.store.getState().options.dims,
        }),
      toggleSnap: () =>
        editorRef.current.store.setOptions({
          snap: !editorRef.current.store.getState().options.snap,
        }),
      notify: (text) => {
        setMessage(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setMessage(""), 4000);
      },
      coords: setCoords,
      openMenu: (request) => {
        const store = editorRef.current.store;
        const s = store.getState();
        if (!s.track) return;
        const items = buildMenu({
          request,
          track: s.track,
          // La selección ya se ajustó en el controlador: se lee del almacén.
          selection: s.selection,
          geometry: build(s.track),
          options: s.options,
          apply: (t, sel) => store.apply(t, sel),
          setSelection: (sel) => store.setSelection(sel),
          fit: () => controllerRef.current?.fit(),
          notify: (m) => host.notify(m),
        });
        setMenu({ request, items });
      },
      closeMenu,
    };
    const c = new TrackCanvasController(host);
    controllerRef.current = c;
    return c;
  }, [closeMenu]);

  useEffect(() => () => clearTimeout(timer.current), []);
  // El robot de la simulación cambia fuera del almacén del editor: se pide un redibujado.
  const { sim } = editor;
  useEffect(() => controller.redraw(), [controller, sim.state]);
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
      {menu && (
        <ContextMenu items={menu.items} x={menu.request.x} y={menu.request.y} onClose={closeMenu} />
      )}
    </>
  );
}
