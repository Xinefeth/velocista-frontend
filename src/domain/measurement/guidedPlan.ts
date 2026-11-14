// Recorrido guiado por plano: el plano (a tamaño real, en metros) se usa como referencia mientras se
// camina. Aquí van la conversión de escala, la elección del vértice de partida y el sentido, la
// alineación rígida del recorrido medido con el plano, los avisos de esquinas por marcar (sobre todo
// las interiores de una figura en L) y la comparación final. Sin DOM ni red.
import { fmtEs } from "@/domain/measurement/labels";
import { area, perimeter, type Pt } from "@/domain/measurement/plot";

/** Sentido del recorrido sobre el plano: horario o antihorario (visto como en el dibujo). */
export type Direction = "cw" | "ccw";

export const DIRECTION_LABEL: Record<Direction, string> = {
  cw: "Horario",
  ccw: "Antihorario",
};

/** Plano elegido para guiar el recorrido: tamaño real en metros, inicio y sentido. */
export interface GuidedPlan {
  name: string;
  /** Vértices del plano a tamaño real (metros), sin repetir el primero al final. */
  points: Pt[];
  /** Escala del dibujo original (1:N); solo para mostrar la conversión. */
  scaleN: number;
  startIndex: number;
  direction: Direction;
}

export const GUIDE_NO_PLAN = "Elige un plano para guiar el recorrido.";
export const GUIDE_BAD_SCALE = "La escala 1:N debe ser un número mayor que 0.";
export const GUIDE_FEW_POINTS = "El plano necesita al menos 3 vértices.";

/** Letra del vértice (A, B, C…) como en las cotas del plano. */
export const vertexLetter = (i: number): string =>
  i < 26 ? String.fromCharCode(65 + i) : `V${i + 1}`;

/** Lleva el dibujo (a escala 1:N) a tamaño real: cada longitud se multiplica por N. */
export const scalePlan = (points: readonly Pt[], n: number): Pt[] =>
  points.map((p) => ({ x: p.x * n, y: p.y * n }));

/** Quita el vértice repetido al final (si el plano cierra repitiendo el primero). */
export function openRing(points: readonly Pt[]): Pt[] {
  const out = [...points];
  const a = out[0];
  const b = out[out.length - 1];
  if (out.length > 3 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) out.pop();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Escala visible

/** «A 1:100, 10 m en el terreno = 10 cm en el plano». */
export function scaleSentence(n: number): string {
  if (n === 1) return "A 1:1 el plano está a tamaño real.";
  return `A 1:${fmtEs(n, 0)}, 10 m en el terreno = ${fmtEs(planCm(10, n), 1)} cm en el plano.`;
}

/** Centímetros del plano que equivalen a `meters` metros del terreno a la escala 1:N. */
export const planCm = (meters: number, n: number): number => (meters * 100) / n;

/** «12,3 m recorridos = 12,3 cm en el plano (1:100)». */
export const walkedSentence = (meters: number, n: number): string =>
  `${fmtEs(meters, 1)} m recorridos = ${fmtEs(planCm(meters, n), 1)} cm en el plano (1:${fmtEs(n, 0)})`;

// ---------------------------------------------------------------------------------------------
// Orden de recorrido y esquinas interiores

/** Área con signo (positiva si los vértices van en sentido antihorario con y hacia arriba). */
function signedArea(p: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/**
 * Índices (del plano tal como viene) de los vértices cóncavos: la esquina interior de una L, donde
 * el plano «entra». Con `signedArea` se sabe hacia dónde gira el contorno y se comparan los giros.
 */
export function concaveIndices(points: readonly Pt[]): number[] {
  const n = points.length;
  if (n < 4) return [];
  const sign = Math.sign(signedArea(points)) || 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n];
    const b = points[i];
    const c = points[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross * sign < -1e-9) out.push(i);
  }
  return out;
}

/** Vértices en el orden en que se recorrerán: el de partida primero y el sentido elegido. */
export function walkingRing(points: readonly Pt[], startIndex: number, dir: Direction): Pt[] {
  const n = points.length;
  // «antihorario» sigue el orden del plano si este va antihorario; si no, el contrario
  const planIsCcw = signedArea(points) >= 0;
  const forward = (dir === "ccw") === planIsCcw ? 1 : -1;
  const k = ((startIndex % n) + n) % n;
  return Array.from({ length: n }, (_, i) => points[(((k + forward * i) % n) + n) % n]);
}

/** Índices del plano en el orden de recorrido (mismo orden que `walkingRing`). */
export function walkingIndices(
  points: readonly Pt[],
  startIndex: number,
  dir: Direction,
): number[] {
  const n = points.length;
  const planIsCcw = signedArea(points) >= 0;
  const forward = (dir === "ccw") === planIsCcw ? 1 : -1;
  const k = ((startIndex % n) + n) % n;
  return Array.from({ length: n }, (_, i) => (((k + forward * i) % n) + n) % n);
}

/** Cuántas esquinas hay que marcar: todas menos la de partida (se cierra al volver). */
export const expectedMarks = (plan: Pick<GuidedPlan, "points">): number => plan.points.length - 1;

