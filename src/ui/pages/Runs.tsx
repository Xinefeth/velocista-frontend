// Vista Corridas y optimización (Protoripo.html): gráfico de corridas, ingeniero de pista
// (Twiddle/bayesiana), estudio de optimización y tabla con exportación CSV.
// HU-19, HU-20, HU-26, HU-27, HU-28, HU-29.
import { useEffect, useRef, useState } from "react";
import { useConsole } from "@/application/state/ConsoleContext";
import { Card } from "@/ui/components/Card";
import { CTRL, psum } from "@/shared/data/controllers";
import { fmt } from "@/domain/format";
import { themeColors } from "@/domain/canvas";

function RunChart() {
  const c = useConsole();
  const rs = c.runs.filter((r) => r.robot === c.robotId);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartH, setChartH] = useState(250);
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const medir = () => setChartH(el.clientHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fins = rs.filter((r) => r.fin);
  const maxJ = Math.max(5, ...rs.filter((r) => r.fin).map((r) => r.J)) * 1.2;
  const best = fins.length ? fins.reduce((a, b) => (a.J < b.J ? a : b)) : null;
  const H = Math.max(40, chartH - 32);
  return (
    <div className="runchart" ref={chartRef}>
      <div className="gl">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ bottom: `${i * 25}%` }}>
            <b>{Math.round((maxJ * i) / 4)}</b>
          </span>
        ))}
      </div>
      {!rs.length && (
        <p className="empty" style={{ margin: "auto", alignSelf: "center" }}>
          Aún no hay corridas. Calibra, arranca y deja que el robot complete una vuelta.
        </p>
      )}
      {rs.map((r) => (
        <div key={r.n} className={`rc ${r === best ? "best" : ""}`} data-c={r.ctrl}>
          {r.fin ? (
            <div className="st2" title={`#${r.n} · ${CTRL[r.ctrl].name} · J ${fmt(r.J, 2)}`}>
              <div className="e" style={{ height: `${Math.min(H, ((2 * r.iae) / maxJ) * H)}px` }} />
              <div className="t" style={{ height: `${Math.min(H, (r.t! / maxJ) * H)}px` }} />
            </div>
          ) : (
            <div
              className="st2 dnf"
              style={{ height: `${H * 0.9}px` }}
              title={`#${r.n} · no terminó`}
            />
          )}
          <span className="rx">#{r.n}</span>
        </div>
      ))}
    </div>
  );
}

