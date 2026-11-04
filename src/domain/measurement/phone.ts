// Cálculos en vivo de la página del celular, sin DOM ni sensores (se prueban solos). Son
// aproximados para guiar a quien mide: el resultado final lo calcula el backend con correcciones.

export const GRAVITY = 9.80665;
/** Umbral de pico (|a| − g) por defecto, el mismo del backend si aún no se aprendió al calibrar. */
export const STEP_THRESHOLD = 1.2;
export const STEP_MIN_INTERVAL_MS = 300;
/** Largo del paso si no se calibró (promedio de un adulto). */
export const DEFAULT_STEP_M = 0.7;
const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;

/**
 * Contador de pasos con la misma regla que el backend: media móvil de 3 de |a| − g, un pico sobre
 * el umbral cuenta un paso (si pasaron 300 ms) y se rearma al bajar de −umbral/2.
 */
export function stepCounter(threshold = STEP_THRESHOLD) {
  const win: number[] = [];
  let armed = true;
  let last = -1e12;
  let count = 0;
  return (tMs: number, accel: readonly number[] | null): number => {
    if (!accel) return count;
    win.push(Math.hypot(accel[0], accel[1], accel[2]) - GRAVITY);
    if (win.length > 3) win.shift();
    const s = win.reduce((a, b) => a + b, 0) / win.length;
    if (armed && s > threshold && tMs - last >= STEP_MIN_INTERVAL_MS) {
      count++;
      last = tMs;
      armed = false;
    } else if (s < -threshold / 2) armed = true;
    return count;
  };
}

/** Una lectura del acelerómetro (con gravedad) para saber si la persona camina o está quieta. */
export interface MotionSample {
  t: number;
  acc: readonly number[];
}
export type MotionState = "walking" | "still" | "no_data";
/** Sin lecturas del acelerómetro durante este tiempo (ms) se dice «sin datos». */
export const NO_DATA_MS = 3000;
/** Un paso detectado en este lapso (ms) cuenta como «caminando». */
export const WALK_STEP_WINDOW_MS = 1500;
/** Ventana (ms) y desviación estándar de |a| − g (m/s²) sobre la cual el celular ya no está quieto. */
export const MOTION_WINDOW_MS = 1000;
export const STILL_DEVIATION = 0.6;

/**
 * ¿La persona camina, está quieta o no llegan datos? Usa el mismo detector de pasos del método por
 * pasos y, además, la variación de |a| − g del último segundo (un paso flojo o una sacudida mueven
 * el celular aunque no pasen el umbral). Función pura: `now` y las muestras llevan la misma escala.
 */
export function motionState(
  samples: readonly MotionSample[],
  now: number,
  threshold = STEP_THRESHOLD,
): MotionState {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > NO_DATA_MS) return "no_data";
  const count = stepCounter(threshold);
  let steps = 0;
  for (const s of samples) if (now - s.t <= WALK_STEP_WINDOW_MS) steps = count(s.t, s.acc);
  if (steps > 0) return "walking";
  const dev = samples
    .filter((s) => now - s.t <= MOTION_WINDOW_MS)
    .map((s) => Math.hypot(s.acc[0], s.acc[1], s.acc[2]) - GRAVITY);
  if (dev.length >= 3) {
    const mean = dev.reduce((a, b) => a + b, 0) / dev.length;
    const variance = dev.reduce((a, b) => a + (b - mean) ** 2, 0) / dev.length;
    if (Math.sqrt(variance) > STILL_DEVIATION) return "walking";
  }
  return "still";
}

export interface Fix {
  t_ms: number;
  lat: number;
  lon: number;
  accuracy_m: number;
}

/** Punto GPS de una persona quieta: lecturas con precisión ≤ la mediana, ponderadas por 1/precisión². */
export function stillPoint(
  fixes: readonly Fix[],
): { lat: number; lon: number; accuracy_m: number } | null {
  if (fixes.length < 3) return null;
  const acc = fixes.map((f) => f.accuracy_m).sort((a, b) => a - b);
  const cut = acc[Math.floor(acc.length / 2)];
  let w = 0;
  let lat = 0;
  let lon = 0;
  for (const f of fixes) {
    if (f.accuracy_m > cut) continue;
    const k = 1 / Math.max(f.accuracy_m, 0.5) ** 2;
    w += k;
    lat += f.lat * k;
    lon += f.lon * k;
  }
  return { lat: lat / w, lon: lon / w, accuracy_m: cut };
}

