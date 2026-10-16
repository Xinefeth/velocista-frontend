// Simulator físico del velocista, portado del prototipo (Protoripo.html).
// Es independiente del framework: la consola lo ejecuta en su bucle (modo Simulado, EN-05).
import type { Setup } from "@/domain/models/domain";
import { clamp } from "@/domain/format";

/** Tramo de la pista de pruebas: recta (len) o curva (ang, r). */
interface TrackPieceDef {
  len: number;
  ang?: number;
  r?: number;
  c: number;
  s0: number;
}

const DEF: { len?: number; ang?: number; r?: number }[] = [
  { len: 1.0 },
  { ang: -45, r: 0.35 },
  { ang: 45, r: 0.35 },
  { len: 0.5 },
  { ang: 90, r: 0.3 },
  { len: 0.6 },
  { ang: 90, r: 0.25 },
  { len: 0.9 },
  { ang: -45, r: 0.35 },
  { ang: 45, r: 0.35 },
  { len: 0.6 },
  { ang: 90, r: 0.3 },
  { len: 0.6 },
  { ang: 90, r: 0.25 },
];

export const TRACK: TrackPieceDef[] = [];
let acc = 0;
for (const g of DEF) {
  let len = g.len ?? 0;
  let c = 0;
  if (g.ang) {
    len = ((Math.abs(g.ang) * Math.PI) / 180) * (g.r ?? 1);
    c = Math.sign(g.ang) / (g.r ?? 1);
  }
  TRACK.push({ len, ang: g.ang, r: g.r, c, s0: acc });
  acc += len;
}
export const LEN = acc;
export const SECT = [LEN / 3, (2 * LEN) / 3];

export interface Punto {
  x: number;
  y: number;
  h: number;
}

/** Trazado de la pista de pruebas, para "Usar pista de pruebas". */
export const EXAMPLE: Punto[] = [];
{
  let x = 0,
    y = 0,
    h = 0;
  for (const g of TRACK) {
    const n = Math.ceil(g.len / 0.01);
    for (let i = 0; i < n; i++) {
      EXAMPLE.push({ x, y, h });
      h += (g.c * g.len) / n;
      x += (Math.cos(h) * g.len) / n;
      y += (Math.sin(h) * g.len) / n;
    }
  }
}

export const DT = 0.002;
const DELAY = 12,
  W2M = 0.035,
  LOOK = 0.07,
  VMAX = 2.4,
  AXLE = 0.13,
  TAU = 0.09;
export { W2M, VMAX, AXLE };

/** Un tramo clasificado de una vuelta (recta, curva izq/der, línea perdida). */
export interface Segment {
  k: string;
  dur: number;
  deg: number;
  ie: number;
}

/** Evento que un paso de simulación puede devolver. */
export type SimEvent = "lap" | "crash" | "timeout" | "lost" | null;

/** Contexto que el robot comparte con el simulador (batería y compensación). */
export interface SimContext {
  comp: boolean;
  vbat: number;
}

