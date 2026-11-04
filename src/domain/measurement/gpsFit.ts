// ¿Sirve el GPS en un lugar de este tamaño? (SP-06, HU-37): lo comparten la consola (error del GPS)
// y la página del celular (aviso de lugar chico), para que haya una sola regla.
import { fmtEs } from "@/domain/measurement/labels";

/** Error máximo aceptado frente a lo medido para decir que el GPS «sirve» (lo usa el backend). */
export const TARGET_PCT = 10;

/** Veredicto para un lugar cuyo lado más corto mide `side` metros. */
export function gpsFits(side: number, minSide: number | null) {
  if (minSide == null) return null;
  if (!(side > 0)) return { tone: "warn" as const, title: "Escribe el lado más corto del lugar" };
  if (side >= minSide)
    return {
      tone: "good" as const,
      title: "Sí, el GPS sirve en este lugar",
      sub: `Con un lado de ${fmtEs(side, 0)} m el error del GPS queda bajo el ${TARGET_PCT} %.`,
    };
  return {
    tone: "bad" as const,
    title: "No, el lugar es chico para el GPS",
    sub: `Hace falta un lado de al menos ${fmtEs(minSide, 0)} m. Mide por pasos.`,
  };
}

/**
 * Lado medido (perímetro / 4) y mínimo, si el terreno de una medición cerrada es chico para el GPS
 * según el error medido en SP-06; `null` si alcanza, si no hay mínimo o si el perímetro no sirve.
 */
export function smallField(
  perimeterM: number,
  minSide: number | null,
): { side: number; minSide: number } | null {
  if (!(perimeterM > 0)) return null;
  const side = perimeterM / 4;
  return gpsFits(side, minSide)?.tone === "bad" ? { side, minSide: minSide as number } : null;
}
