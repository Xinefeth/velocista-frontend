// Ayudantes de dibujo en canvas, portados del prototipo (Protoripo.html).
// Son funciones puras sobre un contexto 2D; las vistas los llaman en cada frame.
import { clamp } from "@/domain/format";
import type { Punto } from "@/domain/simulator";
import { LEN, W2M } from "@/domain/simulator";

/** Variables de color del tema, leídas de :root una sola vez. */
let C: Record<string, string> | null = null;
export function themeColors(): Record<string, string> {
  if (C) return C;
  const cs = getComputedStyle(document.documentElement);
  const keys = [
    "--ink",
    "--mid",
    "--dim",
    "--red",
    "--red-hi",
    "--line",
    "--line2",
    "--panel",
    "--panel3",
    "--bg",
    "--purple",
    "--green",
    "--yellow",
    "--blue",
    "--mono",
    "--sans",
  ];
  C = {};
  keys.forEach((k) => (C![k] = cs.getPropertyValue(k).trim()));
  return C;
}

export const NB = 120;

interface Canvas2D {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** Ajusta el canvas al DPR y devuelve su contexto, o null si no tiene tamaño. */
export function fit(cv: HTMLCanvasElement): Canvas2D | null {
  const r = cv.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  if (!r.width || !r.height) return null;
  const w = Math.round(r.width * dpr),
    h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const bounds = (pts: { x: number; y: number }[]): Box => {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  pts.forEach((p) => {
    a = Math.min(a, p.x);
    b = Math.min(b, p.y);
    c = Math.max(c, p.x);
    d = Math.max(d, p.y);
  });
  return { x0: a, y0: b, x1: c, y1: d };
};

export type Projection = (x: number, y: number) => [number, number];

export const proj = (w: number, h: number, b: Box, pad = 34): Projection => {
  const k = Math.min(
    (w - pad * 2) / Math.max(0.1, b.x1 - b.x0),
    (h - pad * 2) / Math.max(0.1, b.y1 - b.y0),
  );
  const ox = (w - (b.x1 - b.x0) * k) / 2,
    oy = (h - (b.y1 - b.y0) * k) / 2;
  return (x, y) => [ox + (x - b.x0) * k, oy + (y - b.y0) * k];
};

export const ptOn = (path: Punto[], f: number): Punto =>
  path[Math.min(path.length - 1, Math.max(0, Math.floor(f * path.length)))];

/** Posición del robot sobre el trazado, desplazada por el error lateral. */
export function robotOn(path: Punto[], simS: number, simE: number): { x: number; y: number } {
  const p = ptOn(path, (simS % LEN) / LEN),
    off = -simE * W2M * 2.5;
  return { x: p.x - Math.sin(p.h) * off, y: p.y + Math.cos(p.h) * off };
}

export function poly(
  ctx: CanvasRenderingContext2D,
  Pj: Projection,
  pts: Punto[],
  a: number,
  b: number,
  close = false,
): void {
  ctx.beginPath();
  for (let i = a; i < b; i++) {
    const [x, y] = Pj(pts[i].x, pts[i].y);
    if (i === a) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
  ctx.stroke();
}

/** Color del error: de gris (estable) a rojo (inestable). */
export const errCol = (v: number): string => {
  const t = clamp(v / 0.6, 0, 1),
    a = [42, 46, 58],
    b = [255, 45, 85];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(",")})`;
};

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function robotDot(ctx: CanvasRenderingContext2D, x: number, y: number, short: string): void {
  const col = themeColors();
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col["--ink"];
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = col["--red"];
  ctx.lineWidth = 2;
  ctx.stroke();
  const tx = x + 14,
    ty = y - 24;
  ctx.fillStyle = col["--ink"];
  roundRect(ctx, tx, ty, 40, 18, 5);
  ctx.fill();
  ctx.fillStyle = col["--bg"];
  ctx.font = `600 10px ${col["--mono"]}`;
  ctx.fillText(short, tx + 10, ty + 12.5);
}

/** Datos que las vistas pasan a los dibujos del mapa y señales. */
export interface MapData {
  recording: boolean;
  raw: Punto[] | null;
  corr: Punto[] | null;
  path: Punto[] | null;
  mapMode: "error" | "sectores";
  lastBins: number[] | null;
  lastColsSector: string[] | null;
  trail: { x: number; y: number; err: number }[];
  running: boolean;
  simS: number;
  simE: number;
  short: string;
}

let B: Box | null = null;
/** Invalida el encuadre cacheado del mapa (al cambiar de trazado). */
export const resetFraming = (): void => {
  B = null;
};

export function drawMap(cv: HTMLCanvasElement, m: MapData): void {
  const f = fit(cv);
  if (!f) return;
  const { ctx, w, h } = f,
    col = themeColors();
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (m.recording && m.raw && m.raw.length > 1) {
    const b = bounds(
        m.raw.concat([
          { x: -0.7, y: -0.35 },
          { x: 0.7, y: 0.35 },
        ] as Punto[]),
      ),
      Pj = proj(w, h, b);
    ctx.strokeStyle = "rgba(255,255,255,.1)";
    ctx.lineWidth = 12;
    poly(ctx, Pj, m.raw, 0, m.raw.length);
    ctx.save();
    ctx.shadowColor = "rgba(255,45,85,.9)";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = col["--red-hi"];
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 5]);
    poly(ctx, Pj, m.raw, 0, m.raw.length);
    ctx.setLineDash([]);
    ctx.restore();
    const e = m.raw[m.raw.length - 1];
    const [x, y] = Pj(e.x, e.y);
    robotDot(ctx, x, y, m.short);
    return;
  }
  const path = m.path;
  if (!path) return;
  if (!B) B = bounds(path);
  const Pj = proj(w, h, B),
    n = path.length;
  ctx.strokeStyle = "rgba(255,255,255,.09)";
  ctx.lineWidth = 18;
  poly(ctx, Pj, path, 0, n, true);
  ctx.save();
  ctx.shadowColor = "rgba(255,45,85,.9)";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = col["--red-hi"];
  ctx.lineWidth = 3.4;
  poly(ctx, Pj, path, 0, n, true);
  ctx.restore();
  if (m.mapMode === "sectores" && m.lastColsSector && m.lastColsSector.length === 3) {
    const bb = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n],
      cm: Record<string, string> = {
        purple: col["--purple"],
        green: col["--green"],
        yellow: col["--yellow"],
      };
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = cm[m.lastColsSector[i]];
      ctx.lineWidth = 5;
      poly(ctx, Pj, path, bb[i], Math.min(n, bb[i + 1] + 1));
    }
  }
  if (m.mapMode === "error" && m.lastBins) {
    for (let i = 0; i < NB; i++) {
      const v = m.lastBins[i];
      if (v < 0.25) continue;
      const a = Math.floor((i / NB) * n),
        b = Math.min(n, Math.floor(((i + 1) / NB) * n) + 1);
      ctx.strokeStyle = errCol(v);
      ctx.globalAlpha = clamp(v / 0.6, 0.3, 1);
      ctx.lineWidth = 7;
      poly(ctx, Pj, path, a, b);
    }
    ctx.globalAlpha = 1;
  }
  [0, 1 / 3, 2 / 3].forEach((fr, i) => {
    const p = ptOn(path, fr);
    const [x, y] = Pj(p.x, p.y);
    const nx = -Math.sin(p.h),
      ny = Math.cos(p.h);
    if (i === 0) {
      ctx.strokeStyle = col["--ink"];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - nx * 11, y - ny * 11);
      ctx.lineTo(x + nx * 11, y + ny * 11);
      ctx.stroke();
    }
    const lx = x + nx * 26,
      ly = y + ny * 26;
    ctx.fillStyle = col["--bg"];
    ctx.strokeStyle = i === 0 ? col["--ink"] : col["--red"];
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(lx, ly, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = i === 0 ? col["--ink"] : col["--red-hi"];
    ctx.font = `500 9.5px ${col["--mono"]}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(i === 0 ? "M" : `S${i + 1}`, lx, ly + 0.5);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  });
  for (let i = 1; i < m.trail.length; i++) {
    const a = m.trail[i - 1],
      c = m.trail[i];
    const [x1, y1] = Pj(a.x, a.y),
      [x2, y2] = Pj(c.x, c.y);
    ctx.strokeStyle = c.err > 0.45 ? col["--yellow"] : "rgba(255,255,255,.75)";
    ctx.globalAlpha = 0.25 + (0.75 * i) / m.trail.length;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (m.running) {
    const r = robotOn(path, m.simS, m.simE);
    const [x, y] = Pj(r.x, r.y);
    robotDot(ctx, x, y, m.short);
  }
}

