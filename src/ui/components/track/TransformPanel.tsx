// Transformaciones numéricas: girar, escalar, reflejar y mover la selección (o toda la pista si hay
// menos de 2 objetos elegidos). Cada botón aplica UN paso de historial. Usa `.inp` y `.sb` de la consola.
import { useId, useState } from "react";
import { useTrackEditor } from "@/application/state/TrackEditorProvider";
import { groupSize, selectionTarget } from "@/domain/track/selection";
import { allTarget, mirror, move, rotate, scale } from "@/domain/track/transforms";

const parse = (text: string): number | null => {
  const v = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(v) ? v : null;
};

function Field({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id}>
        {label} ({unit})
      </label>
      <input
        id={id}
        className="inp m"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={value !== "" && parse(value) === null ? "true" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function TransformPanel() {
  const editor = useTrackEditor();
  const { track, selection } = editor;
  const [angle, setAngle] = useState(String(editor.options.angStep));
  const [percent, setPercent] = useState("100");
  const [dx, setDx] = useState("10");
  const [dy, setDy] = useState("0");
  if (!track || track.points.length + track.zones.length === 0) return null;

  const group = groupSize(selection) >= 2;
  const target = group ? selectionTarget(selection) : allTarget(track);
  const label = group
    ? `Transformar la selección (${groupSize(selection)} objetos)`
    : "Transformar toda la pista";
  const a = parse(angle);
  const p = parse(percent);
  const mx = parse(dx);
  const my = parse(dy);
  const apply = (next: typeof track) => editor.applyTrack(next);

  return (
    <div className="trk-transform" role="group" aria-label={label}>
      <h3>{label}</h3>
      <div className="trk-row">
        <Field label="Girar" unit="°" value={angle} onChange={setAngle} />
        <div className="trk-menu">
          <button
            type="button"
            className="sb"
            title="Girar a la izquierda (R)"
            aria-label="Girar a la izquierda"
            disabled={a === null}
            onClick={() => a !== null && apply(rotate(track, target, a))}
          >
            ↺
          </button>
          <button
            type="button"
            className="sb"
            title="Girar a la derecha (Mayús+R)"
            aria-label="Girar a la derecha"
            disabled={a === null}
            onClick={() => a !== null && apply(rotate(track, target, -a))}
          >
            ↻
          </button>
        </div>
      </div>
      <div className="trk-row">
        <Field label="Escalar" unit="%" value={percent} onChange={setPercent} />
        <div className="trk-menu">
          <button
            type="button"
            className="sb"
            disabled={p === null || p <= 0}
            onClick={() => p !== null && p > 0 && apply(scale(track, target, p / 100))}
          >
            Escalar
          </button>
        </div>
      </div>
      <div className="trk-menu" role="group" aria-label="Espejo">
        <button
          type="button"
          className="sb"
          title="Espejo horizontal (M)"
          aria-label="Espejo horizontal"
          onClick={() => apply(mirror(track, target, "h"))}
        >
          ↔ Espejo
        </button>
        <button
          type="button"
          className="sb"
          title="Espejo vertical (Mayús+M)"
          aria-label="Espejo vertical"
          onClick={() => apply(mirror(track, target, "v"))}
        >
          ↕ Espejo
        </button>
      </div>
      <div className="trk-row">
        <Field label="Mover X" unit="cm" value={dx} onChange={setDx} />
        <Field label="Mover Y" unit="cm" value={dy} onChange={setDy} />
      </div>
      <div className="trk-menu">
        <button
          type="button"
          className="sb"
          disabled={mx === null || my === null}
          onClick={() => mx !== null && my !== null && apply(move(track, target, mx, my))}
        >
          Mover
        </button>
      </div>
    </div>
  );
}
