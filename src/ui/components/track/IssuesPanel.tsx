// Panel de verificación: estado general, estadísticas y lista de incidencias (clic para ubicarlas).
// La gravedad se indica con etiqueta + glifo, no solo con color.
import { fmt } from "@/domain/track/rules";
import type { TrackMeasures } from "@/domain/track/measures";
import type { Analysis } from "@/domain/track/types";
import { SeverityTag } from "@/ui/components/track/glyphs";

/** Dos decimales con coma (las áreas en m² necesitan más precisión que los largos). */
const fmt2 = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");

const dash = (v: number, text: (n: number) => string) => (Number.isFinite(v) ? text(v) : "—");

export function IssuesPanel({
  analysis,
  verified,
  issueSel,
  onSelect,
  measures,
  areaReason,
  onFix,
}: {
  analysis: Analysis | null;
  /** Largo, perímetro y área de la pista abierta (en cm y cm²). */
  measures?: TrackMeasures | null;
  /** Por qué no hay área (pista abierta o con cruces), o `null`. */
  areaReason?: string | null;
  /** ¿Hay reglas de pista contra las que verificar? */
  verified: boolean;
  issueSel: number;
  onSelect: (index: number) => void;
  /** Aplica la corrección de un clic de una incidencia (aviso «ajuste»). */
  onFix?: (fix: { v: number; r: number }) => void;
}) {
  if (!analysis) return <p className="empty">Abre una pista para verla verificada.</p>;
  const { stats, issues } = analysis;
  const errors = issues.filter((i) => i.sev === "error").length;
  const warns = issues.length - errors;
  const cells: [string, string, string?][] = [
    ["Largo", `${fmt(stats.length / 100)} m`],
    [
      "Perímetro",
      measures?.perimeterCm != null ? `${fmt(measures.perimeterCm / 100)} m` : "—",
      measures?.perimeterCm == null
        ? "Una pista abierta no tiene perímetro: solo un circuito cerrado lo tiene."
        : undefined,
    ],
    [
      "Área",
      measures?.areaCm2 != null ? `${fmt2(measures.areaCm2 / 10000)} m²` : "—",
      measures?.areaCm2 == null ? (areaReason ?? undefined) : undefined,
    ],
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
      <p className="trk-sr" role="status" aria-live="polite">
        {verified
          ? `${errors} ${errors === 1 ? "problema" : "problemas"} y ${warns} ${warns === 1 ? "aviso" : "avisos"}`
          : "Sin verificación"}
      </p>
      <div className="kv trk-stats" aria-label="Estadísticas de la pista">
        {cells.map(([label, value, hint]) => (
          <div key={label} title={hint}>
            <div className="lbl">{label}</div>
            <div className="v">{value}</div>
          </div>
        ))}
      </div>
      {areaReason && <p className="note">{areaReason}</p>}
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
              {issue.fix && onFix && (
                <div className="trk-fix">
                  <button
                    type="button"
                    className="sb"
                    title="Baja el radio de este punto y el de sus vecinos recortados al que realmente entra"
                    onClick={() => onFix(issue.fix!)}
                  >
                    Usar el radio que entra (R {fmt(issue.fix.r)})
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
