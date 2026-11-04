// Modelo que reajusta la precisión (SP-07). Primero el algoritmo solo (línea base) y luego el
// modelo de refuerzo simple sobre mediciones repetidas del mismo lugar; la curva muestra si el
// error de cierre baja intento a intento. El cálculo es del backend (POST /precision-model/evaluations)
// y no guarda nada ni cambia la calibración del celular.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/ui/components/Card";
import { Hint, Kpis, Semaforo } from "@/ui/components/measurement/MeasurementUi";
import { surface } from "@/ui/components/measurement/draw";
import { useCanvas } from "@/application/hooks/useCanvas";
import {
  deviceCode,
  errorText,
  fmtEs,
  GREEN_MAX_PCT,
  signedPct,
  VERDICT,
} from "@/domain/measurement/labels";
import { measurementsApi, precisionModelApi } from "@/infrastructure/http/measurements";
import type { MeasurementApi, ModelEvaluationApi } from "@/infrastructure/contracts/measurements";

export const MIN_MEASUREMENTS = 2;
const PRESELECT = 5;

/** Mediciones que el modelo puede ajustar (terminadas y no por GPS), de la más antigua a la más nueva. */
export function tunable(items: MeasurementApi[]): MeasurementApi[] {
  return items.filter((m) => m.result && m.method !== "gps").sort((a, b) => a.id - b.id);
}

/** Preselección: las últimas 5 del lugar medido más recientemente. */
export function preselect(items: MeasurementApi[]): number[] {
  if (!items.length) return [];
  const place = items[items.length - 1].place_name;
  return items
    .filter((m) => m.place_name === place)
    .slice(-PRESELECT)
    .map((m) => m.id);
}

function drawCurve(cv: HTMLCanvasElement, ev: ModelEvaluationApi | null) {
  const s = surface(cv);
  if (!s || !ev || !ev.curve.length) return;
  const { ctx, w, h } = s;
  const L = 36;
  const B = 22;
  const T = 10;
  const W = w - L - 10;
  const H = h - T - B;
  const values = ev.curve.flatMap((p) => [p.with_model_pct ?? 0, p.without_model_pct ?? 0]);
  const top = Math.max(...values, GREEN_MAX_PCT + 1) * 1.15;
  const n = ev.curve.length - 1 || 1;
  const X = (i: number) => L + (W * i) / n;
  const Y = (v: number) => T + H - (H * Math.min(v, top)) / top;
  ctx.font = `10px ${s.color("--mono")}`;
  ctx.fillStyle = s.color("--dim");
  ctx.strokeStyle = s.color("--line");
  for (let i = 0; i <= 4; i++) {
    const v = (top * i) / 4;
    ctx.beginPath();
    ctx.moveTo(L, Y(v));
    ctx.lineTo(L + W, Y(v));
    ctx.stroke();
    ctx.fillText(`${fmtEs(v, 0)}%`, 2, Y(v) + 3);
  }
  ctx.fillText("intentos →", L + W - 60, h - 6);
  const series = (key: "with_model_pct" | "without_model_pct", color: string, dash: number[]) => {
    ctx.save();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = key === "with_model_pct" ? 2.4 : 1.6;
    ctx.beginPath();
    ev.curve.forEach((p, i) => {
      const v = p[key];
      if (v == null) return;
      if (i) ctx.lineTo(X(i), Y(v));
      else ctx.moveTo(X(i), Y(v));
    });
    ctx.stroke();
    ctx.restore();
  };
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = s.color("--green");
  ctx.beginPath();
  ctx.moveTo(L, Y(GREEN_MAX_PCT));
  ctx.lineTo(L + W, Y(GREEN_MAX_PCT));
  ctx.stroke();
  ctx.restore();
  series("without_model_pct", s.color("--yellow"), [5, 4]);
  series("with_model_pct", s.color("--red"), []);
}

