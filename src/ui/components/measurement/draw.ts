// Dibujo en lienzo para las vistas de Medición: prepara el lienzo (alta densidad), cuadrícula,
// líneas y puntos en metros con la proyección de `domain/measurement/plot`.
import {
  placeLabels,
  type LabelRequest,
  type PlacedLabel,
  type PolygonDims,
} from "@/domain/measurement/dimensions";
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

/** Etiqueta pedida al dibujo: texto, punto del plano y hacia dónde va (hacia afuera del contorno). */
export interface DimLabel {
  id: string;
  text: string;
  at: Pt;
  /** Dirección unitaria hacia afuera, en metros del plano (el eje y sube). */
  outward: Pt;
  /** Color del texto; por defecto --ink. */
  color?: string;
}

const LABEL_FONT_PX = 11;
const LABEL_PAD_PX = 4;

/** Rectángulo de un texto con su fondo, en píxeles del lienzo. */
function labelSize(s: Surface, text: string) {
  s.ctx.font = `600 ${LABEL_FONT_PX}px ${s.color("--mono")}`;
  return {
    w: s.ctx.measureText(text).width + 2 * LABEL_PAD_PX,
    h: LABEL_FONT_PX + 2 * LABEL_PAD_PX,
  };
}

/** Dibuja un texto centrado en (x, y) sobre el fondo de la consola. */
function paintLabel(s: Surface, p: PlacedLabel, text: string, color: string) {
  const { ctx } = s;
  ctx.font = `600 ${LABEL_FONT_PX}px ${s.color("--mono")}`;
  ctx.textAlign = "center";
  ctx.fillStyle = s.color("--panel3");
  ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
  ctx.fillStyle = color;
  ctx.fillText(text, p.x, p.y + LABEL_FONT_PX / 2 - 1);
}

/** Resumen en la esquina superior izquierda del lienzo; devuelve el hueco que ocupa. */
export function summaryBox(s: Surface, lines: readonly string[], color?: string): PlacedLabel[] {
  const out: PlacedLabel[] = [];
  let y = 6;
  for (const text of lines) {
    const { w, h } = labelSize(s, text);
    const p: PlacedLabel = { id: text, x: 6 + w / 2, y: y + h / 2, w, h, free: true };
    paintLabel(s, p, text, color ?? s.color("--ink"));
    out.push(p);
    y += h + 2;
  }
  return out;
}

/**
 * Pone las etiquetas sin que se pisen ni se salgan del lienzo, hacia afuera del contorno.
 * `taken` son huecos ya ocupados (por ejemplo el resumen).
 */
export function drawLabels(
  s: Surface,
  view: View,
  labels: readonly DimLabel[],
  taken: readonly PlacedLabel[] = [],
) {
  const requests: LabelRequest[] = labels.map((l) => {
    const [x, y] = view.P(l.at);
    const [ox, oy] = view.P({ x: l.at.x + l.outward.x, y: l.at.y + l.outward.y });
    const d = Math.hypot(ox - x, oy - y) || 1;
    return { id: l.id, x, y, ...labelSize(s, l.text), dx: (ox - x) / d, dy: (oy - y) / d };
  });
  const placed = placeLabels(requests, s.w, s.h, 2, taken);
  placed.forEach((p, i) => paintLabel(s, p, labels[i].text, labels[i].color ?? s.color("--ink")));
}

/** Etiquetas de un contorno: largo de cada lado y, si se pide, nombre y ángulo de cada vértice. */
export function dimensionLabels(
  dims: PolygonDims,
  opts: { angles?: boolean; sideText?: (i: number) => string } = {},
): DimLabel[] {
  const labels: DimLabel[] = dims.sides.map((side) => ({
    id: `side-${side.index}`,
    text: opts.sideText ? opts.sideText(side.index) : side.label,
    at: side.mid,
    outward: side.outward,
  }));
  if (opts.angles)
    for (const v of dims.vertices)
      labels.push({
        id: `vertex-${v.index}`,
        text: `${v.name} ${v.label}`,
        at: v.point,
        outward: v.outward,
      });
  return labels;
}
