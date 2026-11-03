// Barra de simulación de vuelta: un rectángulo (el robot de prueba) recorre la línea desde la salida.
// Reproducir/pausar, posición en la vuelta, velocidad y tamaño del robot. No cambia la pista.
import { useState } from "react";
import { useTrackEditor } from "@/application/state/TrackEditorProvider";
import { SIM_LIMITS } from "@/application/state/trackSimulation";
import { fmt } from "@/domain/track/rules";

/** Campo numérico que aplica el valor mientras se escribe y, al salir, muestra el valor vigente. */
function SimField({
  label,
  value,
  min,
  max,
  onValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onValue: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="inp m trk-num"
      inputMode="decimal"
      aria-label={label}
      title={`${label} (${fmt(min)} a ${fmt(max)})`}
      value={text ?? String(value).replace(".", ",")}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value.trim().replace(",", "."));
        if (Number.isFinite(v) && e.target.value.trim() !== "") onValue(v);
      }}
      onBlur={() => setText(null)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

export function SimulationBar({
  message,
  onMessage,
}: {
  message: string;
  onMessage: (m: string) => void;
}) {
  const { sim, track, analysis } = useTrackEditor();
  const { state, progress } = sim;
  const canSimulate = !!track && !!analysis && analysis.g.L > 0;

  if (!state.on)
    return (
      <div className="trk-bar trk-sim" role="group" aria-label="Simulación">
        <button
          type="button"
          className="sb"
          disabled={!track}
          title="Recorrer la pista con un robot de prueba"
          onClick={() => onMessage(sim.open() ?? "")}
        >
          Simular
        </button>
        {message && (
          <span className="note" role="status">
            {message}
          </span>
        )}
      </div>
    );

  return (
    <div className="trk-bar trk-sim" role="group" aria-label="Simulación">
      <button
        type="button"
        className="sb"
        disabled={!canSimulate}
        aria-pressed={state.playing}
        onClick={sim.toggle}
      >
        {state.playing ? "Pausar" : "Reproducir"}
      </button>
      <input
        type="range"
        className="trk-range"
        min={0}
        max={1000}
        value={Math.round(progress.fraction * 1000)}
        aria-label="Posición en la vuelta"
        aria-valuetext={`${fmt(progress.elapsed)} de ${fmt(progress.total)} segundos`}
        onChange={(e) => sim.seek(Number(e.target.value) / 1000)}
      />
      <span className="m note" aria-hidden="true">
        {fmt(progress.elapsed)} / {fmt(progress.total)} s
      </span>
      <label className="note">
        Vel.{" "}
        <SimField
          label="Velocidad (m/s)"
          value={state.speed}
          min={SIM_LIMITS.speed.min}
          max={SIM_LIMITS.speed.max}
          onValue={(speed) => sim.setParams({ speed })}
        />{" "}
        m/s
      </label>
      <span className="note">
        Robot{" "}
        <SimField
          label="Ancho del robot (cm)"
          value={state.width}
          min={SIM_LIMITS.size.min}
          max={SIM_LIMITS.size.max}
          onValue={(width) => sim.setParams({ width })}
        />{" "}
        ×{" "}
        <SimField
          label="Largo del robot (cm)"
          value={state.length}
          min={SIM_LIMITS.size.min}
          max={SIM_LIMITS.size.max}
          onValue={(length) => sim.setParams({ length })}
        />{" "}
        cm
      </span>
      <button type="button" className="sb" onClick={sim.close}>
        Cerrar simulación
      </button>
    </div>
  );
}
