// Dibujo en lienzo para las vistas de Medición: prepara el lienzo (alta densidad), cuadrícula,
// líneas y puntos en metros con la proyección de `domain/measurement/plot`.
import { gridStep, type Pt, type View } from "@/domain/measurement/plot";

export interface Surface {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Color de una variable CSS del tema (por ejemplo `--red`). */
  color: (name: string) => string;
}

/** Ajusta el lienzo a su tamaño en pantalla; `null` si no se ve o el navegador no dibuja (jsdom). */
export function surface(cv: HTMLCanvasElement | null): Surface | null {
  if (!cv) return null;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return null;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr;
  cv.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  return { ctx, w, h, color: (name) => css.getPropertyValue(name).trim() || "#888" };
}

export function grid(s: Surface, view: View) {
  const { ctx, w, h } = s;
  const span = Math.max(w, h) / view.k;
  const step = gridStep(span);
  const a = view.M(0, h);
  const b = view.M(w, 0);
  ctx.strokeStyle = s.color("--line");
  ctx.lineWidth = 1;
  for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
    const [px] = view.P({ x, y: 0 });
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }
  for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) {
    const [, py] = view.P({ x: 0, y });
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
  }
}

export function line(
  s: Surface,
  view: View,
  pts: readonly Pt[],
  style: { color: string; width?: number; dash?: number[]; closed?: boolean },
) {
  if (pts.length < 2) return;
  const { ctx } = s;
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width ?? 2;
  ctx.lineJoin = "round";
  ctx.setLineDash(style.dash ?? []);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = view.P(p);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  if (style.closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function dots(s: Surface, view: View, pts: readonly Pt[], color: string, r = 4) {
  const { ctx } = s;
  ctx.fillStyle = color;
  for (const p of pts) {
    const [x, y] = view.P(p);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/** Texto pequeño sobre un fondo, centrado en (x, y) del lienzo. */
export function tag(s: Surface, x: number, y: number, text: string, color?: string) {
  const { ctx } = s;
  ctx.font = `600 11px ${s.color("--mono")}`;
  ctx.textAlign = "center";
  const tw = ctx.measureText(text).width + 8;
  ctx.fillStyle = s.color("--panel3");
  ctx.fillRect(x - tw / 2, y - 12, tw, 15);
  ctx.fillStyle = color ?? s.color("--ink");
  ctx.fillText(text, x, y - 1);
}

/** Marca de inicio (círculo verde con «INI»). */
export function start(s: Surface, view: View, p: Pt) {
  const { ctx } = s;
  const [x, y] = view.P(p);
  ctx.fillStyle = s.color("--green");
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = s.color("--bg");
  ctx.font = `600 8px ${s.color("--mono")}`;
  ctx.textAlign = "center";
  ctx.fillText("INI", x, y + 3);
}
