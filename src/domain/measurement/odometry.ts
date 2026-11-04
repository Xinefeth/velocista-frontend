// Lógica de la vista Odometría · Medir terreno sin DOM: lugares con plano, comparación de una
// medición con su plano y recomendaciones según el resultado.
import { area, perimeter, rectangle, type Pt } from "@/domain/measurement/plot";
import { GREEN_MAX_PCT, WARNINGS } from "@/domain/measurement/labels";
import type { MeasurementApi, MethodApi } from "@/infrastructure/contracts/measurements";

export type ContourId = "aula" | "patio" | "cancha" | "escala" | "otro";

export interface PlaceForm {
  contour: ContourId;
  name: string;
  /** Largo y ancho del lugar (otro) o del dibujo en cm (escala). */
  length: string;
  width: string;
  scaleN: string;
  tapeSide: string;
}

export const CONTOURS: Record<ContourId, { label: string; plan?: Pt[]; method: MethodApi }> = {
  aula: { label: "Aula · plano 8 × 6 m", plan: rectangle(8, 6), method: "steps" },
  patio: {
    label: "Patio en L · plano 12 × 10 m",
    plan: [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 4 },
      { x: 5, y: 4 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ],
    method: "steps",
  },
  cancha: { label: "Cancha · plano 40 × 20 m", plan: rectangle(40, 20), method: "gps" },
  escala: { label: "Plano a escala (dibujo en papel)", method: "steps" },
  otro: { label: "Otro (casa, calle, terreno…)", method: "steps" },
};

const num = (v: string): number | null => {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Plano real (en metros) del lugar elegido, o el error de la entrada. En «escala» el dibujo está
 * en cm y se lleva a tamaño real con 1:N; en «otro» largo y ancho son opcionales.
 */
export function planOf(form: PlaceForm): { plan: Pt[] | null; name: string } | string {
  const preset = CONTOURS[form.contour];
  if (preset.plan) return { plan: preset.plan, name: preset.label.split(" · ")[0] };
  const L = num(form.length);
  const W = num(form.width);
  if (form.contour === "escala") {
    const N = num(form.scaleN);
    if (!N || !L || !W) return "Escribe la escala 1:N y el largo y ancho del dibujo en cm.";
    return { plan: rectangle((L * N) / 100, (W * N) / 100), name: `Plano 1:${N}` };
  }
  if (!form.name.trim()) return "Escribe el nombre del lugar.";
  if ((form.length.trim() || form.width.trim()) && (!L || !W))
    return "Largo y ancho deben ser números mayores que 0 (o déjalos vacíos).";
  return { plan: L && W ? rectangle(L, W) : null, name: form.name.trim() };
}

export function tapeSideOf(form: PlaceForm): number | null | string {
  if (!form.tapeSide.trim()) return null;
  return num(form.tapeSide) ?? "El lado medido con cinta debe ser un número mayor que 0.";
}

export interface PlanDiff {
  planPerimeter: number;
  planArea: number;
  perimeterPct: number;
  areaPct: number;
}

/**
 * Error de la medición frente a un plano. Si el backend ya comparó con el plano que mandó el
 * celular, se usa ese; si no, se compara con el plano elegido en la consola.
 */
export function compareWithPlan(
  m: MeasurementApi,
  plan: Pt[] | null,
  corrected = true,
): PlanDiff | null {
  const r = m.result;
  if (!r) return null;
  const P = corrected ? r.perimeter_m : r.raw_perimeter_m;
  const A = corrected ? r.area_m2 : r.raw_area_m2;
  const refP = r.reference_perimeter_m ?? (plan ? perimeter(plan) : null);
  const refA = r.reference_area_m2 ?? (plan ? area(plan) : null);
  if (!refP || !refA) return null;
  return {
    planPerimeter: refP,
    planArea: refA,
    perimeterPct: ((P - refP) / refP) * 100,
    areaPct: ((A - refA) / refA) * 100,
  };
}

/** Plano real del backend (referencia × escala) o el elegido en la consola. */
export function referencePoints(m: MeasurementApi | null, plan: Pt[] | null): Pt[] | null {
  const ref = m?.reference;
  if (ref) return ref.points.map((p) => ({ x: p.x * ref.scale_n, y: p.y * ref.scale_n }));
  return plan;
}

export interface Advice {
  tone: "ok" | "warn" | "bad";
  title: string;
  sub: string;
}

/** Qué hacer según el resultado (los avisos del backend primero). */
export function recommendations(m: MeasurementApi): Advice[] {
  const r = m.result;
  if (!r) return [];
  const out: Advice[] = r.warnings.map((w) => ({
    tone: "warn" as const,
    title: WARNINGS[w] ?? w,
    sub: "Aviso del cálculo.",
  }));
  if (m.method !== "gps" && !m.calibration.gyro_calibrated)
    out.push({
      tone: "warn",
      title: "Calibra el giroscopio",
      sub: "Deja el celular quieto 5 s en la pestaña Calibrar antes de medir.",
    });
  if (r.closure_error_pct >= GREEN_MAX_PCT)
    out.push({
      tone: r.quality === "red" ? "bad" : "warn",
      title: "Camina a un ritmo parejo y pegada al borde",
      sub: "Termina en tu marca del piso mirando hacia donde empezaste y repite la medición.",
    });
  if (r.corners < 3 && m.method !== "gps")
    out.push({
      tone: "warn",
      title: "Marca cada esquina",
      sub: "Gira quieta en cada esquina para que se marque sola.",
    });
  if (!out.length)
    out.push({
      tone: "ok",
      title: "Medición lista para el informe",
      sub: `Error de cierre menor a ${GREEN_MAX_PCT} %. Repite 5 veces para HU-39 y SP-07.`,
    });
  return out;
}

/** Último punto del recorrido crudo → inicio: el segmento del error de cierre. */
export function closureSegment(raw: Pt[]): Pt[] {
  return raw.length > 1 ? [raw[raw.length - 1], raw[0]] : [];
}
