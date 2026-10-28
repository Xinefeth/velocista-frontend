// Matemática de la vista del lienzo (zoom y desplazamiento), portada de `fitView/W2S/S2W/zoomAt`
// del prototipo. Coordenadas del tablero en cm con y hacia arriba; pantalla en píxeles CSS.

export interface Viewport {
  /** Píxeles por cm. */
  z: number;
  /** Posición en pantalla del origen del tablero (esquina inferior izquierda). */
  vx: number;
  vy: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 40;

/** Margen alrededor del tablero al ajustar la vista (deja sitio a las reglas y a las etiquetas). */
const PAD_X = 74;
const PAD_Y = 114;

export const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/** Vista que encuadra todo el tablero centrado en un lienzo de `w` × `h` píxeles. */
export function fitViewport(
  board: { widthCm: number; heightCm: number },
  w: number,
  h: number,
): Viewport {
  const z = clampZoom(
    Math.min(Math.max(1, w - PAD_X) / board.widthCm, Math.max(1, h - PAD_Y) / board.heightCm),
  );
  return { z, vx: (w - board.widthCm * z) / 2, vy: (h + board.heightCm * z) / 2 };
}

/** Del tablero (cm) a la pantalla (px). */
export const worldToScreen = (v: Viewport, x: number, y: number): [number, number] => [
  v.vx + x * v.z,
  v.vy - y * v.z,
];

/** De la pantalla (px) al tablero (cm). */
export const screenToWorld = (v: Viewport, sx: number, sy: number): [number, number] => [
  (sx - v.vx) / v.z,
  (v.vy - sy) / v.z,
];

/** Acerca o aleja por el factor `f` manteniendo fijo el punto de pantalla (sx, sy). */
export function zoomAt(v: Viewport, f: number, sx: number, sy: number): Viewport {
  const z = clampZoom(v.z * f);
  const k = z / v.z;
  return { z, vx: sx - (sx - v.vx) * k, vy: sy - (sy - v.vy) * k };
}

/** Desplaza la vista `dx`, `dy` píxeles. */
export const panBy = (v: Viewport, dx: number, dy: number): Viewport => ({
  ...v,
  vx: v.vx + dx,
  vy: v.vy + dy,
});
