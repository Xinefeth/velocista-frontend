// Panel de verificación: estado general, estadísticas y lista de incidencias (clic para ubicarlas).
// La gravedad se indica con etiqueta + glifo, no solo con color.
import { fmt } from "@/domain/track/rules";
import type { Analysis } from "@/domain/track/types";
import { SeverityTag } from "@/ui/components/track/glyphs";

const dash = (v: number, text: (n: number) => string) => (Number.isFinite(v) ? text(v) : "—");

export function IssuesPanel({
  analysis,
  verified,
  issueSel,
  onSelect,
}: {
  analysis: Analysis | null;
  /** ¿Hay reglas de pista contra las que verificar? */
  verified: boolean;
  issueSel: number;
  onSelect: (index: number) => void;
}) {
  if (!analysis) return <p className="empty">Abre una pista para verla verificada.</p>;
  const { stats, issues } = analysis;
  const errors = issues.filter((i) => i.sev === "error").length;
  const warns = issues.length - errors;
  const cells: [string, string][] = [
    ["Largo", `${fmt(stats.length / 100)} m`],
    ["Recta más larga", `${fmt(stats.straight.L || 0)} cm`],
    ["Separación mín.", dash(stats.sepMin, (v) => `${fmt(v)} cm`)],
    ["Distancia al borde", dash(stats.edgeMin, (v) => `${fmt(v)} cm`)],
    ["Radio mín.", dash(stats.radiusMin, (v) => `${fmt(v)} cm`)],
    ["Cruces", String(stats.crossings)],
    ["Esquinas / curvas", `${stats.corners} / ${stats.curves}`],
    ["Puntos / cortes", `${stats.points} / ${stats.gaps}`],
  ];
  return (
    <>
      <div className="trk-bar">
        {!verified ? (
          <span className="tag">Sin reglas de pista</span>
        ) : errors === 0 ? (
          <span className="tag good">Cumple</span>
        ) : (
          <span className="tag red">
            {errors} {errors === 1 ? "problema" : "problemas"}
          </span>
        )}
        {verified && warns > 0 && (
          <span className="tag warn">
            {warns} {warns === 1 ? "aviso" : "avisos"}
          </span>
        )}
      </div>
      <p className="trk-sr" role="status">
        {verified ? `${errors} errores y ${warns} avisos` : "Sin verificación"}
      </p>
      <div className="kv trk-stats" aria-label="Estadísticas de la pista">
        {cells.map(([label, value]) => (
          <div key={label}>
            <div className="lbl">{label}</div>
            <div className="v">{value}</div>
          </div>
        ))}
      </div>
      {verified && issues.length === 0 && (
        <p className="hint">La pista cumple todas las reglas activas del perfil.</p>
      )}
      {issues.length > 0 && (
        <ul className="trk-issues" aria-label="Incidencias">
          {issues.map((issue, i) => (
            <li key={`${issue.kind}-${i}`}>
              <button
                type="button"
                className="trk-issue"
                aria-current={i === issueSel ? "true" : undefined}
                onClick={() => onSelect(i === issueSel ? -1 : i)}
                title={
                  issue.x === null
                    ? "Esta incidencia no tiene posición en el plano"
                    : "Ubicar en el plano"
                }
              >
                <SeverityTag sev={issue.sev} />
                <span>{issue.msg}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
