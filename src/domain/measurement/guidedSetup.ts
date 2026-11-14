// Recorrido guiado por plano · paso previo: de lo que el usuario elige (archivo .dxf o pista del
// Trazador, escala, vértice de inicio y sentido) sale el plano a tamaño real con el que se camina.
import { importedPlanOf, type DxfSource } from "@/domain/measurement/dxfParse";
import { realCorners } from "@/domain/measurement/dimensions";
import {
  GUIDE_BAD_SCALE,
  GUIDE_FEW_POINTS,
  openRing,
  scalePlan,
  type Direction,
  type GuidedPlan,
} from "@/domain/measurement/guidedPlan";
import {
  EMPTY_PICK,
  isTrackPlanError,
  planOfPick,
  type TrackPick,
} from "@/domain/measurement/trackPlan";
import type { Track } from "@/domain/track/types";

export type GuideSource = "none" | "dxf" | "pista";

export interface GuideSetup {
  source: GuideSource;
  dxf: DxfSource | null;
  /** Escala 1:N escrita del dibujo del archivo (1 = ya está a tamaño real). */
  dxfScale: string;
  pick: TrackPick;
  tracks: Track[];
  startIndex: number;
  direction: Direction;
}

export const EMPTY_GUIDE: GuideSetup = {
  source: "none",
  dxf: null,
  dxfScale: "1",
  pick: EMPTY_PICK,
  tracks: [],
  startIndex: 0,
  direction: "ccw",
};

export const GUIDE_DXF_MISSING = "Elige un archivo .dxf para guiar el recorrido.";
export const GUIDE_TRACK_MISSING = "Elige una pista guardada para guiar el recorrido.";

/**
 * Plano guía elegido: el plano, un texto de lo que falta o falla, o `null` si no se guía con plano.
 * Los vértices son las esquinas del dibujo (sin los puntos de las curvas) para poder nombrarlos.
 */
export function guidePlanOf(g: GuideSetup): GuidedPlan | string | null {
  if (g.source === "none") return null;
  let name: string;
  let points: { x: number; y: number }[];
  let scaleN: number;
  if (g.source === "dxf") {
    const imp = importedPlanOf(g.dxf);
    if (!imp) return GUIDE_DXF_MISSING;
    const n = Number(g.dxfScale.trim().replace(",", "."));
    if (!g.dxfScale.trim() || !(n > 0) || !Number.isFinite(n)) return GUIDE_BAD_SCALE;
    name = imp.name;
    scaleN = n;
    points = openRing(realCorners(scalePlan(imp.points, n)).points);
  } else {
    const r = planOfPick(g.tracks, g.pick);
    if (!r) return GUIDE_TRACK_MISSING;
    if (isTrackPlanError(r)) return r.error;
    name = r.name;
    scaleN = r.scaleN;
    points = openRing(r.corners);
  }
  if (points.length < 3) return GUIDE_FEW_POINTS;
  const startIndex = Math.min(Math.max(g.startIndex, 0), points.length - 1);
  return { name, points, scaleN, startIndex, direction: g.direction };
}