export class Simulator {
  s = 0;
  e = 0;
  th = 0;
  wl = 0;
  wr = 0;
  I = 0;
  prev = 0;
  last = 1;
  es = 0;
  p = 0;
  pl = 0;
  pr = 0;
  lapT = 0;
  iae = 0;
  lost = 0;
  wasLost = false;
  bL: number[] = [];
  bR: number[] = [];
  segs: Segment[] = [];
  cur: Segment | null = null;
  yf = 0;
  sec = 0;
  secT: number[] = [];
  secStart = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    Object.assign(this, {
      s: 0,
      e: (Math.random() - 0.5) * 0.2,
      th: 0,
      wl: 0,
      wr: 0,
      I: 0,
      prev: 0,
      last: 1,
      es: 0,
      p: 0,
      pl: 0,
      pr: 0,
      lapT: 0,
      iae: 0,
      lost: 0,
      wasLost: false,
      bL: Array(DELAY).fill(0),
      bR: Array(DELAY).fill(0),
      segs: [],
      cur: null,
      yf: 0,
      sec: 0,
      secT: [],
      secStart: 0,
    });
  }

  step(A: Setup, ctx: SimContext): SimEvent {
    const sm = this.s % LEN,
      g = TRACK.find((t) => sm >= t.s0 && sm < t.s0 + t.len) || TRACK[0],
      c = g.c;
    this.es = this.e - (LOOK * Math.sin(this.th)) / W2M + (c * LOOK * LOOK) / 2 / W2M;
    const lost = Math.abs(this.es) > 1.1;
    if (lost) this.p = this.last * 1.2;
    else {
      this.p = this.es + (Math.random() - 0.5) * 0.05;
      this.last = Math.sign(this.es) || 1;
    }
    let ev: SimEvent = null;
    if (lost && !this.wasLost) {
      this.lost++;
      ev = "lost";
    }
    this.wasLost = lost;
    const d = ((this.p - this.prev) / DT) * 0.01;
    this.prev = this.p;
    this.I = clamp(this.I + this.p * DT, -2, 2);
    const q = A.parameters;
    let U: number,
      base = q.base;
    if (A.controller === "fuzzy") {
      const ap = Math.min(1.2, Math.abs(this.p));
      U = (q.g * (0.55 * this.p + 0.45 * this.p * ap) + q.d * d) * 100;
      base = q.base * (1 - 0.25 * Math.min(1, ap));
    } else {
      U = (q.kp * this.p + q.ki * this.I + q.kd * d) * 100;
      if (A.controller === "adapt")
        base = Math.max(q.vmin, q.base * (1 - q.kv * Math.min(1, Math.abs(this.p))));
    }
    this.pl = clamp(base + U, -q.max, q.max);
    this.pr = clamp(base - U, -q.max, q.max);
    this.bL.push(this.pl);
    this.bR.push(this.pr);
    const f = ctx.comp ? 8.0 / 7.8 : ctx.vbat / 7.8;
    this.wl += ((this.bL.shift()! * f - this.wl) * DT) / TAU;
    this.wr += ((this.bR.shift()! * f - this.wr) * DT) / TAU;
    const vl = (this.wl / 100) * VMAX,
      vr = (this.wr / 100) * VMAX,
      v = (vl + vr) / 2,
      yaw = (vl - vr) / AXLE;
    this.th += (yaw - v * c) * DT;
    this.e += ((-v * Math.sin(this.th)) / W2M) * DT;
    this.s += Math.max(0, v * Math.cos(this.th)) * DT;
    this.lapT += DT;
    this.iae += Math.abs(this.es) * DT;
    this.segment(yaw, lost);
    if (this.sec < 2 && this.s >= SECT[this.sec]) {
      this.secT.push(this.lapT - this.secStart);
      this.secStart = this.lapT;
      this.sec++;
    }
    if (Math.abs(this.e) > 4) return "crash";
    if (this.lapT >= 120) return "timeout";
    if (this.s >= LEN) {
      this.secT.push(this.lapT - this.secStart);
      this.s -= LEN;
      return "lap";
    }
    return ev;
  }

  private segment(yaw: number, lost: boolean): void {
    this.yf += ((yaw - this.yf) * DT) / 0.25;
    const cur = this.cur;
    let k: string;
    if (lost) k = "X";
    else {
      const thr = cur && (cur.k === "L" || cur.k === "R") ? 1.0 : 1.6;
      k = Math.abs(this.yf) > thr ? (this.yf > 0 ? "R" : "L") : "S";
    }
    if (!cur || cur.k !== k) {
      if (cur && cur.dur < 0.15 && this.segs.length) {
        const pv = this.segs[this.segs.length - 1];
        pv.dur += cur.dur;
        pv.deg += cur.deg;
        pv.ie += cur.ie;
      } else if (cur) this.segs.push(cur);
      this.cur = { k, dur: 0, deg: 0, ie: 0 };
    }
    const act = this.cur!;
    act.dur += DT;
    act.deg += (yaw * DT * 180) / Math.PI;
    act.ie += Math.abs(this.es) * DT;
  }

  closeLap(): Segment[] {
    if (this.cur) {
      this.segs.push(this.cur);
      this.cur = null;
    }
    const out: Segment[] = [];
    this.segs.forEach((s0) => {
      let s = s0;
      if ((s.k === "L" || s.k === "R") && Math.abs(s.deg) < 15) s = { ...s, k: "S" };
      const m = out[out.length - 1];
      if (m && m.k === s.k) {
        m.dur += s.dur;
        m.deg += s.deg;
        m.ie += s.ie;
      } else out.push({ ...s });
    });
    this.segs = [];
    return out;
  }
}

/** Estadísticas del mapa construido desde la vuelta 1 (HU-30). */
export interface MapStats {
  len: number;
  closeErr: number;
  errH: number;
}

/** Corrige la deriva de la vuelta estimada y devuelve el trazado cerrado y sus stats. */
export function buildMap(raw: Punto[]): { corr: Punto[]; stats: MapStats } | null {
  if (!raw || raw.length < 20) return null;
  const n = raw.length - 1,
    dh = raw[n].h - raw[0].h,
    turns = Math.round(dh / (2 * Math.PI)) || 1,
    errH = dh - turns * 2 * Math.PI,
    closeErr = Math.hypot(raw[n].x - raw[0].x, raw[n].y - raw[0].y);
  const pts: Punto[] = [{ x: 0, y: 0, h: 0 }];
  let x = 0,
    y = 0;
  for (let i = 0; i < n; i++) {
    const L = Math.hypot(raw[i + 1].x - raw[i].x, raw[i + 1].y - raw[i].y),
      h = raw[i].h - errH * (i / n);
    x += Math.cos(h) * L;
    y += Math.sin(h) * L;
    pts.push({ x, y, h: 0 });
  }
  const ex = pts[n].x,
    ey = pts[n].y;
  pts.forEach((p, i) => {
    p.x -= (ex * i) / n;
    p.y -= (ey * i) / n;
  });
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  pts.forEach((p, i) => {
    const q = pts[Math.min(n, i + 1)],
      o = pts[Math.max(0, i - 1)];
    p.h = Math.atan2(q.y - o.y, q.x - o.x);
  });
  return { corr: pts, stats: { len, closeErr, errH: (errH * 180) / Math.PI } };
}
