// Plantillas de figuras (7) y su inserción en un tramo recto, portadas de `Track2`
// (trazador-de-pistas.html, líneas ~883-925). Las funciones son puras: devuelven una pista nueva.
import { build, edgesOf } from "@/domain/track/geometry";
import { DEG, type Track } from "@/domain/track/types";

/** Paso de una plantilla: [avance en cm, giro en grados, radio en cm]. */
type TemplateStep = [number, number, number];

export interface TrackTemplate {
  id: string;
  name: string;
  hint: string;
  seq: TemplateStep[];
}

const tO = 15 * Math.tan(57.5 * DEG);

export const TEMPLATES: TrackTemplate[] = [
  {
    id: "dedo",
    name: "Horquilla",
    hint: "Dedo de 60 cm con vuelta R15",
    seq: [
      [0, 90, 15],
      [60, -90, 15],
      [30, -90, 15],
      [60, 90, 15],
    ],
  },
  {
    id: "omega",
    name: "Omega Ω",
    hint: "Bulbo R15 con cuello estrecho",
    seq: [
      [0, 115, 15],
      [2 * tO, -115, 15],
      [2 * tO, -115, 15],
      [2 * tO, 115, 15],
    ],
  },
  {
    id: "joroba",
    name: "Joroba",
    hint: "Desvío suave a 60°",
    seq: [
      [0, 60, 20],
      [75, -120, 20],
      [75, 60, 20],
    ],
  },
  {
    id: "onda",
    name: "Ondas S",
    hint: "Tres ondas a 50°",
    seq: [
      [0, 50, 15],
      [45, -100, 15],
      [45, 100, 15],
      [45, -100, 15],
      [45, 50, 15],
    ],
  },
  {
    id: "diente",
    name: "Diente 135°",
    hint: "Trapecio con esquinas vivas",
    seq: [
      [0, 45, 0],
      [21.21, -45, 0],
      [15, -45, 0],
      [21.21, 45, 0],
    ],
  },
  {
    id: "escuadra",
    name: "Muesca 90°",
    hint: "Cuatro esquinas a escuadra",
    seq: [
      [0, 90, 0],
      [30, -90, 0],
      [30, -90, 0],
      [30, 90, 0],
    ],
  },
  {
    id: "zigzag",
    name: "Zigzag",
    hint: "Dientes de 60° sin curva",
    seq: [
      [0, 60, 0],
      [20, -120, 0],
      [20, 120, 0],
      [20, -120, 0],
      [20, 60, 0],
    ],
  },
];

/** Vértices de la plantilla en coordenadas locales, centrados en x. */
export function templateLocal(tpl: TrackTemplate): { x: number; y: number; radius: number }[] {
  let x = 0;
  let y = 0;
  let h = 0;
  const out: { x: number; y: number; radius: number }[] = [];
  for (const [adv, turn, radius] of tpl.seq) {
    x += Math.cos(h * DEG) * adv;
    y += Math.sin(h * DEG) * adv;
    out.push({ x, y, radius });
    h += turn;
  }
  const span = x; // vuelve a y=0 y rumbo 0
  return out.map((p) => ({ x: p.x - span / 2, y: p.y, radius: p.radius }));
}

export interface TemplateInsertion {
  track: Track;
  /** Índice del primer punto insertado. */
  from: number;
  count: number;
}

/**
 * Inserta la figura en la arista `ei`, centrada en la proyección de (px, py);
 * `side` = +1 a la izquierda, -1 a la derecha. Ajusta `start.edge` si hace falta.
 */
export function insertTemplate(
  track: Track,
  ei: number,
  px: number,
  py: number,
  tplId: string,
  side: 1 | -1 = 1,
): TemplateInsertion | null {
  const tpl = TEMPLATES.find((t) => t.id === tplId);
  if (!tpl) return null;
  const edge = edgesOf(track)[ei];
  if (!edge) return null;
  const [i, j] = edge;
  const A = track.points[i];
  const B = track.points[j];
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  const ux = dx / L;
  const uy = dy / L;
  let s = (px - A.x) * ux + (py - A.y) * uy;
  const loc = templateLocal(tpl);
  const half = Math.max(...loc.map((p) => Math.abs(p.x)));
  const g0 = build(track);
  const tA = g0.V[i].t;
  const tB = g0.V[j].t;
  const f = tpl.seq[0];
  const l = tpl.seq[tpl.seq.length - 1];
  const tf = f[2] * Math.tan((Math.abs(f[1]) * DEG) / 2);
  const tl = l[2] * Math.tan((Math.abs(l[1]) * DEG) / 2);
  const lo = tA + tf + half;
  const hi = L - tB - tl - half;
  s = lo <= hi ? Math.max(lo, Math.min(hi, s)) : L / 2;
  const nx = -uy * side;
  const ny = ux * side;
  const vs = loc.map((p) => ({
    x: A.x + ux * (s + p.x) + nx * p.y,
    y: A.y + uy * (s + p.x) + ny * p.y,
    radius: p.radius,
    gap: false,
  }));
  const points = track.points.map((p) => ({ ...p }));
  const gapFlag = points[i].gap;
  points[i].gap = false;
  points.splice(i + 1, 0, ...vs);
  if (gapFlag) vs[vs.length - 1].gap = true;
  const start =
    track.start.edge > ei
      ? { ...track.start, edge: track.start.edge + vs.length }
      : { ...track.start };
  return { track: { ...track, points, start }, from: i + 1, count: vs.length };
}