export interface GuideStep {
  /** Esquina del plano que toca marcar ahora (índice del plano), o `null` si ya están todas. */
  nextIndex: number | null;
  nextLetter: string | null;
  /** Esa esquina es interior (el plano «entra»): hay que avisar que se marque. */
  nextIsInterior: boolean;
  marked: number;
  expected: number;
}

/** Qué esquina sigue según las ya marcadas. */
export function guideStep(plan: GuidedPlan, marked: number): GuideStep {
  const order = walkingIndices(plan.points, plan.startIndex, plan.direction);
  const expected = expectedMarks(plan);
  const next = marked < expected ? order[marked + 1] : null;
  return {
    nextIndex: next,
    nextLetter: next == null ? null : vertexLetter(next),
    nextIsInterior: next != null && concaveIndices(plan.points).includes(next),
    marked,
    expected,
  };
}

export const interiorHint = (letter: string) =>
  `Aquí hay una esquina interior (${letter}): márcala, aunque el borde «entre».`;

/** Texto de lo que toca hacer ahora. */
export function guideText(step: GuideStep): string {
  if (step.nextIndex == null) return "Ya marcaste todas las esquinas: vuelve al inicio y termina.";
  const base = `Siguiente esquina: ${step.nextLetter} (${step.marked + 1} de ${step.expected}).`;
  return step.nextIsInterior ? `${base} ${interiorHint(step.nextLetter ?? "")}` : base;
}

/** Aviso al terminar si faltaron esquinas; `null` si están todas (o hay de más). */
export function missingMarksWarning(plan: GuidedPlan, marked: number): string | null {
  const expected = expectedMarks(plan);
  if (marked >= expected) return null;
  const order = walkingIndices(plan.points, plan.startIndex, plan.direction);
  const concave = concaveIndices(plan.points);
  const missing = order.slice(marked + 1, expected + 1);
  const interior = missing.filter((i) => concave.includes(i));
  const n = expected - marked;
  const what =
    interior.length > 0
      ? ` Falta una esquina interior (${interior.map(vertexLetter).join(", ")}): el contorno medido no entra ahí.`
      : "";
  return `Marcaste ${marked} de ${expected} esquinas: ${n === 1 ? "falta 1" : `faltan ${n}`}.${what}`;
}

// ---------------------------------------------------------------------------------------------
// Alineación rígida (sin deformar)

export interface Align {
  /** Punto del recorrido medido que se coloca en `target` (el inicio medido). */
  origin: Pt;
  target: Pt;
  /** Giro en radianes que se aplica al recorrido medido. */
  theta: number;
}

const angleOf = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);

/**
 * Alineación por el inicio: el inicio medido se coloca en el vértice de partida del plano y el primer
 * lado medido (del inicio hacia `towards`) se orienta hacia el siguiente vértice del plano. Es un giro
 * más un desplazamiento: no cambia ninguna distancia ni ángulo del recorrido. `towards` es la
 * primera esquina marcada o, antes de marcarla, la posición actual.
 */
export function alignByStart(measuredStart: Pt, towards: Pt, ring: readonly Pt[]): Align | null {
  if (ring.length < 2) return null;
  if (Math.hypot(towards.x - measuredStart.x, towards.y - measuredStart.y) < 1e-6) return null;
  return {
    origin: measuredStart,
    target: ring[0],
    theta: angleOf(ring[0], ring[1]) - angleOf(measuredStart, towards),
  };
}

/** Lleva un punto del recorrido medido al marco del plano. */
export function applyAlign(a: Align, p: Pt): Pt {
  const dx = p.x - a.origin.x;
  const dy = p.y - a.origin.y;
  const c = Math.cos(a.theta);
  const s = Math.sin(a.theta);
  return { x: a.target.x + dx * c - dy * s, y: a.target.y + dx * s + dy * c };
}

export const applyAlignAll = (a: Align | null, pts: readonly Pt[]): Pt[] =>
  a ? pts.map((p) => applyAlign(a, p)) : [...pts];

/**
 * Alineación de un resultado ya terminado. Con inicio y sentido guardados se alinea por el inicio
 * (primer lado del contorno medido hacia el siguiente vértice). Sin ellos, si el contorno tiene el
 * mismo número de vértices que el plano se busca el mejor ajuste rígido entre todos los inicios y
 * ambos sentidos; si no, se supone inicio en el primer vértice y sentido antihorario.
 */
export function alignResult(
  measured: readonly Pt[],
  plan: readonly Pt[],
  saved?: { startIndex: number; direction: Direction } | null,
): Align | null {
  if (measured.length < 2 || plan.length < 3) return null;
  if (saved) {
    return alignByStart(
      measured[0],
      measured[1],
      walkingRing(plan, saved.startIndex, saved.direction),
    );
  }
  if (measured.length === plan.length) {
    let best: { a: Align; err: number } | null = null;
    for (const dir of ["ccw", "cw"] as Direction[])
      for (let k = 0; k < plan.length; k++) {
        const ring = walkingRing(plan, k, dir);
        const a = fitRigid(measured, ring);
        const err = a ? meanSquare(applyAlignAll(a, measured), ring) : Infinity;
        if (a && (!best || err < best.err)) best = { a, err };
      }
    if (best) return best.a;
  }
  return alignByStart(measured[0], measured[1], walkingRing(plan, 0, "ccw"));
}

