// Resultado del recorrido guiado: el contorno medido (con sus hitos numerados) dibujado ENCIMA del
// plano de referencia en un mismo gráfico, con leyenda, perímetro y área medidos frente a los del plano
// y el error en %. Lo usan el resultado del celular y el paso 4 de Odometría en la consola.
import { useMemo } from "react";
import { realCorners } from "@/domain/measurement/dimensions";
import {
  alignResult,
  applyAlignAll,
  compareTotals,
  unmatchedWarning,
  openRing,
  type Direction,
} from "@/domain/measurement/guidedPlan";
import { fmtEs, signedPct } from "@/domain/measurement/labels";
import type { MeasurementApi } from "@/infrastructure/contracts/measurements";
import { GuidedLegend, GuidedOverlay } from "@/ui/components/measurement/GuidedOverlay";

interface Props {
  m: MeasurementApi;
  /** Inicio y sentido de esta sesión, si el backend aún no los devuelve en `reference`. */
  saved?: { startIndex: number; direction: Direction } | null;
  height?: number;
}

const ROW = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 } as const;

export function GuidedResult({ m, saved = null, height = 280 }: Props) {
  const view = useMemo(() => {
    const ref = m.reference;
    const poly = m.result?.polygon ?? [];
    // solo un recorrido guiado: el plano trae inicio y sentido (o se guardaron en esta sesión)
    if (!ref || !m.result || poly.length < 3) return null;
    if (ref.start_index == null && !saved) return null;
    const plan = openRing(ref.points.map((p) => ({ x: p.x * ref.scale_n, y: p.y * ref.scale_n })));
    if (plan.length < 3) return null;
    const startIndex = ref.start_index ?? saved?.startIndex;
    const direction = ref.direction ?? saved?.direction;
    const a = alignResult(
      poly,
      plan,
      startIndex != null && direction ? { startIndex, direction } : null,
    );
    const contour = applyAlignAll(a, poly);
    // hitos: las esquinas del contorno medido (un recorrido GPS trae cientos de puntos)
    const corners = poly.length <= 12 ? contour : applyAlignAll(a, realCorners(poly).points);
    const marks = corners.slice(1);
    const guide = { points: plan, startIndex: startIndex ?? 0, direction: direction ?? "ccw" };
    return {
      plan,
      contour,
      marks,
      startIndex: guide.startIndex,
      cmp: compareTotals(m.result.perimeter_m, m.result.area_m2, plan),
      warning:
        m.method === "gps" ? null : unmatchedWarning({ ...guide, name: "", scaleN: 1 }, marks),
    };
  }, [m, saved]);
  if (!view) return null;
  const { cmp } = view;
  return (
    <section aria-label="Contorno medido sobre el plano">
      <div className="lbl" style={{ marginTop: 14 }}>
        Contorno medido sobre el plano
      </div>
      <GuidedOverlay
        plan={view.plan}
        contour={view.contour}
        milestones={view.marks}
        startIndex={view.startIndex}
        height={height}
        label="Contorno medido dibujado encima del plano de referencia"
      />
      <GuidedLegend milestones contour />
      {view.warning && (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: "var(--yellow)" }}>
          {view.warning}
        </p>
      )}
      {cmp && (
        <div style={{ marginTop: 10, color: "var(--ink)" }} aria-label="Medido frente al plano">
          <div style={ROW}>
            <span>Perímetro medido / plano</span>
            <b>
              {fmtEs(cmp.perimeter, 1)} m / {fmtEs(cmp.planPerimeter, 1)} m ·{" "}
              {signedPct(cmp.perimeterPct)}
            </b>
          </div>
          <div style={ROW}>
            <span>Área medida / plano</span>
            <b>
              {fmtEs(cmp.area, 1)} m² / {fmtEs(cmp.planArea, 1)} m² · {signedPct(cmp.areaPct)}
            </b>
          </div>
        </div>
      )}
    </section>
  );
}
