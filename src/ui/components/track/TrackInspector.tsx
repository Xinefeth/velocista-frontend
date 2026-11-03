// Inspector: datos de la pista y del punto, tramo o grupo seleccionado. Los cambios se aplican al
// documento al confirmar cada campo. Las cotas de aviso usan los límites del dominio.
import { useTrackEditor } from "@/application/state/TrackEditorProvider";
import {
  deleteSelection,
  duplicateZone,
  MIN_ZONE_CM,
  reverseTrack,
  setBoard,
  setClosed,
  setEdgeLength,
  setName,
  setRadius,
  setZone,
  toggleGap,
} from "@/domain/track/commands";
import { edgesOf } from "@/domain/track/geometry";
import { TRACK_LIMITS } from "@/domain/track/limits";
import { fmt } from "@/domain/track/rules";
import { EMPTY_SELECTION, edgeSelection, groupSize } from "@/domain/track/selection";
import type { Track } from "@/domain/track/types";
import { NameField } from "@/ui/components/track/NameField";
import { messageFor } from "@/ui/components/track/fieldLabels";
import { NumberField } from "@/ui/components/track/NumberField";
import { TransformPanel } from "@/ui/components/track/TransformPanel";

const COORD = TRACK_LIMITS.coordAbsCm;

/** Valor común de una lista o `null` si difiere. */
function common(values: number[]): number | null {
  return values.length > 0 && values.every((v) => Math.abs(v - values[0]) < 1e-9)
    ? values[0]
    : null;
}

function ZoneFields({ track, index }: { track: Track; index: number }) {
  const editor = useTrackEditor();
  const z = track.zones[index];
  const set = (patch: Partial<typeof z>) => editor.applyTrack(setZone(track, index, patch));
  const size = { min: MIN_ZONE_CM, max: TRACK_LIMITS.zoneSizeMaxCm };
  return (
    <>
      <h3>Zona {index + 1}</h3>
      <NameField
        label="Nombre de la zona"
        maxLength={TRACK_LIMITS.zoneNameLength}
        value={z.name}
        onCommit={(name) => set({ name })}
      />
      <div className="trk-row">
        <NumberField
          label="X"
          unit="cm"
          value={z.x}
          min={-COORD}
          max={COORD}
          onCommit={(x) => set({ x })}
        />
        <NumberField
          label="Y"
          unit="cm"
          value={z.y}
          min={-COORD}
          max={COORD}
          onCommit={(y) => set({ y })}
        />
        <NumberField
          label="Ancho"
          unit="cm"
          value={z.width}
          {...size}
          onCommit={(width) => set({ width })}
        />
        <NumberField
          label="Alto"
          unit="cm"
          value={z.height}
          {...size}
          onCommit={(height) => set({ height })}
        />
      </div>
      <div className="trk-menu" role="group" aria-label="Zona">
        <button
          type="button"
          className="sb"
          onClick={() => {
            const next = duplicateZone(track, index);
            if (next)
              editor.applyTrack(next, { points: [], edge: null, zones: [next.zones.length - 1] });
          }}
        >
          Duplicar zona
        </button>
      </div>
    </>
  );
}

function PointFields({ track, index }: { track: Track; index: number }) {
  const editor = useTrackEditor();
  const p = track.points[index];
  const set = (patch: Partial<typeof p>) =>
    editor.applyTrack({
      ...track,
      points: track.points.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    });
  return (
    <>
      <h3>Punto {index + 1}</h3>
      <div className="trk-row">
        <NumberField
          label="X"
          unit="cm"
          value={p.x}
          min={-COORD}
          max={COORD}
          onCommit={(x) => set({ x })}
        />
        <NumberField
          label="Y"
          unit="cm"
          value={p.y}
          min={-COORD}
          max={COORD}
          onCommit={(y) => set({ y })}
        />
      </div>
      <NumberField
        label="Radio de la curva"
        unit="cm"
        value={p.radius}
        min={TRACK_LIMITS.radiusCm[0]}
        max={TRACK_LIMITS.radiusCm[1]}
        onCommit={(r) => editor.applyTrack(setRadius(track, [index], r))}
      />
    </>
  );
}

