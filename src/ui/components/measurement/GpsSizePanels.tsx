// CU-4 · Paneles del error del GPS por tamaño, compartidos por la consola y la página del celular:
// lado mínimo por entorno, error según la distancia, espera de precisión y precisión informada
// frente a la real. Solo presentan lo que manda el resumen del backend (nada de cifras fijas).
import { fmtEs } from "@/domain/measurement/labels";
import {
  bandLabel,
  environmentRows,
  reportedText,
  trendText,
  trialsOfEnv,
} from "@/domain/measurement/gpsSize";
import type { GpsSummaryApi } from "@/infrastructure/contracts/measurements";

interface Props {
  summary: GpsSummaryApi | null;
  /** Clase del texto de nota: `note` en la consola y `hint` en el celular. */
  noteClass?: string;
}

const m1 = (v: number | null | undefined) => (v == null ? "—" : `${fmtEs(v, 1)} m`);

/** Avisos y conclusión que genera el backend (ya vienen en español). */
export function GpsConclusion({ summary, noteClass = "note" }: Props) {
  if (!summary) return null;
  const warnings = summary.warnings ?? [];
  return (
    <>
      {warnings.map((w) => (
        <p key={`${w.code}-${w.environment ?? "all"}`} className={noteClass} role="status">
          {w.message}
        </p>
      ))}
      {summary.conclusion && <p className={noteClass}>{summary.conclusion.text}</p>}
    </>
  );
}

/** Lado mínimo por entorno: pruebas, error y desde qué tamaño sirve el GPS. */
export function EnvironmentTable({ summary, noteClass = "note" }: Props) {
  const rows = environmentRows(summary);
  const min = summary?.config?.min_trials ?? 0;
  if (!rows.length) return <p className={noteClass}>Aún no hay pruebas por entorno.</p>;
  return (
    <div className="tw">
      <table className="t compact" aria-label="Lado mínimo por entorno">
        <thead>
          <tr>
            <th className="l">Entorno</th>
            <th>Pruebas</th>
            <th>Error medio</th>
            <th>Error máx.</th>
            <th>Lado mínimo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="l">{r.label}</td>
              <td>{trialsOfEnv(r.trials, r.enough_data, r.missing_trials, min)}</td>
              <td>{m1(r.mean_error_m)}</td>
              <td>{m1(r.max_error_m)}</td>
              <td>{r.min_side_m == null ? "—" : `${fmtEs(r.min_side_m, 0)} m`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Error según la distancia medida con cinta, y si crece o no. */
export function DistanceTable({ summary, noteClass = "note" }: Props) {
  const bands = summary?.by_distance ?? [];
  if (!bands.length) return null;
  const trend = trendText(summary?.error_trend);
  return (
    <>
      <div className="tw">
        <table className="t compact" aria-label="Error según la distancia">
          <thead>
            <tr>
              <th className="l">Distancia</th>
              <th>Pruebas</th>
              <th>Error medio</th>
              <th>Error máx.</th>
              <th>Error %</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.from_m}>
                <td className="l">{bandLabel(b)}</td>
                <td>{b.trials}</td>
                <td>{m1(b.mean_error_m)}</td>
                <td>{m1(b.max_error_m)}</td>
                <td>{b.mean_error_pct == null ? "—" : `${fmtEs(b.mean_error_pct, 1)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trend && <p className={noteClass}>{trend}</p>}
    </>
  );
}

/** Esperar a que el GPS tenga buena precisión (y cuánto tiempo quieto) antes de medir. */
export function WaitTables({ summary, noteClass = "note" }: Props) {
  const acc = summary?.by_accuracy ?? [];
  const wait = summary?.by_wait ?? [];
  if (!acc.length && !wait.length) return null;
  const best = summary?.recommended_accuracy_m;
  return (
    <>
      {acc.length > 0 && (
        <div className="tw">
          <table className="t compact" aria-label="Error según la precisión exigida">
            <thead>
              <tr>
                <th className="l">Precisión exigida</th>
                <th>Pruebas</th>
                <th>Error medio</th>
                <th>Error máx.</th>
                <th>Lecturas usadas</th>
              </tr>
            </thead>
            <tbody>
              {acc.map((a) => (
                <tr key={a.max_accuracy_m}>
                  <td className="l">
                    ± {fmtEs(a.max_accuracy_m, 0)} m o mejor
                    {best === a.max_accuracy_m ? " (recomendada)" : ""}
                  </td>
                  <td>{a.usable_trials}</td>
                  <td>{m1(a.mean_error_m)}</td>
                  <td>{m1(a.max_error_m)}</td>
                  <td>{a.mean_kept_pct == null ? "—" : `${fmtEs(a.mean_kept_pct, 0)} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {wait.length > 0 && (
        <div className="tw" style={{ marginTop: 10 }}>
          <table className="t compact" aria-label="Error según el tiempo quieto">
            <thead>
              <tr>
                <th className="l">Tiempo quieto</th>
                <th>Pruebas</th>
                <th>Error medio</th>
                <th>Error máx.</th>
              </tr>
            </thead>
            <tbody>
              {wait.map((w) => (
                <tr key={w.seconds}>
                  <td className="l">Primeros {fmtEs(w.seconds, 0)} s</td>
                  <td>{w.usable_trials}</td>
                  <td>{m1(w.mean_error_m)}</td>
                  <td>{m1(w.max_error_m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={noteClass}>
        {best != null
          ? `Conviene esperar a una precisión de ± ${fmtEs(best, 0)} m o mejor antes de medir.`
          : "Con más pruebas se podrá recomendar desde qué precisión medir."}
      </p>
    </>
  );
}

/** Precisión que informa el celular frente al error real de una sola lectura. */
export function ReportedVsReal({ summary, noteClass = "note" }: Props) {
  const r = summary?.reported_vs_real;
  // en el celular los pares van como filas de «.kv»; en la consola, como lista de datos
  const phone = noteClass === "hint";
  if (!r)
    return <p className={noteClass}>Aún no hay pruebas para comparar la precisión informada.</p>;
  return (
    <>
      {phone ? (
        <div className="kv" aria-label="Precisión informada frente a la real">
          <span>Pruebas</span>
          <b>{r.trials}</b>
          <span>Precisión informada</span>
          <b>± {fmtEs(r.mean_reported_accuracy_m, 1)} m</b>
          <span>Error esperado (√2 × precisión)</span>
          <b>{fmtEs(r.mean_expected_error_m, 1)} m</b>
          <span>Error real (una lectura)</span>
          <b>{fmtEs(r.mean_real_error_m, 1)} m</b>
          <span>Real ÷ esperado</span>
          <b>{r.ratio == null ? "—" : fmtEs(r.ratio, 2)}</b>
        </div>
      ) : (
        <dl className="specs" aria-label="Precisión informada frente a la real">
          <dt>Pruebas</dt>
          <dd>{r.trials}</dd>
          <dt>Precisión informada</dt>
          <dd>± {fmtEs(r.mean_reported_accuracy_m, 1)} m</dd>
          <dt>Error esperado (√2 × precisión)</dt>
          <dd>{fmtEs(r.mean_expected_error_m, 1)} m</dd>
          <dt>Error real (una lectura)</dt>
          <dd>{fmtEs(r.mean_real_error_m, 1)} m</dd>
          <dt>Real ÷ esperado</dt>
          <dd>{r.ratio == null ? "—" : fmtEs(r.ratio, 2)}</dd>
        </dl>
      )}
      <p className={noteClass} role="status">
        {reportedText(r)}
      </p>
    </>
  );
}
