// Mapa de pista (HU-30, CU-2): la pista diseñada en el Trazador (cm, con curvas) frente a la vuelta
// medida con el celular (m). Sin DOM: muestreo de la pista en metros, alineación y comparación.
import { build } from "@/domain/track/geometry";
import type { Track } from "@/domain/track/types";
import { area, perimeter, type Pt } from "@/domain/measurement/plot";
import type { MeasurementApi } from "@/infrastructure/contracts/measurements";

/** Línea de la pista diseñada en metros, con una muestra cada `everyCm` (las curvas incluidas). */
export function designPath(track: Pick<Track, "points" | "closed">, everyCm = 5): Pt[] {
  const pts = build(track).pts;
  const step = Math.max(1, Math.round(everyCm / 0.5));
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i += step) out.push({ x: pts[i].x / 100, y: pts[i].y / 100 });
  return out;
}

function centroid(pts: Pt[]): Pt {
  const n = pts.length || 1;
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
}

/** Lleva el recorrido medido al centro de la pista diseñada (solo traslada, no gira). */
export function alignTo(design: Pt[], measured: Pt[]): Pt[] {
  if (!design.length || !measured.length) return measured;
  const a = centroid(design);
  const b = centroid(measured);
  return measured.map((p) => ({ x: p.x - b.x + a.x, y: p.y - b.y + a.y }));
}

export interface CompareRow {
  label: string;
  design: number | null;
  measured: number | null;
  unit: string;
  /** Diferencia en % frente al diseño; `null` si no aplica. */
  diffPct: number | null;
}

const pct = (m: number | null, d: number | null) =>
  m == null || d == null || d === 0 ? null : ((m - d) / d) * 100;

/** Tabla «Pista diseñada frente a pista medida» del prototipo. */
export function compareTrack(track: Track, m: MeasurementApi): CompareRow[] {
  const design = designPath(track, 1);
  const r = m.result;
  const designLen = track.perimeterCm != null ? track.perimeterCm / 100 : perimeter(design);
  const designArea = track.areaCm2 != null ? track.areaCm2 / 10000 : area(design);
  const length = r ? r.perimeter_m : null;
  const measuredArea = r ? r.area_m2 : null;
  return [
    {
      label: "Largo de la vuelta",
      design: designLen,
      measured: length,
      unit: "m",
      diffPct: pct(length, designLen),
    },
    {
      label: "Área encerrada",
      design: designArea,
      measured: measuredArea,
      unit: "m²",
      diffPct: pct(measuredArea, designArea),
    },
    {
      label: "Error de cierre",
      design: 0,
      measured: r?.closure_error_m ?? null,
      unit: "m",
      diffPct: null,
    },
    {
      label: "Giro sobrante",
      design: 0,
      measured: r?.heading_drift_deg ?? null,
      unit: "°",
      diffPct: null,
    },
  ];
}

/** Mediciones que sirven como vuelta: terminadas y por odometría (pasos o carro), no GPS. */
export const laps = (items: MeasurementApi[]) =>
  items.filter((m) => m.result && m.method !== "gps").sort((a, b) => b.id - a.id);
