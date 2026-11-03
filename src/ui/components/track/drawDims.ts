// Cotas del plano (largo de cada tramo recto, radio de cada curva y ángulo de cada esquina), portadas
// del prototipo. Función pura sobre un contexto 2D; los colores salen de los tokens de la consola.
import { fmt } from "@/domain/track/rules";
import type { Geometry } from "@/domain/track/types";
import { worldToScreen, type Viewport } from "@/ui/components/track/viewport";

type Colors = Record<string, string>;

/** Un tramo más corto que esto (cm) no lleva cota: la etiqueta taparía la línea. */
const MIN_SEGMENT_CM = 4;
/** Ni uno que en pantalla mida menos de estos píxeles. */
const MIN_SEGMENT_PX = 46;
const MIN_RADIUS_PX = 8;

function tag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  ink: string,
  c: Colors,
) {
  const w = ctx.measureText(text).width + 8;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = c["--bg"];
  ctx.fillRect(x - w / 2, y - 8, w, 16);
  ctx.restore();
  ctx.fillStyle = ink;
  ctx.fillText(text, x, y);
}

/** Dibuja las cotas. `lineWidthCm` es el ancho de la línea (separa la etiqueta del trazo). */
export function drawDims(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  g: Geometry,
  lineWidthCm: number,
  c: Colors,
): void {
  const z = vp.z;
  const lw = lineWidthCm * z;
  ctx.save();
  ctx.font = `500 11px ${c["--mono"] || "monospace"}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of g.straights) {
    if (s.L < MIN_SEGMENT_CM || s.L * z < MIN_SEGMENT_PX) continue;
    const ux = (s.b.x - s.a.x) / s.L;
    const uy = (s.b.y - s.a.y) / s.L;
    const off = (lw / 2 + 12) / z;
    const [x, y] = worldToScreen(
      vp,
      (s.a.x + s.b.x) / 2 - uy * off,
      (s.a.y + s.b.y) / 2 + ux * off,
    );
    tag(ctx, x, y, fmt(s.L), c["--ink"], c);
  }
  for (const a of g.arcs) {
    if (a.r * z < MIN_RADIUS_PX) continue;
    const mid = a.a0 + a.sw / 2;
    const r = Math.max(0, a.r - (lw / 2 + 14) / z);
    const [x, y] = worldToScreen(vp, a.cx + Math.cos(mid) * r, a.cy + Math.sin(mid) * r);
    tag(ctx, x, y, "R" + fmt(a.r), c["--blue"], c);
  }
  for (const k of g.corners) {
    const [x, y] = worldToScreen(vp, k.x, k.y);
    tag(ctx, x + 18, y - 14, Math.round(k.a) + "°", c["--yellow"], c);
  }
  ctx.restore();
}