export function PrecisionModel() {
  const [items, setItems] = useState<MeasurementApi[]>([]);
  const [device, setDevice] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [attempts, setAttempts] = useState("40");
  const [ev, setEv] = useState<ModelEvaluationApi | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean }>({ text: "", error: false });

  useEffect(() => {
    let alive = true;
    measurementsApi
      .list()
      .then((page) => {
        if (!alive) return;
        const list = tunable(page.items);
        setItems(list);
        const last = list[list.length - 1];
        if (last) {
          setDevice(last.device_id);
          setSelected(preselect(list.filter((m) => m.device_id === last.device_id)));
        }
      })
      .catch((e) => alive && setMsg({ text: errorText(e), error: true }));
    return () => {
      alive = false;
    };
  }, []);

  const devices = useMemo(() => [...new Set(items.map((m) => m.device_id))], [items]);
  const mine = useMemo(() => items.filter((m) => m.device_id === device), [items, device]);
  const curve = useCanvas((cv) => drawCurve(cv, ev));

  const pickDevice = (d: string) => {
    setDevice(d);
    setSelected(preselect(items.filter((m) => m.device_id === d)));
    setEv(null);
  };
  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function evaluate() {
    const n = Number(attempts);
    if (selected.length < MIN_MEASUREMENTS)
      return setMsg({ text: "Elige al menos 2 mediciones (5 es lo ideal).", error: true });
    if (!Number.isInteger(n) || n < 1 || n > 200)
      return setMsg({ text: "Los intentos deben ser un número entero de 1 a 200.", error: true });
    setBusy(true);
    setMsg({ text: "El modelo está probando ajustes…", error: false });
    try {
      // en el orden en que se midieron: la última elegida es la de validación
      const ids = [...selected].sort((a, b) => a - b);
      setEv(await precisionModelApi.evaluate(ids, n));
      setMsg({ text: "", error: false });
    } catch (e) {
      setEv(null);
      setMsg({ text: errorText(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  const verdict = ev ? VERDICT[ev.verdict] : null;
  const step = (p: Record<string, number>) =>
    p.step_length_m != null ? `${fmtEs(p.step_length_m, 3)} m` : "—";

  return (
    <Card className="s12" pbi="SP-07" sprint="2">
      <div className="hd">
        <h2>Modelo que reajusta la precisión</h2>
        <span className="tag">{ev ? `${ev.curve.length - 1} intentos` : "Sin evaluar"}</span>
      </div>
      <p className="note" style={{ margin: "0 0 10px" }}>
        Primero el algoritmo (calibración y corrección por cierre) como línea base. Después, un
        modelo simple de refuerzo ajusta el sesgo del giroscopio y el largo del paso con mediciones
        repetidas del mismo lugar, usando el error de cierre como castigo. La última medición
        elegida se aparta para comprobar que el ajuste sirve. No cambia el cálculo ni la
        calibración.
      </p>
      <div className="g2">
        <div>
          <label className="fld">
            <span className="lbl">Celular</span>
            <select
              className="inp"
              value={device}
              onChange={(e) => pickDevice(e.target.value)}
              aria-label="Celular del modelo"
            >
              {!devices.length && <option value="">Sin mediciones por pasos</option>}
              {devices.map((d) => (
                <option key={d} value={d}>
                  {deviceCode(d)}
                </option>
              ))}
            </select>
          </label>
          <div className="tw" style={{ maxHeight: 240, overflow: "auto", marginTop: 10 }}>
            <table className="t">
              <thead>
                <tr>
                  <th className="l">Usar</th>
                  <th className="l">Medición</th>
                  <th>Cierre</th>
                  <th>Vs. plano</th>
                </tr>
              </thead>
              <tbody>
                {!mine.length && (
                  <tr>
                    <td className="l" colSpan={4}>
                      Aún no hay mediciones por pasos terminadas.
                    </td>
                  </tr>
                )}
                {mine.map((m) => (
                  <tr key={m.id}>
                    <td className="l">
                      <input
                        type="checkbox"
                        checked={selected.includes(m.id)}
                        onChange={() => toggle(m.id)}
                        aria-label={`Usar ${m.place_name} #${m.id}`}
                      />
                    </td>
                    <td className="l">
                      {m.place_name} #{m.id}
                    </td>
                    <td>{fmtEs(m.result?.closure_error_pct, 1)} %</td>
                    <td>{signedPct(m.result?.perimeter_error_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="g2" style={{ marginTop: 10 }}>
            <label className="fld">
              <span className="lbl">Intentos</span>
              <input
                className="inp m"
                type="number"
                min={1}
                max={200}
                value={attempts}
                onChange={(e) => setAttempts(e.target.value)}
                aria-label="Intentos del modelo"
              />
            </label>
            <div className="fld" style={{ alignSelf: "end" }}>
              <button
                type="button"
                className="sb red"
                style={{ height: 40, width: "100%" }}
                disabled={busy}
                onClick={() => void evaluate()}
              >
                Evaluar modelo
              </button>
            </div>
          </div>
          <Hint text={msg.text} error={msg.error} />
        </div>
        <div>
          {verdict && ev ? (
            <Semaforo tone={verdict.tone} title={verdict.label} sub={verdict.desc} />
          ) : (
            <Semaforo title="Sin evaluar" sub="Elige mediciones del mismo lugar y evalúa." />
          )}
          <div className="cv h220">
            <canvas ref={curve} role="img" aria-label="Error de cierre por intento" />
          </div>
          <div className="legend">
            <span>
              <i className="ln dash" style={{ borderColor: "var(--yellow)" }} />
              Sin modelo
            </span>
            <span>
              <i className="ln" style={{ borderColor: "var(--red)" }} />
              Con modelo
            </span>
            <span>
              <i className="ln dash" style={{ borderColor: "var(--green)" }} />
              Meta {GREEN_MAX_PCT} %
            </span>
          </div>
        </div>
      </div>
      {ev && (
        <>
          <div style={{ marginTop: 12 }}>
            <Kpis
              label="Resultado del modelo"
              items={[
                {
                  label: "Sin modelo",
                  value: fmtEs(ev.baseline.mean_closure_error_pct, 1),
                  unit: "%",
                  tone: "warn",
                },
                {
                  label: "Con modelo",
                  value: fmtEs(ev.model.mean_closure_error_pct, 1),
                  unit: "%",
                  tone: ev.meets_green ? "good" : "",
                },
                { label: "Mejora", value: fmtEs(ev.improvement_pct_points, 2), unit: "pts" },
                {
                  label: "Mediciones",
                  value: `${ev.train_count} + ${ev.holdout_measurement_id ? 1 : 0}`,
                  unit: "ajuste + validación",
                },
                {
                  label: "Paso",
                  value: `${step(ev.initial_params)} → ${step(ev.final_params)}`,
                },
                {
                  label: "Sesgo del giro",
                  value: `${fmtEs(ev.initial_params.gyro_bias_dps, 2)} → ${fmtEs(ev.final_params.gyro_bias_dps, 2)}`,
                  unit: "°/s",
                },
              ]}
            />
          </div>
          <p className="note">
            ¿Sirve en una medición nueva?{" "}
            {ev.generalizes == null
              ? "Usa 3 o más mediciones para comprobarlo."
              : ev.generalizes
                ? "Sí: también bajó en la medición de validación."
                : "No: en la medición de validación no mejoró."}
          </p>
          <div className="tw">
            <table className="t" aria-label="Error antes y después del modelo">
              <thead>
                <tr>
                  <th className="l">Medición</th>
                  <th className="l">Uso</th>
                  <th>Cierre antes</th>
                  <th>Cierre después</th>
                  <th>Plano antes</th>
                  <th>Plano después</th>
                </tr>
              </thead>
              <tbody>
                {ev.measurements.map((r) => (
                  <tr key={r.measurement_id}>
                    <td className="l">#{r.measurement_id}</td>
                    <td className="l">{r.role === "holdout" ? "Validación" : "Ajuste"}</td>
                    <td>
                      {fmtEs(r.before.closure_error_m, 2)} m ·{" "}
                      {fmtEs(r.before.closure_error_pct, 1)} %
                    </td>
                    <td>
                      {fmtEs(r.after.closure_error_m, 2)} m · {fmtEs(r.after.closure_error_pct, 1)}{" "}
                      %
                    </td>
                    <td>{signedPct(r.before.perimeter_error_pct)}</td>
                    <td>{signedPct(r.after.perimeter_error_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
