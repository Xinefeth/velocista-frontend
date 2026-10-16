// Vista Telemetría (Protoripo.html): señales en detalle, tramos y sectores de la última vuelta.
// HU-21, HU-25, EN-20.
import { useConsole } from "@/application/state/ConsoleContext";
import { Card } from "@/ui/components/Card";
import { fmt } from "@/domain/format";
import { drawChart } from "@/domain/canvas";
import { useCanvas } from "@/application/hooks/useCanvas";

const NOMBRES: Record<string, string> = {
  S: "Recta",
  L: "Curva izquierda",
  R: "Curva derecha",
  X: "Línea perdida",
};

export function Telemetry() {
  const c = useConsole();
  const ref = useCanvas((cv) => drawChart(cv, c.histRef.current, c.show));
  const keys: [keyof typeof c.show, string, string][] = [
    ["err", "var(--red)", "Error"],
    ["pl", "var(--ink)", "PWM izquierdo"],
    ["pr", "var(--dim)", "PWM derecho"],
  ];
  const lap = c.lastLap && c.lastLap.fin ? c.lastLap : null;
  const tot = lap ? lap.segs.reduce((a, s) => a + s.dur, 0) || 1 : 1;
  const mxSec = lap ? Math.max(...lap.sec) : 0;
  return (
    <section className="view on dv" aria-label="Telemetría">
      <Card className="s12" pbi="HU-21" sprint="2">
        <div className="hd">
          <h2>
            Señales <small>detalle</small>
          </h2>
          <div className="keys">
            {keys.map(([k, col, t]) => (
              <button
                key={k}
                type="button"
                aria-pressed={c.show[k]}
                onClick={() => c.toggleSignal(k)}
              >
                <i style={{ background: col }} />
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="bigchart">
          <canvas ref={ref} role="img" aria-label="Error y PWM de cada motor, vista grande" />
        </div>
      </Card>

      <Card className="s8" pbi="HU-25 · EN-20" sprint="2">
        <div className="hd">
          <h2>
            Tramos de la última vuelta <small>estimados sin IMU</small>
          </h2>
        </div>
        <div className="ribbon">
          {lap?.segs.map((s, i) => (
            <span
              key={i}
              className={s.k}
              style={{ flex: `${s.dur / tot} 1 0` }}
              title={`${NOMBRES[s.k]}, ${fmt(s.dur, 2)} s`}
            />
          ))}
        </div>
        <div className="rkey">
          <span>
            <i style={{ background: "var(--panel3)" }} />
            Recta
          </span>
          <span>
            <i style={{ background: "var(--mid)" }} />
            Curva izquierda
          </span>
          <span>
            <i style={{ background: "var(--red)" }} />
            Curva derecha
          </span>
          <span>
            <i style={{ background: "var(--yellow)" }} />
            Línea perdida
          </span>
        </div>
        <ul className="segs">
          {!lap ? (
            <li className="empty" style={{ border: 0, background: "none", padding: 0 }}>
              Completa una vuelta para ver sus tramos.
            </li>
          ) : (
            lap.segs.map((s, i) => {
              const m = s.ie / s.dur;
              const deg = s.k === "L" || s.k === "R" ? `, ~${Math.round(Math.abs(s.deg))}°` : "";
              return (
                <li key={i}>
                  <div className="k">
                    {i + 1}. {NOMBRES[s.k]}
                    {deg}
                  </div>
                  <div className="v">{fmt(s.dur, 2)} s</div>
                  <div className={`e ${m > 0.35 ? "hi" : ""}`}>error medio {fmt(m, 2)}</div>
                </li>
              );
            })
          )}
        </ul>
      </Card>

      <Card className="s4" pbi="HU-25" sprint="2">
        <div className="hd">
          <h2>Sectores de la última vuelta</h2>
        </div>
        <div>
          {!lap ? (
            <p className="empty" style={{ margin: 0 }}>
              Aún no hay una vuelta completa.
            </p>
          ) : (
            lap.sec.map((t, i) => {
              const isB = Math.abs(t - c.bestSec[i]) < 1e-9;
              return (
                <div className="secbar" key={i}>
                  <div className="r">
                    <span>
                      Sector {i + 1}
                      {isB ? ", mejor" : ""}
                    </span>
                    <b>{fmt(t, 3)} s</b>
                  </div>
                  <div className="t">
                    <i className={isB ? "best" : ""} style={{ width: `${(t / mxSec) * 100}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </section>
  );
}
