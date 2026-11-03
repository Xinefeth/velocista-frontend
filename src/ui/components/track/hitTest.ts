// Qué hay bajo el puntero y qué puntos de control se muestran, portado de `hitTest` y `visibleNodes`
// del prototipo (trazador-de-pistas.html, líneas ~1420-1473). Son funciones puras: no tocan el DOM.
import type { Tool } from "@/application/state/trackEditorStore";
import { edgesOf } from "@/domain/track/geometry";
import type { Selection } from "@/domain/track/selection";
import { simPose, simStartS } from "@/domain/track/simulation";
import type { Geometry, Track } from "@/domain/track/types";
import { screenToWorld, worldToScreen, type Viewport } from "@/ui/components/track/viewport";

export type Hit =
  | { type: "none" }
  | { type: "start" }
  /** Punto de control. */
  | { type: "v"; i: number }
  /** Tramo recto; (wx, wy) es el punto de la línea más cercano. */
  | { type: "e"; i: number; wx: number; wy: number }
  /** Curva (arco) del vértice `i`. */
  | { type: "arc"; i: number; wx: number; wy: number }
  /** Interior de una zona. */
  | { type: "z"; i: number }
  /** Esquina de redimensionado de la zona seleccionada. */
  | { type: "zr"; i: number }
  /** Giro del grupo seleccionado. */
  | { type: "grot" }
  /** Escala del grupo seleccionado. */
  | { type: "gscale" }
  /** Interior del recuadro del grupo. */
  | { type: "gin" };

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

/** Radio de captura en píxeles. */
export const NODE_RADIUS = 10;
const EDGE_RADIUS = 9;
const HIDDEN_NODE_RADIUS = 8;
const START_RADIUS = 12;
const GIZMO_PAD = 14;

/** Puntos de control que se dibujan: todos en modo dibujo o con "nodos"; si no, los cercanos a lo activo. */
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

/** Recuadro del grupo seleccionado en pantalla (con margen), o `null` si hay menos de 2 objetos. */
export function groupBox(ctx: Pick<HitContext, "track" | "selection" | "vp">) {
  const { track, selection, vp } = ctx;
  if (selection.points.length + selection.zones.length < 2) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of selection.points) {
    const p = track.points[i];
    if (!p) continue;
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  for (const i of selection.zones) {
    const z = track.zones[i];
    if (!z) continue;
    x0 = Math.min(x0, z.x);
    x1 = Math.max(x1, z.x + z.width);
    y0 = Math.min(y0, z.y);
    y1 = Math.max(y1, z.y + z.height);
  }
  if (!Number.isFinite(x0)) return null;
  const [ax, ay] = worldToScreen(vp, x0, y1);
  const [bx, by] = worldToScreen(vp, x1, y0);
  const sx0 = ax - GIZMO_PAD;
  const sy0 = ay - GIZMO_PAD;
  const sx1 = bx + GIZMO_PAD;
  const sy1 = by + GIZMO_PAD;
  const cx = (sx0 + sx1) / 2;
  return {
    x0: sx0,
    y0: sy0,
    x1: sx1,
    y1: sy1,
    /** Asa de giro, encima del recuadro. */
    rx: cx,
    ry: sy0 - 30,
    corners: [
      [sx0, sy0],
      [sx1, sy0],
      [sx1, sy1],
      [sx0, sy1],
    ] as [number, number][],
    world: { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 },
  };
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
  const gz = tool === "select" ? groupBox(ctx) : null;
  if (gz) {
    if (Math.hypot(sx - gz.rx, sy - gz.ry) <= 11) return { type: "grot" };
    for (const [cx, cy] of gz.corners)
      if (Math.abs(sx - cx) <= 7 && Math.abs(sy - cy) <= 7) return { type: "gscale" };
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

  if (selection.zones.length === 1 && selection.points.length === 0) {
    const zn = track.zones[selection.zones[0]];
    if (zn) {
      const [hx, hy] = worldToScreen(vp, zn.x + zn.width, zn.y);
      if (Math.abs(hx - sx) <= 8 && Math.abs(hy - sy) <= 8)
        return { type: "zr", i: selection.zones[0] };
    }
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
  let hidden: { d: number; i: number } | null = null;
  track.points.forEach((p, i) => {
    const [x, y] = worldToScreen(vp, p.x, p.y);
    const d = Math.hypot(x - sx, y - sy);
    if (d <= HIDDEN_NODE_RADIUS && (!hidden || d < hidden.d)) hidden = { d, i };
  });
  if (hidden) return { type: "v", i: (hidden as { d: number; i: number }).i };

  const [wx, wy] = screenToWorld(vp, sx, sy);
  for (let i = track.zones.length - 1; i >= 0; i--) {
    const z = track.zones[i];
    if (wx >= z.x && wx <= z.x + z.width && wy >= z.y && wy <= z.y + z.height)
      return { type: "z", i };
  }
  if (gz && sx >= gz.x0 && sx <= gz.x1 && sy >= gz.y0 && sy <= gz.y1) return { type: "gin" };
  return { type: "none" };
}
