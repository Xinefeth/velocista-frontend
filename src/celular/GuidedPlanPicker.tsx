// Paso previo del recorrido guiado: elegir el plano (archivo .dxf o pista del Trazador), su escala
// 1:N, el vértice donde se empieza y el sentido. Alineación (se explica en pantalla): el inicio medido
// se coloca en ese vértice y el primer lado medido se orienta hacia el siguiente vértice del plano.
import { useMemo } from "react";
import {
  DIRECTION_LABEL,
  scaleSentence,
  vertexLetter,
  type Direction,
} from "@/domain/measurement/guidedPlan";
import { guidePlanOf, type GuideSetup, type GuideSource } from "@/domain/measurement/guidedSetup";
import { ImportDxfPlan } from "@/ui/components/measurement/ImportDxfPlan";
import { TrackPlanPicker } from "@/ui/components/measurement/TrackPlanPicker";
import { GuidedLegend, GuidedOverlay } from "@/ui/components/measurement/GuidedOverlay";
import { walkingIndices } from "@/domain/measurement/guidedPlan";

interface Props {
  value: GuideSetup;
  onChange: (next: GuideSetup) => void;
}

const SOURCES: [GuideSource, string][] = [
  ["none", "Sin plano (o rectángulo de abajo)"],
  ["dxf", "Plano de un archivo .dxf"],
  ["pista", "Pista guardada del Trazador"],
];

export function GuidedPlanPicker({ value, onChange }: Props) {
  const set = (patch: Partial<GuideSetup>) => onChange({ ...value, ...patch });
  const plan = useMemo(() => guidePlanOf(value), [value]);
  const ok = plan && typeof plan !== "string" ? plan : null;
  const order = ok ? walkingIndices(ok.points, ok.startIndex, ok.direction) : [];

  return (
    <div className="guide-setup">
      <label className="lbl" htmlFor="guideSource">
        Plano para guiar el recorrido
      </label>
      <select
        id="guideSource"
        className="inp"
        value={value.source}
        onChange={(e) => set({ source: e.target.value as GuideSource })}
      >
        {SOURCES.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {value.source === "dxf" && (
        <>
          <ImportDxfPlan value={value.dxf} onChange={(dxf) => set({ dxf })} />
          <label className="lbl" htmlFor="guideScale">
            Escala del dibujo 1:N (1 = ya está a tamaño real; para 1:100 escribe 100)
          </label>
          <input
            id="guideScale"
            className="inp"
            inputMode="decimal"
            value={value.dxfScale}
            onChange={(e) => set({ dxfScale: e.target.value })}
          />
        </>
      )}
      {value.source === "pista" && (
        <TrackPlanPicker
          value={value.pick}
          onChange={(pick) => set({ pick })}
          onTracks={(tracks) => onChange({ ...value, tracks })}
        />
      )}
      {typeof plan === "string" && value.source !== "none" && (
        <p className="hint warn" role="status">
          {plan}
        </p>
      )}
      {ok && (
        <>
          <p className="hint" style={{ color: "var(--ink)" }}>
            {scaleSentence(ok.scaleN)}
          </p>
          <div className="lbl" style={{ marginTop: 10 }}>
            Toca el plano en la esquina donde vas a empezar
          </div>
          <GuidedOverlay
            plan={ok.points}
            startIndex={ok.startIndex}
            nextIndex={order[1]}
            height={230}
            label="Plano: toca el vértice de inicio"
            onPickVertex={(i) => set({ startIndex: i })}
          />
          <GuidedLegend />
          <div className="chips" role="group" aria-label="Esquina de inicio">
            {ok.points.map((_, i) => (
              <button
                key={i}
                type="button"
                className={i === ok.startIndex ? "chip on" : "chip"}
                aria-pressed={i === ok.startIndex}
                onClick={() => set({ startIndex: i })}
              >
                {vertexLetter(i)}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Sentido del recorrido">
            {(["ccw", "cw"] as Direction[]).map((d) => (
              <button
                key={d}
                type="button"
                className={d === ok.direction ? "chip on" : "chip"}
                aria-pressed={d === ok.direction}
                onClick={() => set({ direction: d })}
              >
                {DIRECTION_LABEL[d]}
              </button>
            ))}
          </div>
          <p className="hint" style={{ color: "var(--ink)" }}>
            Empiezas en {vertexLetter(ok.startIndex)} y caminas hacia {vertexLetter(order[1])}. El
            inicio medido se coloca en {vertexLetter(ok.startIndex)} y tu primer lado se orienta
            hacia {vertexLetter(order[1])}.
          </p>
        </>
      )}
    </div>
  );
}
