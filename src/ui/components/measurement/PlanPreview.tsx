// Vista previa de un plano a tamaño real con cotas: contorno, inicio, largo de cada lado, nombre y
// ángulo de cada vértice, y perímetro y área. La usan el plano DXF y la pista del Trazador.
import { useCanvas } from "@/application/hooks/useCanvas";
import { fmtEs } from "@/domain/measurement/labels";
import {
  lengthLabel,
  MAX_ANGLE_CORNERS,
  polygonDims,
  realCorners,
} from "@/domain/measurement/dimensions";
import { boundsOf, fitView, type Pt } from "@/domain/measurement/plot";
import {
  dimensionLabels,
  drawLabels,
  dots,
  grid,
  line,
  start,
  summaryBox,
  surface,
} from "@/ui/components/measurement/draw";

interface Props {
  /** Contorno completo (puede traer arcos muestreados). */
  points: Pt[];
  /** Vértices que se rotulan; si falta, se detectan las esquinas reales del contorno. */
  corners?: Pt[];
  label?: string;
}

/** Vista previa del contorno con los colores de la consola. */
export function PlanPreview({
  points,
  corners: given,
  label = "Vista previa del contorno del plano",
}: Props) {
  const ref = useCanvas((cv) => {
    const s = surface(cv);
    const b = boundsOf(points);
    if (!s || !b) return;
    // margen amplio: las cotas y los ángulos se dibujan hacia afuera del contorno
    const view = fitView(b, s.w, s.h, 52, 2);
    grid(s, view);
    line(s, view, points, { color: s.color("--mid"), width: 2, closed: true });
    // las cotas van en las esquinas; el resumen es el del contorno completo
    const corners = given ?? realCorners(points).points;
    dots(s, view, corners, s.color("--ink"), 3);
    start(s, view, points[0]);
    const full = polygonDims(points);
    const dims = polygonDims(corners);
    if (!full || !dims) return;
    const box = summaryBox(s, [
      `Perímetro ${lengthLabel(full.perimeter)}`,
      `Área ${fmtEs(full.area, 2)} m²`,
    ]);
    drawLabels(
      s,
      view,
      dimensionLabels(dims, { angles: corners.length <= MAX_ANGLE_CORNERS }),
      box,
    );
  });
  return (
    <div className="cv" style={{ height: 280 }}>
      <canvas ref={ref} role="img" aria-label={label} />
    </div>
  );
}
