// Medidas que cada pista guarda (EN-28): largo, perímetro y área. Todo en cm y cm².
// - Largo: longitud de la línea con arcos (abierta o cerrada).
// - Perímetro: largo del contorno de una pista CERRADA (nulo si es abierta).
// - Área: área encerrada por una pista CERRADA y SIN CRUCES, con la fórmula de Gauss (vale para figuras
//   cóncavas). Nula si es abierta o la línea se cruza, porque el área neta de un ocho engaña.
import { build, crossings } from "@/domain/track/geometry";
import type { Track } from "@/domain/track/types";

export interface TrackMeasures {
  lengthCm: number;
  perimeterCm: number | null;
  areaCm2: number | null;
}

/** Redondeo a 0,01 (lo que se envía a la API). */
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Área con signo de un polígono cerrado (fórmula de Gauss / lazo del zapatero). */
export function polygonArea(points: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Largo, perímetro y área de la pista. `closed` con menos de 3 puntos cuenta como abierta (igual que la geometría). */
export function measures(track: Track): TrackMeasures {
  const g = build(track);
  const lengthCm = round2(g.L);
  if (!g.closed || g.pts.length < 3) return { lengthCm, perimeterCm: null, areaCm2: null };
  const perimeterCm = lengthCm;
  if (crossings(g.pts, true).length > 0) return { lengthCm, perimeterCm, areaCm2: null };
  return { lengthCm, perimeterCm, areaCm2: round2(Math.abs(polygonArea(g.pts))) };
}

/** Por qué no hay área, para explicarlo en la interfaz; `null` si sí se calcula. */
export function areaUnavailableReason(track: Track): string | null {
  const g = build(track);
  if (!g.closed) return "La pista está abierta: solo un circuito cerrado encierra un área.";
  if (crossings(g.pts, true).length > 0)
    return "La línea se cruza: el área neta de un ocho engaña, por eso no se calcula.";
  return null;
}
