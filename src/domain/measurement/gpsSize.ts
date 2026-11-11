// CU-4 · Textos y reglas de presentación del error del GPS por tamaño: lado mínimo por entorno,
// error según la distancia, espera de precisión y precisión informada frente a la real. Todo viene
// del resumen del backend; aquí solo se arman etiquetas. Las cifras y los umbrales NO se fijan aquí:
// salen de `summary.config` (objetivo %, mínimo de pruebas, umbrales y bandas).
import { fmtEs } from "@/domain/measurement/labels";
import type {
  EnvironmentApi,
  GpsDistanceBandApi,
  GpsSummaryApi,
} from "@/infrastructure/contracts/measurements";

export const ENV_LABEL: Record<EnvironmentApi, string> = {
  open: "Aire libre",
  buildings: "Cerca de edificios",
  trees: "Bajo árboles",
  indoor: "Bajo techo",
};

/** Orden fijo en las tablas (el backend solo manda los entornos con pruebas). */
export const ENV_ORDER: EnvironmentApi[] = ["open", "buildings", "trees", "indoor"];

/** «hasta 5 m», «5 a 20 m», «más de 50 m». */
export function bandLabel(b: Pick<GpsDistanceBandApi, "from_m" | "to_m">): string {
  if (b.to_m == null) return `más de ${fmtEs(b.from_m, 0)} m`;
  if (b.from_m <= 0) return `hasta ${fmtEs(b.to_m, 0)} m`;
  return `${fmtEs(b.from_m, 0)} a ${fmtEs(b.to_m, 0)} m`;
}

/** Texto de la tendencia del error con la distancia (null si no hay datos para decirlo). */
export function trendText(trend: GpsSummaryApi["error_trend"]): string | null {
  if (trend === "flat")
    return "El error en metros no crece con la distancia: la regla del lado mínimo vale para estos datos.";
  if (trend === "grows")
    return "El error en metros crece con la distancia: la regla del lado mínimo es optimista con estos datos.";
  return null;
}

/** Entornos con pruebas, en orden fijo. */
export function environmentRows(summary: GpsSummaryApi | null) {
  const envs = summary?.environments ?? {};
  return ENV_ORDER.filter((e) => envs[e]).map((e) => ({
    id: e,
    label: ENV_LABEL[e],
    ...envs[e]!,
  }));
}

/** Texto de la columna de pruebas de un entorno: «3 de 5 · faltan 2». */
export function trialsOfEnv(trials: number, enough: boolean, missing: number, min: number): string {
  return enough ? `${trials}` : `${trials} de ${min} · faltan ${missing}`;
}

/** Umbral de precisión recomendado para esperar antes de medir (null si aún no hay datos). */
export const recommendedAccuracy = (summary: GpsSummaryApi | null): number | null =>
  summary?.recommended_accuracy_m ?? null;

/** Lectura de «precisión informada frente a la real». */
export function reportedText(r: NonNullable<GpsSummaryApi["reported_vs_real"]>): string {
  return r.optimistic
    ? "El celular es optimista: el error real supera lo que informa."
    : "La precisión que informa el celular es una buena guía del error real.";
}

/** Texto de la espera de precisión en el celular. */
export function waitText(accuracy: number | null, needed: number): string {
  return accuracy == null
    ? `Esperando señal GPS… necesito una precisión de ± ${fmtEs(needed, 0)} m o mejor.`
    : `Precisión ahora ± ${fmtEs(accuracy, 0)} m. Espero ± ${fmtEs(needed, 0)} m o mejor.`;
}
