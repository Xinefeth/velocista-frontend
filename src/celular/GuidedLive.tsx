// Plano guía durante el recorrido: el plano de fondo con sus vértices, tu camino ya alineado con él,
// cada esquina marcada como hito numerado (donde se midió, no pegada al vértice del plano), la
// conversión de escala en vivo y qué esquina toca (avisando de las interiores).
import {
  alignByStart,
  applyAlignAll,
  guideStep,
  guideText,
  scaleSentence,
  walkedSentence,
  walkingIndices,
  walkingRing,
  type GuidedPlan,
} from "@/domain/measurement/guidedPlan";
import type { Pt } from "@/domain/measurement/plot";
import { GuidedLegend, GuidedOverlay } from "@/ui/components/measurement/GuidedOverlay";

/** Metros que hay que alejarse del inicio antes de fijar hacia dónde apunta el primer lado. */
const MIN_FIRST_SIDE_M = 1;

interface Props {
  plan: GuidedPlan;
  /** Recorrido medido (marco propio del celular, el inicio es el primer punto). */
  path: Pt[];
  /** Esquinas marcadas en ese mismo marco. */
  marks: Pt[];
  /** Metros recorridos en total. */
  walked: number;
}

export function GuidedLive({ plan, path, marks, walked }: Props) {
  const ring = walkingRing(plan.points, plan.startIndex, plan.direction);
  const here = path[path.length - 1];
  // el primer lado se orienta hacia la primera esquina marcada o, antes, hacia donde se camina
  const towards =
    marks[0] ??
    (Math.hypot(here.x - path[0].x, here.y - path[0].y) >= MIN_FIRST_SIDE_M ? here : null);
  const align = towards ? alignByStart(path[0], towards, ring) : null;
  const step = guideStep(plan, marks.length);
  const order = walkingIndices(plan.points, plan.startIndex, plan.direction);
  return (
    <div className="guide-live">
      <GuidedOverlay
        plan={plan.points}
        path={align ? applyAlignAll(align, path) : undefined}
        milestones={align ? applyAlignAll(align, marks) : undefined}
        here={align ? applyAlignAll(align, [here])[0] : null}
        startIndex={plan.startIndex}
        nextIndex={step.nextIndex ?? order[0]}
        height={250}
        label="Plano de referencia con tu recorrido y las esquinas marcadas"
      />
      <GuidedLegend path milestones />
      <p>{scaleSentence(plan.scaleN)}</p>
      <p aria-live="polite">{walkedSentence(walked, plan.scaleN)}</p>
      <p className={step.nextIsInterior ? "warn" : undefined} role="status">
        {align ? guideText(step) : "Empieza a caminar hacia la siguiente esquina del plano."}
      </p>
    </div>
  );
}
