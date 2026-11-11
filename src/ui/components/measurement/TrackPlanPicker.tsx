// Selector de una pista guardada en el Trazador para usarla como plano de referencia (Odometría,
// paso 1). Solo lee (GET /api/tracks); no crea ni cambia pistas. Es controlado: `value` es lo que
// se eligió y el padre deriva el plano con `planOfPick`, así que el plano es función de la elección.
import { useEffect, useId } from "react";
import type { Track } from "@/domain/track/types";
import { useTracks } from "@/application/hooks/useTracks";
import {
  fmtEs,
  TRACK_PLAN_BY_RATIO,
  TRACK_PLAN_BY_SIDE,
  TRACK_PLAN_CHOOSE,
  TRACK_PLAN_EMPTY,
  TRACK_PLAN_HINT,
  TRACK_PLAN_PLACEHOLDER,
  TRACK_PLAN_PREVIEW,
  TRACK_PLAN_REAL_SIDE,
  TRACK_PLAN_RETRY,
  TRACK_PLAN_ROUNDED,
  TRACK_PLAN_SCALE_LEGEND,
  TRACK_PLAN_SIDE,
} from "@/domain/measurement/labels";
import {
  drawnSides,
  isTrackPlanError,
  longestSide,
  planOfPick,
  trackPlanProblem,
  type TrackPick,
} from "@/domain/measurement/trackPlan";
import { Hint } from "@/ui/components/measurement/MeasurementUi";
import { PlanPreview } from "@/ui/components/measurement/PlanPreview";

interface Props {
  value: TrackPick;
  onChange: (next: TrackPick) => void;
  /** Avisa de la lista cargada para que quien la use derive el plano de lo elegido. */
  onTracks: (tracks: Track[]) => void;
}

export function TrackPlanPicker({ value, onChange, onTracks }: Props) {
  const id = useId();
  const { tracks, loading, error, reload } = useTracks();
  useEffect(() => onTracks(tracks), [tracks, onTracks]);
  const track = tracks.find((t) => t.id === value.trackId) ?? null;
  const plan = planOfPick(tracks, value);
  const ok = plan && !isTrackPlanError(plan) ? plan : null;
  // el motivo de una pista no usable se muestra con la pista elegida
  const problem = track ? trackPlanProblem(track) : null;
  const sides = track ? drawnSides(track) : [];
  const sideIndex = value.side ?? (track ? longestSide(track) : 0);
  const patch = (p: Partial<TrackPick>) => onChange({ ...value, ...p });

  return (
    <div className="importdxf">
      <label className="fld">
        <span className="lbl">{TRACK_PLAN_CHOOSE}</span>
        <select
          className="inp"
          aria-label={TRACK_PLAN_CHOOSE}
          aria-describedby={`${id}-hint`}
          value={value.trackId ?? ""}
          disabled={loading && !tracks.length}
          onChange={(e) =>
            patch({ trackId: e.target.value ? Number(e.target.value) : null, side: null })
          }
        >
          <option value="">{TRACK_PLAN_PLACEHOLDER}</option>
          {tracks.map((t) => {
            const reason = trackPlanProblem(t);
            return (
              <option key={t.id} value={t.id ?? ""} disabled={reason !== null}>
                {t.name} · {fmtEs(sizeOf(t).w, 0)} × {fmtEs(sizeOf(t).h, 0)} cm
                {reason ? ` (${reason})` : ""}
              </option>
            );
          })}
        </select>
      </label>
      <p className="note" id={`${id}-hint`}>
        {TRACK_PLAN_HINT}
      </p>
      <Hint text={error ?? ""} error />
      {error && (
        <button type="button" className="sb" onClick={reload}>
          {TRACK_PLAN_RETRY}
        </button>
      )}
      {!loading && !error && tracks.length === 0 && <p className="note">{TRACK_PLAN_EMPTY}</p>}

      {track && (
        <>
          <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="lbl">{TRACK_PLAN_SCALE_LEGEND}</legend>
            <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={value.mode === "ratio"}
                onChange={() => patch({ mode: "ratio" })}
              />
              <span>{TRACK_PLAN_BY_RATIO}</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={value.mode === "side"}
                onChange={() => patch({ mode: "side" })}
              />
              <span>{TRACK_PLAN_BY_SIDE}</span>
            </label>
          </fieldset>
          {value.mode === "ratio" ? (
            <label className="fld">
              <span className="lbl">Escala 1:</span>
              <input
                className="inp m"
                aria-label="Escala 1:N de la pista"
                inputMode="decimal"
                value={value.n}
                onChange={(e) => patch({ n: e.target.value })}
              />
            </label>
          ) : (
            <div className="g2">
              <label className="fld">
                <span className="lbl">{TRACK_PLAN_SIDE}</span>
                <select
                  className="inp"
                  aria-label={TRACK_PLAN_SIDE}
                  value={sideIndex}
                  onChange={(e) => patch({ side: Number(e.target.value) })}
                >
                  {sides.map((s) => (
                    <option key={s.index} value={s.index}>
                      {s.name} · dibujado {fmtEs(s.lengthCm, 1)} cm
                    </option>
                  ))}
                </select>
              </label>
              <label className="fld">
                <span className="lbl">Largo real (m)</span>
                <input
                  className="inp m"
                  aria-label={TRACK_PLAN_REAL_SIDE}
                  inputMode="decimal"
                  placeholder="Ej. 8.00"
                  value={value.realM}
                  onChange={(e) => patch({ realM: e.target.value })}
                />
              </label>
            </div>
          )}
          <Hint text={problem ?? ""} error />
          {plan && isTrackPlanError(plan) && !problem && <p className="note">{plan.error}</p>}
        </>
      )}

      {ok && track && (
        <>
          <PlanPreview points={ok.contour} corners={ok.corners} label={TRACK_PLAN_PREVIEW} />
          <dl className="specs" aria-label="Pista a tamaño real">
            <dt>Pista</dt>
            <dd>{ok.name}</dd>
            <dt>Escala</dt>
            <dd>1:{fmtEs(ok.scaleN, ok.scaleN % 1 ? 1 : 0)}</dd>
            <dt>Vértices</dt>
            <dd>{ok.corners.length}</dd>
            <dt>Perímetro</dt>
            <dd>{fmtEs(ok.perimeter_m, 2)} m</dd>
            <dt>Área</dt>
            <dd>{fmtEs(ok.area_m2, 2)} m²</dd>
          </dl>
          {ok.rounded && (
            <p className="note" role="status">
              {TRACK_PLAN_ROUNDED}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Tamaño dibujado (ancho × alto en cm) de los vértices de una pista. */
function sizeOf(t: { points: { x: number; y: number }[] }): { w: number; h: number } {
  const xs = t.points.map((p) => p.x);
  const ys = t.points.map((p) => p.y);
  return {
    w: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    h: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
  };
}
