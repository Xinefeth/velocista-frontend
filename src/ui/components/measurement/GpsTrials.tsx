// Error del GPS del celular frente a la cinta (SP-06, HU-42): pruebas guardadas, error por método,
// gráfico por prueba y desde qué tamaño de lugar sirve el GPS. Las pruebas se hacen con la página
// del celular (pestaña «Error GPS»); aquí se analizan con datos reales del backend.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/ui/components/Card";
import { Hint, Kpis, Semaforo } from "@/ui/components/measurement/MeasurementUi";
import { surface } from "@/ui/components/measurement/draw";
import { useCanvas } from "@/application/hooks/useCanvas";
import { deviceCode, errorText, fmtEs } from "@/domain/measurement/labels";
import { gpsFits, TARGET_PCT } from "@/domain/measurement/gpsFit";
import {
  DistanceTable,
  EnvironmentTable,
  GpsConclusion,
  ReportedVsReal,
  WaitTables,
} from "@/ui/components/measurement/GpsSizePanels";
import { gpsApi } from "@/infrastructure/http/measurements";
import type { GpsSummaryApi, GpsTrialApi } from "@/infrastructure/contracts/measurements";

const ENV: Record<string, string> = {
  open: "Aire libre",
  buildings: "Cerca de edificios",
  trees: "Bajo árboles",
  indoor: "Bajo techo",
};

function drawChart(cv: HTMLCanvasElement, trials: GpsTrialApi[]) {
  const s = surface(cv);
  if (!s || !trials.length) return;
  const { ctx, w, h } = s;
  const L = 34;
  const B = 22;
  const T = 10;
  const W = w - L - 8;
  const H = h - T - B;
  const values = trials.flatMap((t) => [
    t.result.methods.single.error_m,
    t.result.methods.filtered.error_m,
  ]);
  const top = Math.max(...values, 1) * 1.15;
  const Y = (v: number) => T + H - (H * v) / top;
  ctx.font = `10px ${s.color("--mono")}`;
  ctx.fillStyle = s.color("--dim");
  ctx.strokeStyle = s.color("--line");
  for (let i = 0; i <= 4; i++) {
    const v = (top * i) / 4;
    ctx.beginPath();
    ctx.moveTo(L, Y(v));
    ctx.lineTo(L + W, Y(v));
    ctx.stroke();
    ctx.fillText(`${fmtEs(v, 0)} m`, 0, Y(v) + 3);
  }
  const slot = W / trials.length;
  const bar = Math.min(18, slot / 3);
  trials.forEach((t, i) => {
    const x = L + slot * i + slot / 2;
    const single = t.result.methods.single.error_m;
    const filtered = t.result.methods.filtered.error_m;
    ctx.fillStyle = s.color("--yellow");
    ctx.fillRect(x - bar - 1, Y(single), bar, T + H - Y(single));
    ctx.fillStyle = s.color("--green");
    ctx.fillRect(x + 1, Y(filtered), bar, T + H - Y(filtered));
    ctx.fillStyle = s.color("--dim");
    ctx.textAlign = "center";
    ctx.fillText(`#${t.id}`, x, h - 6);
    ctx.textAlign = "start";
  });
}