export const HIST = 6,
  RATE = 50;

export interface SignalsHistory {
  err: number[];
  pl: number[];
  pr: number[];
}

export function drawChart(
  cv: HTMLCanvasElement,
  hist: SignalsHistory,
  show: { err: boolean; pl: boolean; pr: boolean },
): void {
  const f = fit(cv);
  if (!f) return;
  const { ctx, w, h } = f,
    col = themeColors();
  ctx.clearRect(0, 0, w, h);
  const L = 30,
    Rr = 4,
    T = 4,
    Bt = 14,
    W = w - L - Rr,
    H = h - T - Bt;
  ctx.font = `10px ${col["--mono"]}`;
  [-100, 0, 100].forEach((v) => {
    const y = T + H / 2 - (v / 100) * (H / 2);
    ctx.strokeStyle = v === 0 ? col["--line2"] : col["--line"];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, y);
    ctx.lineTo(L + W, y);
    ctx.stroke();
    ctx.fillStyle = col["--dim"];
    ctx.fillText(String(v), 2, y + 3);
  });
  const n = HIST * RATE;
  (
    [
      ["pr", col["--dim"], 1, 1.2],
      ["pl", col["--ink"], 1, 1.2],
      ["err", col["--red"], 100, 2],
    ] as [keyof SignalsHistory, string, number, number][]
  ).forEach(([k, c, sc, lw]) => {
    if (!show[k]) return;
    const a = hist[k];
    if (a.length < 2) return;
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    a.forEach((v, i) => {
      const x = L + (W * (i + n - a.length)) / (n - 1),
        y = T + H / 2 - (clamp(v * sc, -110, 110) / 100) * (H / 2);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
}

export function drawHealth(
  cv: HTMLCanvasElement,
  running: boolean,
  simS: number,
  curBins: Float32Array,
  curCnt: Float32Array,
  lastBins: number[] | null,
): void {
  const f = fit(cv);
  if (!f) return;
  const { ctx, w, h } = f,
    col = themeColors();
  ctx.clearRect(0, 0, w, h);
  const gap = 2,
    bw = (w - gap * (NB - 1)) / NB,
    cur = running ? (simS % LEN) / LEN : -1;
  for (let i = 0; i < NB; i++) {
    const done = running && i / NB < cur;
    const v = done && curCnt[i] ? curBins[i] / curCnt[i] : lastBins ? lastBins[i] : 0;
    ctx.fillStyle = lastBins || done ? errCol(v) : col["--panel3"];
    ctx.globalAlpha = done ? 1 : lastBins ? 0.45 : 1;
    roundRect(ctx, i * (bw + gap), 0, bw, h, 1.5);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (cur >= 0) {
    const x = cur * w;
    ctx.fillStyle = col["--ink"];
    ctx.fillRect(x - 1, 0, 2, h);
  }
}

export function drawRec(
  cv: HTMLCanvasElement,
  raw: Punto[] | null,
  corr: Punto[] | null,
  recording: boolean,
): void {
  const f = fit(cv);
  if (!f) return;
  const { ctx, w, h } = f,
    col = themeColors();
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (!raw && !corr) {
    ctx.fillStyle = col["--dim"];
    ctx.font = `12px ${col["--sans"]}`;
    ctx.textAlign = "center";
    ctx.fillText("Aún no hay una vuelta de mapeo.", w / 2, h / 2);
    ctx.textAlign = "start";
    return;
  }
  const Pj = proj(w, h, bounds((raw || []).concat(corr || [])), 22);
  if (raw) {
    ctx.strokeStyle = col["--dim"];
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
    poly(ctx, Pj, raw, 0, raw.length);
    ctx.setLineDash([]);
    const s = raw[0],
      e = raw[raw.length - 1];
    const [a, b] = Pj(s.x, s.y),
      [c, d] = Pj(e.x, e.y);
    ctx.strokeStyle = col["--yellow"];
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  }
  if (corr && !recording) {
    ctx.save();
    ctx.shadowColor = "rgba(255,45,85,.7)";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = col["--red"];
    ctx.lineWidth = 2.4;
    poly(ctx, Pj, corr, 0, corr.length, true);
    ctx.restore();
  }
  ctx.fillStyle = col["--dim"];
  ctx.font = `10px ${col["--mono"]}`;
  ctx.fillText("PUNTEADO: ESTIMADO   ROJO: CORREGIDO   AMARILLO: ERROR DE CIERRE", 12, h - 10);
}
