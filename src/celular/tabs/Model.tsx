// 5. Modelo (SP-07) desde el celular: elegir mediciones repetidas del mismo lugar, correr el modelo
// (se guarda la corrida) y, si mejora, usar sus ajustes como la calibración de este celular.
import { useCallback, useEffect, useRef, useState } from "react";
import { Msg, NO_MSG, usePhone, type MsgState } from "@/celular/context";
import { surface } from "@/ui/components/measurement/draw";
import { errorText, fmtEs, GREEN_MAX_PCT, signedPct } from "@/domain/measurement/labels";
import { measurementsApi, precisionModelApi } from "@/infrastructure/http/measurements";
import type { MeasurementApi, ModelRunApi } from "@/infrastructure/contracts/measurements";

function drawRun(cv: HTMLCanvasElement | null, run: ModelRunApi | null) {
  const s = surface(cv);
  if (!s || !run) return;
  const { ctx, w, h } = s;
  const res = run.result;
  const best = res.attempts.map((a) => a.best_cost);
  const top = Math.max(res.baseline_cost, ...best, 4) * 1.15;
  const L = 36;
  const T = 10;
  const W = w - L - 10;
  const H = h - T - 22;
  const X = (i: number) => L + W * (best.length > 1 ? i / (best.length - 1) : 0);
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
  const hline = (v: number, color: string) => {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(L, Y(v));
    ctx.lineTo(L + W, Y(v));
    ctx.stroke();
    ctx.restore();
  };
  hline(GREEN_MAX_PCT, s.color("--green"));
  hline(res.baseline_cost, s.color("--yellow"));
  ctx.strokeStyle = s.color("--red");
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  best.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
  ctx.stroke();
}

