// Qué hay bajo el puntero y qué puntos de control se muestran, portado de `hitTest` y `visibleNodes`
// del prototipo (trazador-de-pistas.html, líneas ~1420-1473). Son funciones puras: no tocan el DOM.
import type { Tool } from "@/application/state/trackEditorStore";
import { edgesOf } from "@/domain/track/geometry";
import type { Selection } from "@/domain/track/selection";
import { simPose, simStartS } from "@/domain/track/simulation";
import type { Geometry, Track } from "@/domain/track/types";
import { worldToScreen, type Viewport } from "@/ui/components/track/viewport";

export type Hit =
  | { type: "none" }
  /** Bandera de salida. */
  | { type: "start" }
  /** Punto de control. */
  | { type: "v"; i: number }
  /** Tramo recto `i`; (wx, wy) es el punto de la línea más cercano. */
  | { type: "e"; i: number; wx: number; wy: number }
  /** Curva (arco) del vértice `i`. */
  | { type: "arc"; i: number; wx: number; wy: number };

export interface HitContext {
  track: Track;
  geometry: Geometry;
  vp: Viewport;
  selection: Selection;
  tool: Tool;
  showNodes: boolean;
  /** Elemento bajo el puntero en el movimiento anterior (para mostrar sus vecinos). */
  hover: Hit | null;
  /** Vértice de la incidencia elegida, si tiene. */
  issueVertex: number | null;
}

/** Radios de captura en píxeles. */
export const NODE_RADIUS = 10;
const EDGE_RADIUS = 9;
const HIDDEN_NODE_RADIUS = 8;
const START_RADIUS = 12;

/** Puntos de control que se dibujan: todos en modo dibujo o con "puntos"; si no, los cercanos a lo activo. */
export function visibleNodes(
  ctx: Pick<HitContext, "track" | "selection" | "tool" | "showNodes" | "hover" | "issueVertex">,
): Set<number> {
  const { track, selection, tool, showNodes, hover, issueVertex } = ctx;
  const n = track.points.length;
  const show = new Set<number>();
  if (showNodes || tool === "draw") {
    track.points.forEach((_, i) => show.add(i));
    return show;
  }
  const add = (i: number) => {
    if (i >= 0 && i < n) show.add(i);
  };
  const withNeighbors = (i: number) => {
    add(i);
    if (track.closed || i > 0) add((i - 1 + n) % n);
    if (track.closed || i < n - 1) add((i + 1) % n);
  };
  selection.points.forEach((i) => (selection.points.length <= 6 ? withNeighbors(i) : add(i)));
  if (hover && (hover.type === "v" || hover.type === "arc")) withNeighbors(hover.i);
  if (hover && hover.type === "e") {
    const edge = edgesOf(track)[hover.i];
    if (edge) {
      add(edge[0]);
      add(edge[1]);
    }
  }
  if (issueVertex !== null) withNeighbors(issueVertex);
  return show;
}

/** Posición en pantalla de la bandera de salida, o `null` si no hay línea. */
export function startScreen(g: Geometry, track: Track, vp: Viewport): [number, number] | null {
  const pose = simPose(g, simStartS(g, track.start));
  return pose ? worldToScreen(vp, pose.x, pose.y) : null;
}

/** Qué hay en (sx, sy) de la pantalla. `forClick` permite elegir el segundo de dos nodos casi iguales. */
export function hitTest(sx: number, sy: number, ctx: HitContext, forClick = false): Hit {
  const { track, geometry: g, vp, selection, tool } = ctx;
  if (tool === "select") {
    const st = startScreen(g, track, vp);
    if (st && Math.hypot(sx - st[0], sy - st[1]) <= START_RADIUS) return { type: "start" };
  }

  const visible = visibleNodes(ctx);
  const cands: { d: number; i: number }[] = [];
  track.points.forEach((p, i) => {
    if (!visible.has(i)) return;
    const [x, y] = worldToScreen(vp, p.x, p.y);
    const d = Math.hypot(x - sx, y - sy);
    if (d <= NODE_RADIUS) cands.push({ d, i });
  });
  cands.sort((a, b) => a.d - b.d);
  if (cands.length) {
    let pick = cands[0];
    // Dos nodos casi en el mismo lugar: un clic sobre el ya elegido toma el otro.
    if (
      forClick &&
      cands.length > 1 &&
      cands[1].d - cands[0].d < 5 &&
      selection.points.length === 1 &&
      selection.points[0] === cands[0].i
    )
      pick = cands[1];
    return { type: "v", i: pick.i };
  }

  let best: { d: number; q: Geometry["pts"][number] } | null = null;
  for (const q of g.pts) {
    const [x, y] = worldToScreen(vp, q.x, q.y);
    const d = Math.hypot(x - sx, y - sy);
    if (d <= EDGE_RADIUS && (!best || d < best.d)) best = { d, q };
  }
  if (best) {
    const kind = best.q.src[0];
    const i = +best.q.src.slice(1);
    return kind === "e"
      ? { type: "e", i, wx: best.q.x, wy: best.q.y }
      : { type: "arc", i, wx: best.q.x, wy: best.q.y };
  }

  // Nodos ocultos: solo si no hay nada visible ni línea debajo.
  let hiddenIndex = -1;
  let hiddenDist = HIDDEN_NODE_RADIUS + 1;
  track.points.forEach((p, i) => {
    const [x, y] = worldToScreen(vp, p.x, p.y);
    const d = Math.hypot(x - sx, y - sy);
    if (d <= HIDDEN_NODE_RADIUS && d < hiddenDist) {
      hiddenDist = d;
      hiddenIndex = i;
    }
  });
  if (hiddenIndex >= 0) return { type: "v", i: hiddenIndex };
  return { type: "none" };
}