export function TrackInspector() {
  const editor = useTrackEditor();
  const { track, selection } = editor;
  if (!track) return <p className="empty">Abre una pista o empieza una nueva para editarla.</p>;

  const edges = edgesOf(track);
  const edge =
    selection.edge !== null && selection.points.length === 2 ? edges[selection.edge] : undefined;
  const single =
    selection.points.length === 1 && selection.edge === null ? selection.points[0] : null;
  const many = selection.points.length >= 2 && !edge;
  const oneZone =
    selection.zones.length === 1 && selection.points.length === 0 ? selection.zones[0] : null;
  const count = groupSize(selection);
  const canClose = track.points.length >= 3;

  return (
    <div className="trk-inspector">
      <NameField
        value={track.name}
        error={messageFor(editor.saveState.fields, "name")}
        onCommit={(name) => editor.applyTrack(setName(track, name))}
      />
      <div className="trk-row">
        <NumberField
          label="Ancho del tablero"
          unit="cm"
          value={track.board.widthCm}
          error={messageFor(editor.saveState.fields, "board.width_cm", "board")}
          min={TRACK_LIMITS.boardCm[0]}
          max={TRACK_LIMITS.boardCm[1]}
          onCommit={(w) => editor.applyTrack(setBoard(track, w, track.board.heightCm))}
        />
        <NumberField
          label="Alto del tablero"
          unit="cm"
          value={track.board.heightCm}
          error={messageFor(editor.saveState.fields, "board.height_cm")}
          min={TRACK_LIMITS.boardCm[0]}
          max={TRACK_LIMITS.boardCm[1]}
          onCommit={(h) => editor.applyTrack(setBoard(track, track.board.widthCm, h))}
        />
      </div>
      <NumberField
        label="Radio de los puntos nuevos"
        unit="cm"
        value={editor.options.radius}
        min={TRACK_LIMITS.radiusCm[0]}
        max={TRACK_LIMITS.radiusCm[1]}
        onCommit={(radius) => editor.setOptions({ radius })}
      />
      <div className="trk-menu" role="group" aria-label="Circuito">
        <button
          type="button"
          className="sb"
          disabled={!track.closed && !canClose}
          title={
            !track.closed && !canClose
              ? "Un circuito cerrado necesita al menos 3 puntos"
              : undefined
          }
          onClick={() => {
            const next = setClosed(track, !track.closed);
            if (next) editor.applyTrack(next);
          }}
        >
          {track.closed ? "Abrir circuito" : "Cerrar circuito"}
        </button>
        <button
          type="button"
          className="sb"
          disabled={track.points.length < 2}
          title="Recorrer la línea en sentido contrario"
          onClick={() => editor.applyTrack(reverseTrack(track), EMPTY_SELECTION)}
        >
          Invertir sentido
        </button>
      </div>

      {single !== null && track.points[single] && (
        <>
          <PointFields track={track} index={single} />
          <div className="chips" role="group" aria-label="Corte">
            <button
              type="button"
              aria-pressed={track.points[single].gap}
              title="Deja un hueco en el tramo que sale de este punto"
              onClick={() => editor.applyTrack(toggleGap(track, single))}
            >
              Corte en el tramo siguiente
            </button>
          </div>
        </>
      )}

      {edge && selection.edge !== null && (
        <>
          <h3>Tramo {selection.edge + 1}</h3>
          <NumberField
            label="Largo del tramo"
            unit="cm"
            value={Math.hypot(
              track.points[edge[1]].x - track.points[edge[0]].x,
              track.points[edge[1]].y - track.points[edge[0]].y,
            )}
            min={1}
            max={COORD}
            onCommit={(L) =>
              editor.applyTrack(
                setEdgeLength(track, selection.edge as number, L),
                edgeSelection(track, selection.edge as number),
              )
            }
          />
          <div className="chips" role="group" aria-label="Corte">
            <button
              type="button"
              aria-pressed={track.points[edge[0]].gap}
              title="Deja un hueco en este tramo recto"
              onClick={() => editor.applyTrack(toggleGap(track, edge[0]))}
            >
              Corte en este tramo
            </button>
          </div>
        </>
      )}

      {many && (
        <>
          <h3>{selection.points.length} puntos seleccionados</h3>
          <NumberField
            label="Radio de la curva"
            unit="cm"
            value={common(selection.points.map((i) => track.points[i].radius))}
            min={TRACK_LIMITS.radiusCm[0]}
            max={TRACK_LIMITS.radiusCm[1]}
            onCommit={(r) => editor.applyTrack(setRadius(track, selection.points, r))}
          />
        </>
      )}

      {oneZone !== null && track.zones[oneZone] && <ZoneFields track={track} index={oneZone} />}

      {count > 0 && (
        <button
          type="button"
          className="sb"
          onClick={() => editor.applyTrack(deleteSelection(track, selection), EMPTY_SELECTION)}
        >
          {selection.zones.length > 0
            ? count === 1
              ? "Borrar zona"
              : `Borrar ${count} objetos`
            : selection.points.length === 1
              ? "Borrar punto"
              : `Borrar ${selection.points.length} puntos`}
        </button>
      )}
      {count === 0 && (
        <p className="note">Elige un punto, un tramo o una zona en el plano para editarlo.</p>
      )}
      <TransformPanel />
      {track.points.length > 0 && (
        <p className="note">
          Salida: tramo {track.start.edge + 1}, al {fmt(track.start.t * 100)} %. Arrastra la bandera
          para moverla.
        </p>
      )}
    </div>
  );
}