function EngineerPanel() {
  const c = useConsole();
  const v = c.engineer.vista(c.applied.controller);
  return (
    <Card className="s4 engbig" pbi="HU-27 · HU-28" sprint="2">
      <div className="hd">
        <h2>Ingeniero de pista</h2>
        <div className="seg" role="group" aria-label="Método">
          <button
            type="button"
            aria-pressed={c.engMethod === "twiddle"}
            onClick={() => c.setEngMethod("twiddle")}
          >
            Twiddle
          </button>
          <button
            type="button"
            aria-pressed={c.engMethod === "bayes"}
            onClick={() => c.setEngMethod("bayes")}
          >
            Bayesiana
          </button>
        </div>
      </div>
      <p dangerouslySetInnerHTML={{ __html: v.msg }} />
      <div className="nx">
        {v.nx.map((n, i) => (
          <div key={i}>
            <div className="lbl">{n.label}</div>
            <div className="v">{n.val}</div>
            <div className={`d ${n.dir}`}>{n.delta}</div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="sb red"
        disabled={!v.hasProp || c.locked}
        style={{ width: "100%", height: 38 }}
        onClick={c.loadProposal}
      >
        Cargar en el setup
      </button>
      <div className="bj">
        <span className="lbl">
          Mejor J · <span>{v.ctrlNm}</span>
        </span>
        <b>{v.best != null ? fmt(v.best, 2) : "—"}</b>
      </div>
      <p style={{ marginTop: 10, fontSize: 11.5, color: "var(--dim)" }}>
        J = tiempo + 2 × error acumulado; si no termina, J = 120 (límite del reglamento). Cada
        controlador tiene su propio estudio.
      </p>
    </Card>
  );
}

function Estudio() {
  const c = useConsole();
  const col = themeColors();
  const rs = c.runs.filter((r) => r.robot === c.robotId);
  if (!rs.length) {
    return (
      <Card className="s12" pbi="HU-29" sprint="2">
        <div className="hd">
          <h2>
            Estudio de optimización <small>{c.robot.name}</small>
          </h2>
          <span className="tag">Sin datos</span>
        </div>
        <div className="dv" style={{ display: "grid", gap: 12 }}>
          <div className="s7">
            <div className="kpis">
              {[
                "Corridas evaluadas",
                "Mejor J",
                "Mejor tiempo",
                "Mejora de J vs. primera",
                "No terminadas",
                "Mejor setup",
              ].map((l) => (
                <div key={l}>
                  <div className="lbl">{l}</div>
                  <div className="v">—</div>
                </div>
              ))}
            </div>
          </div>
          <div className="s5">
            <table className="mini">
              <thead>
                <tr>
                  <th>Controller</th>
                  <th>Corridas</th>
                  <th>Mejor J</th>
                  <th>Mejor tiempo</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4} className="empty">
                    Aún no hay corridas.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    );
  }
  const best = rs.reduce((a, b) => (a.J < b.J ? a : b));
  const fins = rs.filter((r) => r.fin);
  const bestT = fins.length ? Math.min(...fins.map((r) => r.t!)) : null;
  const first = rs[0];
  const imp = ((first.J - best.J) / first.J) * 100;
  const dnf = rs.filter((r) => !r.fin).length;
  return (
    <Card className="s12" pbi="HU-29" sprint="2">
      <div className="hd">
        <h2>
          Estudio de optimización <small>{c.robot.name}</small>
        </h2>
        <span className="tag good">{`${rs.length} corrida${rs.length > 1 ? "s" : ""}`}</span>
      </div>
      <div className="dv" style={{ display: "grid", gap: 12 }}>
        <div className="s7">
          <div className="kpis">
            <div>
              <div className="lbl">Corridas evaluadas</div>
              <div className="v">{rs.length}</div>
            </div>
            <div>
              <div className="lbl">Mejor J</div>
              <div className="v purple">{fmt(best.J, 2)}</div>
            </div>
            <div>
              <div className="lbl">Mejor tiempo</div>
              <div className="v">
                {bestT != null ? (
                  <>
                    {fmt(bestT, 3)}
                    <small> s</small>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <div className="lbl">Mejora de J vs. primera</div>
              <div className={`v ${imp > 0 ? "good" : ""}`}>
                {fmt(Math.max(0, imp), 1)}
                <small> %</small>
              </div>
            </div>
            <div>
              <div className="lbl">No terminadas</div>
              <div className="v">{dnf}</div>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <div className="lbl">Mejor setup · {CTRL[best.ctrl].name}</div>
              <div className="v" style={{ fontSize: 14, marginTop: 6 }}>
                {psum(best.ctrl, best.p)}
              </div>
            </div>
          </div>
        </div>
        <div className="s5">
          <table className="mini">
            <thead>
              <tr>
                <th>Controller</th>
                <th>Corridas</th>
                <th>Mejor J</th>
                <th>Mejor tiempo</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(CTRL).map((k) => {
                const x = rs.filter((r) => r.ctrl === k);
                if (!x.length)
                  return (
                    <tr key={k}>
                      <td>
                        <span className="cchip" data-c={k}>
                          {CTRL[k].short}
                        </span>
                      </td>
                      <td className="m dimt" colSpan={3}>
                        sin corridas
                      </td>
                    </tr>
                  );
                const b = x.reduce((a, z) => (a.J < z.J ? a : z));
                const ft = x.filter((r) => r.fin);
                return (
                  <tr key={k}>
                    <td>
                      <span className="cchip" data-c={k}>
                        {CTRL[k].short}
                      </span>
                    </td>
                    <td className="m">{x.length}</td>
                    <td className="m" style={{ color: b === best ? col["--purple"] : "" }}>
                      {fmt(b.J, 2)}
                    </td>
                    <td className="m">
                      {ft.length ? fmt(Math.min(...ft.map((r) => r.t!)), 3) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function Tabla() {
  const c = useConsole();
  const [sortBy, setSortBy] = useState<"t" | "J" | "n">("t");
  const [csv, setCsv] = useState<string | null>(null);
  const rs = c.runs.filter((r) => r.robot === c.robotId);
  const fins = rs.filter((r) => r.fin);
  const bestT = fins.length ? Math.min(...fins.map((r) => r.t!)) : null;
  const bs = [0, 1, 2].map((i) => {
    const v = fins.map((r) => r.sec[i]).filter((x) => x != null) as number[];
    return v.length ? Math.min(...v) : null;
  });
  const rank = [...rs].sort(
    (a, b) => (a.fin === b.fin ? 0 : a.fin ? -1 : 1) || (a.fin ? a.t! - b.t! : 0),
  );
  const rows =
    sortBy === "t" ? rank : sortBy === "J" ? [...rs].sort((a, b) => a.J - b.J) : [...rs].reverse();

  const copiar = async () => {
    const ks = [...new Set(Object.values(CTRL).flatMap((x) => x.keys))];
    const head = [
      "n",
      "robot",
      "version",
      "controlador",
      ...ks,
      "vbat",
      "tiempo_s",
      "s1",
      "s2",
      "s3",
      "error_acum",
      "termino",
      "J",
      "fuente",
      "nota",
    ].join(",");
    const body = rs.map((r) =>
      [
        r.n,
        r.robot,
        r.ver,
        r.ctrl,
        ...ks.map((k) => r.p[k] ?? ""),
        fmt(r.vbat, 2),
        r.fin ? fmt(r.t!, 3) : "",
        ...[0, 1, 2].map((i) => (r.sec[i] != null ? fmt(r.sec[i], 3) : "")),
        fmt(r.iae, 3),
        r.fin ? 1 : 0,
        fmt(r.J, 3),
        r.src,
        `"${(r.note || "").replace(/"/g, '""')}"`,
      ].join(","),
    );
    const texto = [head, ...body].join("\n");
    if (!rs.length) return c.showToast("Aún no hay corridas para copiar.");
    try {
      await navigator.clipboard.writeText(texto);
      c.showToast("CSV copiado al portapapeles.");
    } catch {
      setCsv(texto);
      c.showToast("Selecciona y copia el CSV.");
    }
  };

  return (
    <Card className="s12" pbi="HU-20 · HU-26" sprint="2">
      <div className="tools">
        <div className="seg" role="group" aria-label="Ordenar">
          <button type="button" aria-pressed={sortBy === "t"} onClick={() => setSortBy("t")}>
            Por tiempo
          </button>
          <button type="button" aria-pressed={sortBy === "J"} onClick={() => setSortBy("J")}>
            Por J
          </button>
          <button type="button" aria-pressed={sortBy === "n"} onClick={() => setSortBy("n")}>
            Recientes
          </button>
        </div>
        <button type="button" className="sb ghost" onClick={copiar}>
          Copiar CSV
        </button>
      </div>
      <div className="table">
        <table className="t">
          <thead>
            <tr>
              <th className="l">Pos</th>
              <th className="l">Corrida</th>
              <th className="l">Control</th>
              <th>Tiempo</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3</th>
              <th className="l">Parámetros</th>
              <th>Batería</th>
              <th>J</th>
              <th className="l">Fuente</th>
              <th className="l">Nota</th>
            </tr>
          </thead>
          <tbody>
            {!rs.length ? (
              <tr>
                <td colSpan={12} className="note">
                  Sin corridas todavía. Se registran solas al completar cada vuelta.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const pos = r.fin ? rank.indexOf(r) + 1 : "—";
                return (
                  <tr key={r.n} className={pos === 1 ? "p1" : ""}>
                    <td className="l">P{pos}</td>
                    <td className="l">#{r.n}</td>
                    <td className="l">
                      <span className="cchip" data-c={r.ctrl}>
                        {CTRL[r.ctrl].short}
                      </span>
                    </td>
                    <td>
                      {r.fin ? (
                        <>
                          {fmt(r.t!, 3)}
                          {r.t !== bestT && <span className="gp"> +{fmt(r.t! - bestT!, 3)}</span>}
                        </>
                      ) : (
                        <span className="dnf">No terminó</span>
                      )}
                    </td>
                    {[0, 1, 2].map((i) => {
                      const v = r.sec[i];
                      return v == null ? (
                        <td key={i}>—</td>
                      ) : (
                        <td key={i} className={Math.abs(v - (bs[i] ?? -1)) < 1e-9 ? "pb" : ""}>
                          {fmt(v, 3)}
                        </td>
                      );
                    })}
                    <td className="l" style={{ fontSize: 12 }}>
                      {psum(r.ctrl, r.p)}
                    </td>
                    <td>{fmt(r.vbat, 2)} V</td>
                    <td>{fmt(r.J, 2)}</td>
                    <td className="l" style={{ fontSize: 12, color: "var(--mid)" }}>
                      {r.src}
                    </td>
                    <td className="note">{r.note}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <textarea
        className="csv"
        readOnly
        aria-label="CSV de corridas"
        style={{ display: csv ? "block" : "none" }}
        value={csv ?? ""}
      />
    </Card>
  );
}

export function Runs() {
  const c = useConsole();
  return (
    <section className="view on dv" aria-label="Corridas y optimización">
      {c.runsError && (
        <div role="alert" className="card">
          <p>{c.runsError}</p>
          <button type="button" className="sb" onClick={c.refreshRuns}>
            Reintentar
          </button>
        </div>
      )}
      <Card className="s8" pbi="HU-26" sprint="2">
        <div className="hd">
          <h2>
            Corridas <small>altura = J</small>
          </h2>
          <div className="keys">
            <span className="tag">
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "var(--mid)",
                }}
              />
              PID
            </span>
            <span className="tag">
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "var(--blue)",
                }}
              />
              Adaptativo
            </span>
            <span className="tag">
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "var(--yellow)",
                }}
              />
              Difuso
            </span>
            <span className="tag">
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "var(--red)",
                }}
              />
              Error × 2
            </span>
          </div>
        </div>
        <RunChart />
      </Card>
      <EngineerPanel />
      <Estudio />
      <Tabla />
    </section>
  );
}