export function Model({ active }: { active: boolean }) {
  const { device, refreshCal } = usePhone();
  const [items, setItems] = useState<MeasurementApi[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [msg, setMsg] = useState<MsgState>(NO_MSG);
  const [applyMsg, setApplyMsg] = useState<MsgState>(NO_MSG);
  const [run, setRun] = useState<ModelRunApi | null>(null);
  const [busy, setBusy] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    try {
      const page = await measurementsApi.list({ deviceId: device });
      const done = page.items
        .filter((m) => m.result && m.method !== "gps")
        .sort((a, b) => a.id - b.id);
      const gpsCount = page.items.filter((m) => m.result && m.method === "gps").length;
      const gpsNote = gpsCount
        ? ` Tus ${gpsCount} mediciones por GPS no salen aquí: el modelo ajusta tu paso y tu giro.`
        : "";
      setItems(done);
      if (!done.length)
        return setMsg({
          text: `Aún no tienes mediciones por pasos terminadas.${gpsNote}`,
          kind: "",
        });
      const place = done[done.length - 1].place_name;
      setPicked(
        done
          .filter((m) => m.place_name === place)
          .slice(-5)
          .map((m) => m.id),
      );
      setMsg({
        text: `Marca las mediciones del mismo lugar y toca Correr modelo.${gpsNote}`,
        kind: "",
      });
    } catch (e) {
      setMsg({ text: errorText(e), kind: "err" });
    }
  }, [device]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);
  useEffect(() => drawRun(cv.current, run), [run]);

  const ids = () => [...picked].sort((a, b) => a - b);

  async function runModel() {
    if (picked.length < 2)
      return setMsg({ text: "Elige al menos 2 mediciones (5 es lo ideal).", kind: "err" });
    setBusy(true);
    setMsg({ text: "El modelo está probando ajustes…", kind: "" });
    try {
      setRun(await precisionModelApi.run(ids()));
      setApplyMsg(NO_MSG);
      setMsg({ text: "Listo ✔ corrida guardada.", kind: "good" });
    } catch (e) {
      setMsg({ text: errorText(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    try {
      const r = await precisionModelApi.run(ids(), { apply: true });
      setApplyMsg(
        r.applied
          ? { text: "Listo ✔ tus próximas mediciones usarán estos ajustes.", kind: "good" }
          : { text: "No se aplicó: el ajuste no mejoró en la medición de prueba.", kind: "err" },
      );
      await refreshCal();
    } catch (e) {
      setApplyMsg({ text: errorText(e), kind: "err" });
    }
  }

  const res = run?.result;
  const improved = res ? res.final_cost < res.baseline_cost : false;
  const tone = !res ? "" : res.final_cost < GREEN_MAX_PCT ? "good" : improved ? "warn" : "red";
  const errOf = (x: { closure_error_pct: number; perimeter_error_pct: number | null }) =>
    x.perimeter_error_pct == null
      ? `cierre ${fmtEs(x.closure_error_pct, 1)} %`
      : signedPct(x.perimeter_error_pct);

  return (
    <>
      <section className="card">
        <div className="hd">
          <h2>Modelo que baja el error</h2>
          <span className="tag">SP-07</span>
        </div>
        <p className="hint">
          Mide el <b>mismo lugar</b> varias veces (5 es ideal) escribiendo su largo y ancho reales.
          El modelo prueba ajustar tu paso y tu giro, intento tras intento, y se queda con lo que
          baja el error. La última medición elegida se usa para comprobar que el ajuste sirve.
        </p>
        {items.length > 0 && (
          <div className="tw">
            <table className="t" aria-label="Mediciones para el modelo">
              <thead>
                <tr>
                  <th>Usar</th>
                  <th>Lugar</th>
                  <th>Cierre</th>
                  <th>Vs. real</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Usar ${m.place_name} #${m.id}`}
                        checked={picked.includes(m.id)}
                        onChange={() =>
                          setPicked((p) =>
                            p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id],
                          )
                        }
                        style={{ width: 22, height: 22 }}
                      />
                    </td>
                    <td>
                      {m.place_name} #{m.id}
                    </td>
                    <td>{fmtEs(m.result?.closure_error_pct, 1)} %</td>
                    <td>
                      {m.result?.perimeter_error_pct == null
                        ? "sin medida real"
                        : signedPct(m.result.perimeter_error_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row">
          <button
            type="button"
            className="go"
            disabled={busy || !items.length}
            onClick={() => void runModel()}
          >
            Correr modelo
          </button>
        </div>
        <Msg {...msg} />
      </section>
      {res && (
        <section className="card" aria-label="Resultado del modelo">
          <div className="hd">
            <h2>Resultado del modelo</h2>
          </div>
          <div className={`semaforo ${tone}`.trim()}>
            <span className="dotl" />
            <div>
              <b>
                {improved
                  ? `El error bajó de ${fmtEs(res.baseline_cost, 1)} % a ${fmtEs(res.final_cost, 1)} %`
                  : "El modelo no logró bajar el error"}
              </b>
              <small>
                {improved
                  ? `En ${res.attempts.length} intentos.`
                  : "Así se declara en el informe: queda como trabajo futuro."}
              </small>
            </div>
          </div>
          <canvas ref={cv} aria-label="Error del modelo por intento" />
          <p className="legend">
            Rojo: error con el modelo, por intento · Amarillo: sin modelo · Verde: meta 3 %
          </p>
          <div className="kv" style={{ marginTop: 10 }}>
            <span>Error sin modelo</span>
            <b>{fmtEs(res.baseline_cost, 1)} %</b>
            <span>Error con modelo</span>
            <b>{fmtEs(res.final_cost, 1)} %</b>
            <span>Largo del paso</span>
            <b>
              {res.initial_params.step_length_m != null
                ? `${fmtEs(res.initial_params.step_length_m, 3)} → ${fmtEs(res.final_params.step_length_m, 3)} m`
                : "—"}
            </b>
            <span>Ajuste del giro</span>
            <b>
              {fmtEs(res.initial_params.gyro_bias_dps, 2)} →{" "}
              {fmtEs(res.final_params.gyro_bias_dps, 2)} °/s
            </b>
            <span>¿Sirve en una medición nueva?</span>
            <b>
              {res.generalizes == null
                ? "Usa 3 o más mediciones para comprobarlo"
                : res.generalizes
                  ? "Sí ✔"
                  : "No: en la medición de prueba no mejoró"}
            </b>
          </div>
          <div className="tw" style={{ marginTop: 10 }}>
            <table className="t">
              <thead>
                <tr>
                  <th>Medición</th>
                  <th>Error vs real antes</th>
                  <th>Después</th>
                </tr>
              </thead>
              <tbody>
                {res.measurements.map((r) => (
                  <tr key={r.measurement_id}>
                    <td>#{r.measurement_id}</td>
                    <td>{errOf(r.before)}</td>
                    <td>{errOf(r.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button
              type="button"
              className="sb red wide"
              disabled={!improved}
              onClick={() => void apply()}
            >
              Usar estos ajustes como mi calibración
            </button>
          </div>
          <Msg {...applyMsg} />
        </section>
      )}
    </>
  );
}