export function GpsTrials() {
  const [trials, setTrials] = useState<GpsTrialApi[]>([]);
  const [summary, setSummary] = useState<GpsSummaryApi | null>(null);
  const [device, setDevice] = useState("");
  const [devices, setDevices] = useState<string[]>([]);
  const [side, setSide] = useState("6");
  // CU-4: objetivo y mínimo de pruebas configurables; vacío = lo que diga el servidor
  const [target, setTarget] = useState(String(TARGET_PCT));
  const [minTrials, setMinTrials] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");

  const targetN = positive(target);
  const minN = positive(minTrials, true);

  const load = useCallback(async (deviceId: string, targetPct?: number, minCount?: number) => {
    setState("loading");
    try {
      const [list, sum] = await Promise.all([
        gpsApi.list(deviceId || undefined),
        gpsApi.summary(deviceId || undefined, targetPct, minCount),
      ]);
      setTrials(list);
      setSummary(sum);
      if (!deviceId) setDevices([...new Set(list.map((t) => t.device_id))]);
      setState("ok");
    } catch (e) {
      setError(errorText(e));
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load(device, targetN, minN);
  }, [device, targetN, minN, load]);

  const ordered = useMemo(() => [...trials].sort((a, b) => a.id - b.id), [trials]);
  const chart = useCanvas((cv) => drawChart(cv, ordered));
  const single = summary?.methods.single;
  const best = summary?.best_method ? summary.methods[summary.best_method] : undefined;
  const targetShown = summary?.config?.target_pct ?? summary?.target_pct ?? targetN ?? TARGET_PCT;
  const verdict = gpsFits(Number(side), summary?.min_side_m ?? null);

  return (
    <>
      <Card className="s5" pbi="SP-06" sprint="2">
        <div className="hd">
          <h2>Nueva prueba</h2>
          <span className="tag">Con el celular</span>
        </div>
        <ol className="steps" style={{ marginBottom: 12 }}>
          <li className="done">
            <span>1</span>Mide con cinta una distancia real entre dos puntos (15 m o más).
          </li>
          <li className="cur">
            <span>2</span>En la página del celular, pestaña «Error GPS», quédate quieta en el
            inicio, camina y quédate quieta en el final.
          </li>
          <li className="todo">
            <span>3</span>El backend compara la distancia del GPS con la real y la prueba aparece
            aquí.
          </li>
        </ol>
        <label className="fld">
          <span className="lbl">Celular</span>
          <select
            className="inp"
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            aria-label="Celular"
          >
            <option value="">Todos los celulares</option>
            {devices.map((d) => (
              <option key={d} value={d}>
                {deviceCode(d)}
              </option>
            ))}
          </select>
        </label>
        <div className="g2" style={{ marginTop: 10 }}>
          <label className="fld">
            <span className="lbl">Error objetivo (%)</span>
            <input
              className="inp m"
              inputMode="decimal"
              aria-label="Error objetivo del GPS (%)"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <label className="fld">
            <span className="lbl">Mínimo de pruebas por entorno</span>
            <input
              className="inp m"
              inputMode="numeric"
              aria-label="Mínimo de pruebas por entorno"
              placeholder={summary?.config ? String(summary.config.min_trials) : ""}
              value={minTrials}
              onChange={(e) => setMinTrials(e.target.value)}
            />
          </label>
        </div>
        <div className="acts" style={{ marginTop: 10 }}>
          <button type="button" className="sb" onClick={() => void load(device, targetN, minN)}>
            Actualizar
          </button>
        </div>
        <p className="note">
          Haz al menos 3 pruebas en lugares distintos (aire libre y cerca de edificios) para el
          informe.
        </p>
      </Card>

      <Card className="s7" pbi="HU-42" sprint="2">
        <div className="hd">
          <h2>Error frente a la realidad</h2>
          <span className="tag">{summary?.trials ?? 0} pruebas</span>
        </div>
        {state === "error" && <Hint text={error} error />}
        <Kpis
          label="Resumen del error del GPS"
          items={[
            { label: "Pruebas", value: summary?.trials ?? "—" },
            { label: "1 lectura", value: fmtEs(single?.mean_error_m), unit: "m" },
            {
              label: "Promediando",
              value: fmtEs(best?.mean_error_m),
              unit: "m",
              tone: best ? "good" : "",
            },
            { label: "Mejora", value: fmtEs(summary?.improvement_pct, 0), unit: "%" },
          ]}
        />
        <div className="cv h220" style={{ marginTop: 10 }}>
          <canvas ref={chart} role="img" aria-label="Error del GPS por prueba" />
        </div>
        <div className="legend">
          <span>
            <i className="ln" style={{ borderColor: "var(--yellow)" }} />1 lectura (como una app)
          </span>
          <span>
            <i className="ln" style={{ borderColor: "var(--green)" }} />
            Promedio filtrado
          </span>
        </div>
        <div className="tw" style={{ marginTop: 10 }}>
          <table className="t compact">
            <thead>
              <tr>
                <th className="l">Lugar</th>
                <th>Real (m)</th>
                <th>1 lectura</th>
                <th>Promedio</th>
                <th>Filtrado</th>
                <th>Precisión informada</th>
              </tr>
            </thead>
            <tbody>
              {state === "loading" && !ordered.length && (
                <tr>
                  <td className="l" colSpan={6}>
                    Cargando…
                  </td>
                </tr>
              )}
              {state !== "loading" && !ordered.length && (
                <tr>
                  <td className="l" colSpan={6}>
                    Aún no hay pruebas del GPS.
                  </td>
                </tr>
              )}
              {ordered.map((t) => {
                const m = t.result.methods;
                return (
                  <tr key={t.id}>
                    <td className="l">
                      {t.place_name} #{t.id}
                      <br />
                      <small className="muted">{ENV[t.environment] ?? t.environment}</small>
                    </td>
                    <td>{fmtEs(t.real_distance_m, 1)}</td>
                    <td>{fmtEs(m.single.error_m, 1)} m</td>
                    <td>{fmtEs(m.mean.error_m, 1)} m</td>
                    <td>{fmtEs(m.filtered.error_m, 1)} m</td>
                    <td>± {fmtEs(t.result.reported_accuracy_m, 1)} m</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          Error en metros frente a la distancia medida con cinta. «Filtrado» descarta las lecturas
          con mala precisión y promedia el resto según su precisión.
        </p>
      </Card>

      <Card className="s5" pbi="HU-42" sprint="2">
        <div className="hd">
          <h2>¿Sirve el GPS en este lugar?</h2>
        </div>
        {verdict ? (
          <Semaforo tone={verdict.tone} title={verdict.title} sub={verdict.sub} />
        ) : (
          <Semaforo
            title="Faltan pruebas"
            sub="Con la primera prueba del GPS se calcula el límite."
          />
        )}
        <label className="fld">
          <span className="lbl">Lado más corto del lugar a medir (m)</span>
          <input
            className="inp m"
            type="number"
            min={1}
            value={side}
            onChange={(e) => setSide(e.target.value)}
            aria-label="Lado más corto del lugar a medir"
          />
        </label>
        <ul className="checks" style={{ marginTop: 10 }}>
          <li className="warn">
            <span className="ic" />
            <span>
              <b>Referencia de las apps de mapas</b>
              <small>Las apps de taxi tienen errores de hasta 10 m, a veces 15 m.</small>
            </span>
          </li>
          <li className="ok">
            <span className="ic" />
            <span>
              <b>Regla del equipo</b>
              <small>
                El GPS sirve si su error máximo es menor al {fmtEs(targetShown, 0)} % del lado más
                corto:{" "}
                {summary?.min_side_m != null
                  ? `lado mínimo ${fmtEs(summary.min_side_m, 0)} m.`
                  : "falta la primera prueba."}
              </small>
            </span>
          </li>
        </ul>
      </Card>

      <Card className="s7" pbi="CU-4" sprint="2">
        <div className="hd">
          <h2>Lado mínimo por entorno</h2>
        </div>
        <EnvironmentTable summary={summary} />
        <GpsConclusion summary={summary} />
      </Card>

      <Card className="s5" pbi="CU-4" sprint="2">
        <div className="hd">
          <h2>Error según la distancia</h2>
        </div>
        <DistanceTable summary={summary} />
      </Card>

      <Card className="s7" pbi="CU-4" sprint="2">
        <div className="hd">
          <h2>Esperar a la precisión antes de medir</h2>
        </div>
        <WaitTables summary={summary} />
      </Card>

      <Card className="s5" pbi="CU-4" sprint="2">
        <div className="hd">
          <h2>Precisión informada frente a la real</h2>
        </div>
        <ReportedVsReal summary={summary} />
      </Card>
    </>
  );
}

/** Número mayor que 0 escrito en un campo (coma o punto), o `undefined` si está vacío o no sirve. */
function positive(v: string, integer = false): number | undefined {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 && (!integer || Number.isInteger(n))
    ? n
    : undefined;
}
