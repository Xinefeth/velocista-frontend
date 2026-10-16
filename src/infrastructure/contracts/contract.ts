// Tipos del contrato de mensajes WS v2.0. Claves y enums en inglés según docs/CONTRACT.md.
// El backend actúa como anti-corruption layer y entrega el WS siempre en inglés.
// Excepción: las CLAVES dentro de `channels` (p. ej. bateria_v, regleta) las define el
// manifiesto del firmware y siguen en español hasta que el firmware migre.

export type ValorCanal = number | boolean | number[];

export interface Canal {
  name: string;
  description: string;
  type: "float" | "int" | "bool" | "float[]" | "int[]";
  length?: number;
  unit: string;
  min?: number;
  max?: number;
  group: "status" | "signals";
}

export interface Parametro {
  name: string;
  label: string;
  type: "float" | "int";
  min: number;
  max: number;
  step?: number;
  value: number;
  unit: string;
  optimizable: boolean;
}

export interface Controller {
  name: string;
  description: string;
  parameters: Parametro[];
}

export interface Manifiesto {
  contract: string;
  id: string;
  robot_type: string;
  firmware: string;
  sensors: {
    name: string;
    model: string;
    channels: string[];
    details: Record<string, unknown>;
  }[];
  actuators: { name: string; type: string; model: string; channels: string[] }[];
  channels: Canal[];
  controllers: Controller[];
  active_controller: string;
  commands: string[];
  frequencies: { loop_hz: number; status_hz: number; signals_hz: number };
  start_mode: "command" | "start_module";
  battery_compensation: boolean;
}

export interface EstadoRobot {
  state: "ready" | "calibrating" | "running" | "stopped" | "error";
  calibrated: boolean;
  mode: "test" | "competition";
  line: "black" | "white";
  controller: string;
  loop_hz: number;
  rssi_dbm: number;
  channels: Record<string, ValorCanal>;
}

export interface Senales {
  t_ms: number;
  channels: Record<string, ValorCanal>;
}

export interface Ack {
  ok: boolean;
  reason?: string;
  detail?: string;
}

/** Mensaje que la API reenvía a la consola por /ws/console. */
export interface MensajeConsola<T = Record<string, unknown>> {
  sender: "robot" | "timer" | "api";
  type: string;
  seq: number;
  ts: number;
  data: T;
  received_ms: number;
}

/** Canales de un grupo según el manifiesto: la consola arma sus paneles con esto. */
export function canalesDe(m: Manifiesto, group: Canal["group"]): Canal[] {
  return m.channels.filter((c) => c.group === group);
}
