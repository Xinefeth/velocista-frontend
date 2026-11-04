// Proyección de puntos en metros a un lienzo (y hacia arriba) y cuadrícula. Sin DOM: se prueba
// sola y la usan todos los lienzos de Medición (recorrido, GPS, áreas y mapa de pista).

export interface Pt {
  x: number;
  y: number;
}

export interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface View {
  /** Píxeles por metro. */
  k: number;
  /** Punto en metros → [x, y] en píxeles del lienzo. */
  P: (p: Pt) => [number, number];
  /** Píxeles → metros (para marcar puntos con el puntero). */
  M: (px: number, py: number) => Pt;
}

export function boundsOf(...groups: (readonly Pt[] | null | undefined)[]): Bounds | null {
  let b: Bounds | null = null;
  for (const group of groups)
    for (const p of group ?? []) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (!b) b = { x0: p.x, x1: p.x, y0: p.y, y1: p.y };
      else {
        b.x0 = Math.min(b.x0, p.x);
        b.x1 = Math.max(b.x1, p.x);
        b.y0 = Math.min(b.y0, p.y);
        b.y1 = Math.max(b.y1, p.y);
      }
    }
  return b;
}

/**
 * Encaja `bounds` centrado en un lienzo de `w × h` píxeles con `pad` de margen, con la misma
 * escala en x y en y. `minSpan` evita agrandar el ruido cuando hay pocos metros.
 */
export function fitView(bounds: Bounds, w: number, h: number, pad = 24, minSpan = 1): View {
  const spanX = Math.max(bounds.x1 - bounds.x0, minSpan);
  const spanY = Math.max(bounds.y1 - bounds.y0, minSpan);
  const k = Math.max(Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY), 1e-6);
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;
  return {
    k,
    P: (p) => [w / 2 + (p.x - cx) * k, h / 2 - (p.y - cy) * k],
    M: (px, py) => ({ x: cx + (px - w / 2) / k, y: cy - (py - h / 2) / k }),
  };
}

/** Separación de la cuadrícula en metros según lo que se ve: 1, 5, 10 o 50 m. */
export function gridStep(span: number): number {
  if (span > 200) return 50;
  if (span > 40) return 10;
  if (span > 15) return 5;
  return 1;
}

/** Puntos de un rectángulo L × W con una esquina en el origen (como un plano simple). */
export const rectangle = (length: number, width: number): Pt[] => [
  { x: 0, y: 0 },
  { x: length, y: 0 },
  { x: length, y: width },
  { x: 0, y: width },
];

/** Perímetro de un polígono cerrado. */
export function perimeter(points: readonly Pt[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return points.length > 2 ? total : 0;
}

/** Área de un polígono simple con la fórmula de Gauss (sirve para figuras cóncavas). */
export function area(points: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}
