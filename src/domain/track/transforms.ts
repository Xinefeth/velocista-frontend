// Transformaciones de grupo (rotar, escalar, espejo, mover) sobre puntos y zonas,
// portadas de `rotateIdx/scaleIdx/mirrorIdx/moveIdx` del prototipo (~1694-1720). Puras.
import { r1 } from "@/domain/track/commands";
import { DEG, type Track } from "@/domain/track/types";

/** Objetivo de la transformación: índices de puntos y de zonas. */
export interface Target {
  v: number[];
  z: number[];
}

/** Objetivo con todos los puntos y zonas. */
export const allTarget = (track: Track): Target => ({
  v: track.points.map((_, i) => i),
  z: track.zones.map((_, i) => i),
});

interface Box {
  cx: number;
  cy: number;
}

function boxOf(track: Track, t: Target): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  t.v.forEach((i) => {
    const p = track.points[i];
    if (!p) return;
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  });
  t.z.forEach((i) => {
    const z = track.zones[i];
    if (!z) return;
    x0 = Math.min(x0, z.x);
    x1 = Math.max(x1, z.x + z.width);
    y0 = Math.min(y0, z.y);
    y1 = Math.max(y1, z.y + z.height);
  });
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

type Mapper = (x: number, y: number) => [number, number];

function apply(
  track: Track,
  t: Target,
  f: Mapper,
  opt: { scale?: number; rot?: number } = {},
): Track {
  const scale = opt.scale || 1;
  const rot = opt.rot || 0;
  const points = track.points.map((p) => ({ ...p }));
  t.v.forEach((i) => {
    const p = points[i];
    if (!p) return;
    const [x, y] = f(p.x, p.y);
    p.x = r1(x);
    p.y = r1(y);
    if (opt.scale) p.radius = r1(track.points[i].radius * scale);
  });
  // Un giro de ~90° intercambia el ancho y el alto de las zonas.
  const swap = Math.abs((((rot % 180) + 180) % 180) - 90) < 0.5;
  const zones = track.zones.map((z) => ({ ...z }));
  t.z.forEach((i) => {
    const src = track.zones[i];
    const zn = zones[i];
    if (!src || !zn) return;
    const w = (swap ? src.height : src.width) * scale;
    const h = (swap ? src.width : src.height) * scale;
    const [cx, cy] = f(src.x + src.width / 2, src.y + src.height / 2);
    zn.x = r1(cx - w / 2);
    zn.y = r1(cy - h / 2);
    zn.width = r1(w);
    zn.height = r1(h);
  });
  return { ...track, points, zones };
}

/** Gira `deg` grados alrededor del centro del objetivo. */
export function rotate(track: Track, t: Target, deg: number): Track {
  const b = boxOf(track, t);
  const a = deg * DEG;
  const co = Math.cos(a);
  const si = Math.sin(a);
  return apply(
    track,
    t,
    (x, y) => [b.cx + (x - b.cx) * co - (y - b.cy) * si, b.cy + (x - b.cx) * si + (y - b.cy) * co],
    { rot: deg },
  );
}

/** Escala por el factor `f` alrededor del centro del objetivo (también radios y zonas). */
export function scale(track: Track, t: Target, f: number): Track {
  const b = boxOf(track, t);
  return apply(track, t, (x, y) => [b.cx + (x - b.cx) * f, b.cy + (y - b.cy) * f], { scale: f });
}

/** Espejo horizontal (`h`, invierte x) o vertical (`v`, invierte y) respecto al centro del objetivo. */
export function mirror(track: Track, t: Target, axis: "h" | "v"): Track {
  const b = boxOf(track, t);
  return apply(track, t, (x, y) => (axis === "h" ? [2 * b.cx - x, y] : [x, 2 * b.cy - y]));
}

/** Traslada el objetivo `dx`, `dy` cm. */
export function move(track: Track, t: Target, dx: number, dy: number): Track {
  return apply(track, t, (x, y) => [x + dx, y + dy]);
}
