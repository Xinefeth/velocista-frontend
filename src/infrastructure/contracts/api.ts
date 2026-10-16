// Tipos de las respuestas REST de la consola. Claves de campo y valores de enum en inglés
// según la fuente de verdad docs/CONTRACT.md (v1, backend ↔ frontend).

export interface Salud {
  api: string;
  database: string;
  environment: string;
  devices: Record<"robot" | "timer", boolean>;
}

/** Formato estándar de errores de negocio (DO-02, sección 8.4). */
export interface ErrorNegocio {
  reason: string;
  detail: string;
}

export type EstadoConexion = "checking" | "ok" | "down";

/** Resumen de una corrida devuelto por la API (CorridaSalida). */
export interface CorridaApi {
  id: number;
  number: number;
  robot_id: string;
  version_id: number;
  setup_id: number;
  profile_id: string;
  controller_id: string;
  parameters: Record<string, number>;
  date: string;
  source: "sim" | "robot";
  mode: "test" | "competition";
  line: "black" | "white";
  battery_compensation: boolean;
  turbine_power_pct: number;
  time_s: number | null;
  finished: boolean;
  accumulated_error: number;
  battery_v: number;
  sectors_s: number[];
  time_source: "finish" | "telemetry";
  note: string;
  j: number;
}

export interface PaginaCorridas {
  items: CorridaApi[];
  total: number;
  limit: number;
  offset: number;
}

/** Resumen de un robot devuelto por la API (RobotSalida). */
export interface RobotApi {
  id: string;
  name: string;
  short_code: string;
  type: "racer" | "minisumo";
  firmware: string | null;
  current_version_id: number | null;
  archived: boolean;
}

export interface PaginaRobots {
  items: RobotApi[];
  total: number;
  limit: number;
  offset: number;
}

export interface RobotVersionApi {
  id: number;
  robot_id: string;
  label: string;
  date: string;
  note: string;
  status: string;
  parts: Record<string, { component_id: string; quantity: number }>;
}

/** Component del catálogo devuelto por la API (ComponenteSalida). */
export interface ComponenteApi {
  id: string;
  type_id: string;
  name: string;
  price: number;
  mass_g: number;
  store: string;
  current_a: number | null;
  specs: Record<string, string | number>;
  stock: number;
  archived: boolean;
}

export interface PaginaComponentes {
  items: ComponenteApi[];
  total: number;
  limit: number;
  offset: number;
}
