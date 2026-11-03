// Ajuste a la rejilla y al ángulo, portado de `snapW` y `angleSnap` del prototipo.
import { DEG } from "@/domain/track/types";

export interface SnapOptions {
  /** ¿Ajustar a la rejilla? */
  snap: boolean;
  /** Paso de la rejilla en cm. */
  step: number;
  /** Paso del ángulo en grados (para dibujar con Mayús y para girar). */
  angStep: number;
}

export const DEFAULT_SNAP: SnapOptions = { snap: true, step: 5, angStep: 15 };

/** Ajusta un punto del tablero a la rejilla; con `alt` se desactiva el ajuste. */
export function snapPoint(x: number, y: number, o: SnapOptions, alt = false): [number, number] {
  if (!o.snap || alt || !(o.step > 0)) return [x, y];
  return [Math.round(x / o.step) * o.step, Math.round(y / o.step) * o.step];
}

/**
 * Ajusta (x, y) al ángulo más cercano (múltiplos de `angStep`) respecto a `from`;
 * con la rejilla activa también redondea el largo al paso.
 */
export function angleSnap(
  from: { x: number; y: number },
  x: number,
  y: number,
  o: SnapOptions,
): [number, number] {
  const step = (o.angStep > 0 ? o.angStep : 15) * DEG;
  const L = Math.hypot(x - from.x, y - from.y);
  const a = Math.round(Math.atan2(y - from.y, x - from.x) / step) * step;
  const len = o.snap && o.step > 0 ? Math.round(L / o.step) * o.step : L;
  return [from.x + Math.cos(a) * len, from.y + Math.sin(a) * len];
}