function meanSquare(a: readonly Pt[], b: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i].x - b[i].x) ** 2 + (a[i].y - b[i].y) ** 2;
  return s / a.length;
}

/** Mejor giro y desplazamiento (Kabsch en 2D, sin escala) de `src` sobre `dst` punto a punto. */
function fitRigid(src: readonly Pt[], dst: readonly Pt[]): Align | null {
  const n = src.length;
  const cs = { x: src.reduce((s, p) => s + p.x, 0) / n, y: src.reduce((s, p) => s + p.y, 0) / n };
  const cd = { x: dst.reduce((s, p) => s + p.x, 0) / n, y: dst.reduce((s, p) => s + p.y, 0) / n };
  let sin = 0;
  let cos = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i].x - cs.x;
    const ay = src[i].y - cs.y;
    const bx = dst[i].x - cd.x;
    const by = dst[i].y - cd.y;
    cos += ax * bx + ay * by;
    sin += ax * by - ay * bx;
  }
  if (Math.hypot(sin, cos) < 1e-9) return null;
  return { origin: cs, target: cd, theta: Math.atan2(sin, cos) };
}

// ---------------------------------------------------------------------------------------------
// Comparación final

export interface PlanComparison {
  planPerimeter: number;
  planArea: number;
  perimeter: number;
  area: number;
  perimeterPct: number;
  areaPct: number;
}

const pct = (measured: number, plan: number) => (plan > 0 ? ((measured - plan) / plan) * 100 : 0);

/** Perímetro y área medidos frente a los del plano, con el error en %. */
export function comparePlan(measured: readonly Pt[], plan: readonly Pt[]): PlanComparison | null {
  if (measured.length < 3 || plan.length < 3) return null;
  const planPerimeter = perimeter(plan);
  const planArea = area(plan);
  const p = perimeter(measured);
  const a = area(measured);
  return {
    planPerimeter,
    planArea,
    perimeter: p,
    area: a,
    perimeterPct: pct(p, planPerimeter),
    areaPct: pct(a, planArea),
  };
}

/** Error del perímetro y del área ya calculados (los del backend) frente a los del plano. */
export function compareTotals(
  measuredPerimeter: number,
  measuredArea: number,
  plan: readonly Pt[],
): PlanComparison | null {
  if (plan.length < 3) return null;
  const planPerimeter = perimeter(plan);
  const planArea = area(plan);
  return {
    planPerimeter,
    planArea,
    perimeter: measuredPerimeter,
    area: measuredArea,
    perimeterPct: pct(measuredPerimeter, planPerimeter),
    areaPct: pct(measuredArea, planArea),
  };
}

/** Metros a los que una esquina marcada cuenta como «la de ese vértice» (error de la medición). */
export function matchTolerance(points: readonly Pt[]): number {
  let shortest = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    shortest = Math.min(shortest, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return Math.max(2, 0.4 * shortest);
}

/**
 * Vértices del plano (menos el de partida) sin ninguna esquina marcada cerca. `marks` ya está en el
 * marco del plano. Detecta la esquina interior omitida aunque el número de hitos cuadre por otra.
 */
export function unmatchedVertices(plan: GuidedPlan, marks: readonly Pt[]): number[] {
  const tol = matchTolerance(plan.points);
  return walkingIndices(plan.points, plan.startIndex, plan.direction)
    .slice(1)
    .filter(
      (i) => !marks.some((m) => Math.hypot(m.x - plan.points[i].x, m.y - plan.points[i].y) <= tol),
    );
}

/** Aviso cuando se marcaron más esquinas que vértices tiene el plano (giros falsos o ruido). */
export function extraMarksWarning(plan: Pick<GuidedPlan, "points">, marked: number): string | null {
  const m = plan.points.length;
  return marked > m ? `Marcaste ${marked} esquinas; el plano tiene ${m}. Sobran ${marked - m}: revisa los giros.` : null;
}

/** Aviso al terminar: qué esquinas del plano no tienen hito (con la interior destacada); `null` si están todas. */
export function unmatchedWarning(plan: GuidedPlan, marks: readonly Pt[]): string | null {
  const missing = unmatchedVertices(plan, marks);
  if (!missing.length) return null;
  const concave = concaveIndices(plan.points);
  const interior = missing.filter((i) => concave.includes(i));
  const letters = missing.map(vertexLetter).join(", ");
  const base = `Falta${missing.length === 1 ? "" : "n"} ${missing.length} esquina${missing.length === 1 ? "" : "s"} del plano sin marcar (${letters}).`;
  return interior.length
    ? `${base} Falta la esquina interior (${interior.map(vertexLetter).join(", ")}): el contorno medido no entra ahí.`
    : base;
}
