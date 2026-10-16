// Tipos del dominio de la consola, portados del prototipo (Protoripo.html, maqueta v2).
// Modelan el catálogo, los robots con versiones, los perfiles de reglamento y los
// controladores enchufables (DO-03, HU-06, HU-10, HU-17).

/** Especificaciones de un componente: cada tipo declara sus campos (numéricos o de texto). */
export type Specs = Record<string, number | string>;

export type Severity = "ok" | "warn" | "bad";

/** Resultado de una revisión (compatibilidad o reglamento): severidad, título y detalle. */
export type Check = [Severity, string, string];

/** Un tipo de componente y lo que aporta a la consola (DO-03: capacidades). */
export interface ComponentType {
  name: string;
  /** Color identificador del tipo. */
  color: string;
  /** Campos del tipo: [clave, etiqueta, "n" numérico | "t" texto]. */
  fields: [clave: string, etiqueta: string, tipo: "n" | "t"][];
  /** Resumen legible de las specs. */
  summary: (s: Specs) => string;
  /** Qué aporta al manifiesto/consola; ausente si el tipo no agrega paneles. */
  capability?: (s: Specs) => string;
}

export interface Component {
  id: string;
  /** Clave del tipo en TIPOS. */
  typeId: string;
  name: string;
  price: number;
  mass: number;
  store: string;
  stock: number;
  /** Consumo estimado en amperios. */
  amps?: number;
  specs: Specs;
}

/** Slot del armador: un hueco que se llena con un componente de un tipo. */
export interface Slot {
  key: string;
  typeId: string;
  name: string;
  /** 1 si es obligatoria. */
  req?: number;
  /** 1 si admite cantidad editable. */
  qty?: number;
  /** 1 si es opcional y depende del reglamento. */
  opt?: number;
}

export interface PartRef {
  id: string;
  qty: number;
}

/** Parts de una versión: por clave de ranura, la pieza elegida. */
export type Parts = Record<string, PartRef | undefined>;

export interface Version {
  v: string;
  date: string;
  note: string;
  status: string;
  parts: Parts;
}

export interface RobotDef {
  id: string;
  name: string;
  short: string;
  type: "racer" | "minisumo";
  fw: string | null;
  versions: Version[];
  /** ID en la BD de la versión actual (base para guardar la siguiente). null si no hay versión. */
  currentVersionId?: number | null;
}

/** Reglas de una categoría, guardadas como datos (HU-10). `null` = libre. */
export interface ProfileRules {
  dim: [number, number] | null;
  maxSensors: number | null;
  motors: number | null;
  motorFam: string[] | null;
  wheels: number | null;
  drivers: number | null;
  mcu: string[] | null;
  turbine: boolean;
  commercialPcb: boolean;
  mounting: string;
  chassis: string;
  chasisMat?: string[];
  startMode: string;
  wireless: boolean;
  enc: boolean;
  imu: boolean;
  speedMap: boolean;
  mr4: boolean;
}

export interface Profile {
  id: string;
  comp: string;
  tag: string;
  cat: string;
  rules: ProfileRules;
}

/** Definición de un parámetro de control (rango, paso y decimales). */
export interface ParamDef {
  name: string;
  t: string;
  min: number;
  max: number;
  step: number;
  dec: number;
}

/** Un controlador enchufable (PID, adaptativo, difuso) con sus parámetros y presets. */
export interface Controller {
  name: string;
  short: string;
  /** Parámetros que expone, en orden. */
  keys: string[];
  /** Parámetros que optimiza el ingeniero de pista (Twiddle). */
  tw: string[];
  desc: string;
  presets: Record<string, Record<string, number>>;
}

/** Setup activo: controlador elegido y valores de sus parámetros (HU-17). */
export interface Setup {
  controller: string;
  parameters: Record<string, number>;
}

/** Datos derivados de las piezas de una versión (facts del prototipo). */
export interface Facts {
  cost: number;
  mass: number;
  current: number;
  line?: Component;
  sensors: number;
  sensorMdth: number;
  motor?: Component;
  motors: number;
  mcu?: Component;
  driver?: Component;
  drivers: number;
  bat?: Component;
  reg?: Component;
  mux?: Component;
  exp?: Component;
  rueda?: Component;
  chassis?: Component;
  ancho: number;
  length: number;
  enc?: Component;
  imu?: Component;
  turbine?: Component;
  radio: string;
}
