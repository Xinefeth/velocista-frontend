// Estado de la simulación de vuelta (EN-28, requisito 7): un robot de prueba que recorre la línea.
// Es TypeScript puro y no toca el documento: la geometría se la pasa quien lo usa en cada llamada, así
// la simulación sigue a la pista aunque se edite mientras corre.
import { simStartS } from "@/domain/track/simulation";
import type { Geometry, Track } from "@/domain/track/types";

export interface SimulationState {
  /** La barra de simulación está abierta. */
  on: boolean;
  playing: boolean;
  /** Recorrido de la línea en cm (absoluto: arranca en la bandera de salida). */
  s: number;
  /** Velocidad en m/s. */
  speed: number;
  /** Ancho y largo del robot de prueba, en cm. */
  width: number;
  length: number;
}

export const DEFAULT_SIMULATION: SimulationState = {
  on: false,
  playing: false,
  s: 0,
  speed: 1,
  width: 15,
  length: 20,
};

export const NO_LENGTH_MESSAGE = "Dibuja una pista antes de simular.";

/** Límites de los valores editables (los del prototipo). */
export const SIM_LIMITS = {
  speed: { min: 0.1, max: 6 },
  size: { min: 2, max: 60 },
} as const;

/** Un cuadro largo (pestaña dormida) no debe hacer saltar al robot. */
const MAX_FRAME_S = 0.05;

type Listener = () => void;

export class TrackSimulation {
  private state: SimulationState = DEFAULT_SIMULATION;
  private listeners = new Set<Listener>();

  getState = (): SimulationState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SimulationState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Abre la simulación en la bandera de salida. Devuelve `false` si la pista no tiene largo. */
  open(g: Geometry, start: Track["start"]): boolean {
    if (g.L <= 0) return false;
    this.set({ on: true, playing: false, s: simStartS(g, start) });
    return true;
  }

  close(): void {
    if (this.state.on || this.state.playing) this.set({ on: false, playing: false });
  }

  /** Reproduce o pausa; en una pista abierta que ya llegó al final, vuelve a empezar desde el inicio. */
  toggle(g: Geometry): void {
    if (!this.state.on) return;
    const atEnd = !g.closed && this.state.s >= g.L - 0.01;
    this.set({ playing: !this.state.playing, s: atEnd ? 0 : this.state.s });
  }

  /** Coloca el robot a una fracción (0..1) de la vuelta, contada desde la salida. */
  seek(g: Geometry, start: Track["start"], fraction: number): void {
    if (!this.state.on || g.L <= 0) return;
    const f = Math.max(0, Math.min(1, fraction));
    this.set({ s: simStartS(g, start) + f * g.L });
  }

  /** Avanza `seconds` de tiempo real. Si el circuito es abierto se detiene al llegar al final. */
  tick(g: Geometry, seconds: number): void {
    if (!this.state.on || !this.state.playing) return;
    const s = this.state.s + this.state.speed * 100 * Math.min(MAX_FRAME_S, Math.max(0, seconds));
    if (!g.closed && s >= g.L) this.set({ s: g.L, playing: false });
    else this.set({ s });
  }

  /** Cambia velocidad o tamaño del robot; los valores fuera de rango se ignoran. */
  setParams(patch: Partial<Pick<SimulationState, "speed" | "width" | "length">>): void {
    const next: Partial<SimulationState> = {};
    const ok = (v: unknown, min: number, max: number): v is number =>
      typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
    const { speed, size } = SIM_LIMITS;
    if (ok(patch.speed, speed.min, speed.max)) next.speed = patch.speed;
    if (ok(patch.width, size.min, size.max)) next.width = patch.width;
    if (ok(patch.length, size.min, size.max)) next.length = patch.length;
    if (Object.keys(next).length) this.set(next);
  }

  /** Posición dentro de la vuelta (0..1) y tiempo transcurrido / total en segundos. */
  progress(
    g: Geometry,
    start: Track["start"],
  ): { fraction: number; elapsed: number; total: number } {
    const v = this.state.speed * 100;
    if (g.L <= 0) return { fraction: 0, elapsed: 0, total: 0 };
    let e = this.state.s - simStartS(g, start);
    if (g.closed) e = ((e % g.L) + g.L) % g.L;
    e = Math.max(0, Math.min(e, g.L));
    return { fraction: e / g.L, elapsed: e / v, total: g.L / v };
  }
}
