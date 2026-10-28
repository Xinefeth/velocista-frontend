// Matemática de la simulación de vuelta, portada de `simStartS`/`simPose` del prototipo.
import type { Geometry, Track } from "@/domain/track/types";

/** Longitud de arco donde está la bandera de salida. */
export function simStartS(g: Geometry, start: Track["start"]): number {
  const st = g.straights.find((q) => q.e === start.edge) || g.straights[0];
  if (!st) return 0;
  const k = Math.floor(st.i0 + (st.i1 - st.i0) * Math.max(0, Math.min(1, start.t)));
  return g.pts[k] ? g.pts[k].s : 0;
}

export interface Pose {
  x: number;
  y: number;
  /** Rumbo en radianes. */
  h: number;
}

/** Posición y rumbo del robot de prueba a `sv` cm de recorrido (cíclico si el circuito es cerrado). */
export function simPose(g: Geometry, sv: number): Pose | null {
  const P = g.pts;
  const n = P.length;
  const L = g.L;
  if (n < 2 || L <= 0) return null;
  const s = g.closed ? ((sv % L) + L) % L : Math.max(0, Math.min(L, sv));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (P[m].s <= s) lo = m;
    else hi = m;
  }
  const a = P[lo];
  const b = P[hi];
  const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  const ia = g.closed ? (lo - 3 + n) % n : Math.max(0, lo - 3);
  const ib = g.closed ? (hi + 3) % n : Math.min(n - 1, hi + 3);
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    h: Math.atan2(P[ib].y - P[ia].y, P[ib].x - P[ia].x),
  };
}
