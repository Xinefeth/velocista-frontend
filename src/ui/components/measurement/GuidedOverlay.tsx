// Recorrido guiado por plano: el plano de referencia con sus vértices (A, B, C…), el recorrido medido
// y los hitos numerados en el orden en que se marcaron, todo en un mismo gráfico. Lo usan el celular
// (durante el recorrido y en el resultado) y la consola (paso 4). Colores: plano --mid, recorrido
// medido --red, contorno medido --green, esquina interior --yellow; la leyenda va en texto --ink.
import { useRef } from "react";
import { useCanvas } from "@/application/hooks/useCanvas";
import { concaveIndices, vertexLetter } from "@/domain/measurement/guidedPlan";
import { boundsOf, fitView, type Pt, type View } from "@/domain/measurement/plot";
import { dots, grid, line, start, surface, tag } from "@/ui/components/measurement/draw";

export interface GuidedOverlayProps {
  /** Plano a tamaño real (metros). */
  plan: Pt[];
  /** Recorrido medido ya en el marco del plano (línea abierta). */
  path?: Pt[];
  /** Contorno medido cerrado (resultado), ya en el marco del plano. */
  contour?: Pt[];
  /** Hitos: esquinas marcadas, en el orden recorrido y donde se midieron. */
  milestones?: Pt[];
  /** Vértice de partida del plano. */
  startIndex?: number;
  /** Vértice del plano que toca marcar ahora (se resalta). */
  nextIndex?: number | null;
  /** Posición actual (punto del recorrido), si se camina. */
  here?: Pt | null;
  label?: string;
  height?: number;
  /** Si se da, tocar el gráfico elige el vértice más cercano del plano. */
  onPickVertex?: (index: number) => void;
}

/** Dibuja el gráfico sobre un lienzo (separado para probarlo sin React). */
export function drawGuided(cv: HTMLCanvasElement | null, p: GuidedOverlayProps): View | null {
  const s = surface(cv);
  if (!s) return null;
  const b = boundsOf(p.plan, p.path, p.contour, p.milestones);
  if (!b) return null;
  const view = fitView(b, s.w, s.h, 34, 4);
  grid(s, view);
  line(s, view, p.plan, { color: s.color("--mid"), width: 2, dash: [7, 5], closed: true });
  const concave = new Set(concaveIndices(p.plan));
  p.plan.forEach((q, i) => {
    const [x, y] = view.P(q);
    const interior = concave.has(i);
    s.ctx.strokeStyle = interior ? s.color("--yellow") : s.color("--mid");
    s.ctx.lineWidth = i === p.nextIndex ? 3 : 1.5;
    s.ctx.beginPath();
    s.ctx.arc(x, y, i === p.nextIndex ? 9 : 6, 0, 2 * Math.PI);
    s.ctx.stroke();
    tag(s, x + 14, y - 8, vertexLetter(i), interior ? s.color("--yellow") : s.color("--ink"));
  });
  if (p.contour && p.contour.length > 2)
    line(s, view, p.contour, { color: s.color("--green"), width: 2.6, closed: true });
  if (p.path) line(s, view, p.path, { color: s.color("--red"), width: 2.4 });
  if (p.here) dots(s, view, [p.here], s.color("--red"), 5);
  if (p.plan[p.startIndex ?? 0]) start(s, view, p.plan[p.startIndex ?? 0]);
  // hitos: círculo con su número, centrados donde se midió la esquina
  (p.milestones ?? []).forEach((m, i) => {
    const [x, y] = view.P(m);
    s.ctx.fillStyle = s.color("--ink");
    s.ctx.beginPath();
    s.ctx.arc(x, y, 9, 0, 2 * Math.PI);
    s.ctx.fill();
    s.ctx.fillStyle = s.color("--bg");
    s.ctx.font = `700 11px ${s.color("--mono")}`;
    s.ctx.textAlign = "center";
    s.ctx.fillText(String(i + 1), x, y + 4);
  });
  return view;
}

/** Vértice del plano más cercano al toque (en px del lienzo), si está a menos de `maxPx`. */
export function nearestVertex(view: View, plan: readonly Pt[], x: number, y: number, maxPx = 36) {
  let best = -1;
  let bestD = maxPx;
  plan.forEach((q, i) => {
    const [vx, vy] = view.P(q);
    const d = Math.hypot(vx - x, vy - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best < 0 ? null : best;
}

const SWATCH = {
  display: "inline-block",
  width: 18,
  height: 0,
  marginRight: 6,
  verticalAlign: "middle",
};

/** Leyenda en texto (nunca solo color): qué es cada trazo. */
export function GuidedLegend({
  milestones,
  contour,
  path,
}: {
  milestones?: boolean;
  contour?: boolean;
  path?: boolean;
}) {
  const item = (swatch: React.CSSProperties, text: string) => (
    <li style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <span style={{ ...SWATCH, ...swatch }} aria-hidden="true" />
      {text}
    </li>
  );
  return (
    <ul
      aria-label="Leyenda del gráfico"
      style={{
        listStyle: "none",
        margin: "8px 0 0",
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: "4px 14px",
        fontSize: 12.5,
        color: "var(--ink)",
      }}
    >
      {item({ borderTop: "2px dashed var(--mid)" }, "Plano (A, B, C…)")}
      {path && item({ borderTop: "3px solid var(--red)" }, "Recorrido")}
      {contour && item({ borderTop: "3px solid var(--green)" }, "Contorno medido")}
      {milestones &&
        item(
          { height: 10, width: 10, borderRadius: "50%", background: "var(--ink)" },
          "Esquina marcada (1, 2…)",
        )}
      {item(
        { height: 10, width: 10, borderRadius: "50%", border: "2px solid var(--yellow)" },
        "Esquina interior",
      )}
    </ul>
  );
}

export function GuidedOverlay(props: GuidedOverlayProps) {
  const viewRef = useRef<View | null>(null);
  const ref = useCanvas((cv) => {
    viewRef.current = drawGuided(cv, props);
  });
  return (
    <canvas
      ref={ref}
      onClick={(e) => {
        if (!props.onPickVertex || !viewRef.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const i = nearestVertex(viewRef.current, props.plan, e.clientX - r.left, e.clientY - r.top);
        if (i != null) props.onPickVertex(i);
      }}
      role="img"
      aria-label={props.label ?? "Plano de referencia con el recorrido medido encima"}
      style={{ width: "100%", height: props.height ?? 260, display: "block" }}
    />
  );
}