/** Latitud y longitud a metros en un plano local con origen en `o` (x al este, y al norte). */
export function toLocal(p: { lat: number; lon: number }, o: { lat: number; lon: number }) {
  return {
    x: (p.lon - o.lon) * RAD * EARTH_R * Math.cos(o.lat * RAD),
    y: (p.lat - o.lat) * RAD * EARTH_R,
  };
}

export function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const p = toLocal(b, a);
  return Math.hypot(p.x, p.y);
}

/** Giro integrado (°): suma de (giro − sesgo) × tiempo, con saltos de tiempo limitados a 1 s. */
export function integrateTurn(heading: number, rateDps: number, biasDps: number, dtMs: number) {
  return heading + ((rateDps - biasDps) * Math.min(dtMs, 1000)) / 1000;
}

/** Ángulo corrido (sin saltos en ±180) a partir de lecturas `alpha` sucesivas de orientación. */
export function unwrap(previousRaw: number | null, total: number | null, alpha: number): number {
  if (previousRaw == null || total == null) return alpha;
  let d = alpha - previousRaw;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return total + d;
}

export interface WalkState {
  path: { x: number; y: number }[];
  heading: number;
  steps: number;
  dist: number;
  sides: number[];
  sideFrom: number;
  /** Rumbo del lado actual, fijado tras caminar 0,5 m. */
  sideHeading: number | null;
}

export const newWalk = (): WalkState => ({
  path: [{ x: 0, y: 0 }],
  heading: 0,
  steps: 0,
  dist: 0,
  sides: [],
  sideFrom: 0,
  sideHeading: null,
});

/** Un paso más en la dirección actual. */
export function stepForward(w: WalkState, stepM: number): WalkState {
  const last = w.path[w.path.length - 1];
  const a = w.heading * RAD;
  return {
    ...w,
    steps: w.steps + 1,
    dist: w.dist + stepM,
    path: [...w.path, { x: last.x + stepM * Math.cos(a), y: last.y + stepM * Math.sin(a) }],
  };
}

/** ¿Hay que marcar esquina? Tras 1 m en el lado, girar más de 60° respecto de su rumbo. */
export function shouldMarkCorner(w: WalkState): boolean {
  const walked = w.dist - w.sideFrom;
  return w.sideHeading != null && walked >= 1 && Math.abs(w.heading - w.sideHeading) > 60;
}

/** Fija el rumbo del lado tras caminar 0,5 m. */
export function fixSideHeading(w: WalkState): WalkState {
  if (w.sideHeading == null && w.dist - w.sideFrom >= 0.5) return { ...w, sideHeading: w.heading };
  return w;
}

/** Cierra el lado actual en una esquina: guarda su largo y empieza el siguiente. */
export function markCorner(w: WalkState): WalkState {
  return { ...w, sides: [...w.sides, w.dist - w.sideFrom], sideFrom: w.dist, sideHeading: null };
}

/** Código nuevo para este celular (se guarda en el navegador). */
export function newDeviceId(random = () => Math.random().toString(36).slice(2)): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `cel-${uuid ?? Date.now().toString(36) + random()}`;
}

/**
 * Id de celular leído de localStorage. La página vieja lo guardaba como JSON (con comillas, por
 * ejemplo `"cel-621b8d99"`); la nueva lo guarda tal cual. Se quitan las comillas para no leer un
 * id roto. Devuelve `null` si no hay un id usable.
 */
export function normalizeDeviceId(raw: string | null | undefined): string | null {
  let value = (raw ?? "").trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      const parsed: unknown = JSON.parse(value);
      value = typeof parsed === "string" ? parsed.trim() : value.slice(1, -1).trim();
    } catch {
      value = value.slice(1, -1).trim();
    }
  }
  return value || null;
}
