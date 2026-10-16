// Tipos de componente con sus capacidades (DO-03), portados del prototipo (Protoripo.html).
// Cada tipo declara qué campos tiene y qué aporta a la consola/manifiesto (`cap`).
import type { Specs, ComponentType } from "@/domain/models/domain";

export const TIPOS: Record<string, ComponentType> = {
  mcu: {
    name: "Microcontrolador",
    color: "#FF5A78",
    fields: [
      ["mhz", "Frecuencia (MHz)", "n"],
      ["radio", "Radio", "t"],
      ["logica", "Lógica (V)", "n"],
      ["adc", "Entradas analógicas usables", "n"],
    ],
    summary: (s) => `${s.mhz} MHz · ${s.radio} · ${s.logica} V`,
    capability: (s) =>
      s.radio && s.radio !== "Ninguna"
        ? `Conexión y arranque inalámbrico por ${s.radio}`
        : "Ejecuta el firmware (sin radio)",
  },
  exp: {
    name: "Placa de expansión",
    color: "#A2A7B8",
    fields: [
      ["bornes", "Bornes", "n"],
      ["comercial", "PCB comercial", "t"],
    ],
    summary: (s) =>
      `${s.bornes} bornes · ${s.comercial === "Sí" ? "PCB comercial" : "diseño propio"}`,
  },
  linea: {
    name: "Sensor de línea",
    color: "#3DDC97",
    fields: [
      ["canales", "Canales", "n"],
      ["salida", "Salida", "t"],
      ["paso", "Paso (mm)", "n"],
      ["i", "Consumo (A)", "n"],
    ],
    summary: (s) => `${s.canales} canales · ${s.salida} · paso ${s.paso} mm`,
    capability: (s) => `${s.canales} canales de línea en la regleta`,
  },
  mux: {
    name: "Multiplexor",
    color: "#6CB6FF",
    fields: [
      ["canales", "Canales", "n"],
      ["tipo", "Tipo", "t"],
    ],
    summary: (s) => `${s.canales} canales · ${s.tipo}`,
  },
  motor: {
    name: "Motor",
    color: "#B48CFF",
    fields: [
      ["v", "Voltaje nominal (V)", "n"],
      ["rpm", "RPM sin carga", "n"],
      ["inom", "Corriente nominal (A)", "n"],
      ["ipico", "Corriente de arranque (A)", "n"],
      ["red", "Reducción", "t"],
      ["familia", "Familia", "t"],
    ],
    summary: (s) => `${s.v} V · ${s.rpm} rpm · ${s.ipico} A arranque`,
    capability: () => "Actuador: PWM de −100 a 100 %",
  },
  driver: {
    name: "Driver",
    color: "#FFCB57",
    fields: [
      ["canales", "Canales", "n"],
      ["icont", "Corriente continua (A)", "n"],
      ["ipico", "Corriente pico (A)", "n"],
      ["vmin", "V mín.", "n"],
      ["vmax", "V máx.", "n"],
    ],
    summary: (s) => `${s.canales} ch · ${s.icont} A cont. · ${s.vmin}–${s.vmax} V`,
  },
  bat: {
    name: "Batería",
    color: "#3DDC97",
    fields: [
      ["celdas", "Celdas (S)", "n"],
      ["mah", "Capacidad (mAh)", "n"],
      ["c", "Descarga (C)", "n"],
      ["vmax", "V a carga completa", "n"],
    ],
    summary: (s) => `${s.celdas}S · ${s.mah} mAh · ${s.c}C`,
    capability: () => "Voltaje de batería en la telemetría",
  },
  reg: {
    name: "Regulador",
    color: "#A2A7B8",
    fields: [
      ["vout", "Salida (V)", "n"],
      ["imax", "Corriente máx. (A)", "n"],
      ["tipo", "Tipo", "t"],
    ],
    summary: (s) => `${s.vout} V · ${s.imax} A · ${s.tipo}`,
  },
  rueda: {
    name: "Rueda",
    color: "#A2A7B8",
    fields: [
      ["diam", "Diámetro (mm)", "n"],
      ["material", "Material", "t"],
    ],
    summary: (s) => `Ø ${s.diam} mm · ${s.material}`,
  },
  chasis: {
    name: "Chasis",
    color: "#A2A7B8",
    fields: [
      ["ancho", "Ancho (mm)", "n"],
      ["largo", "Largo (mm)", "n"],
      ["material", "Material", "t"],
    ],
    summary: (s) => `${s.ancho} × ${s.largo} mm · ${s.material}`,
  },
  sw: {
    name: "Interruptor",
    color: "#5E6374",
    fields: [["tipo", "Tipo", "t"]],
    summary: (s) => String(s.tipo),
  },
  enc: {
    name: "Encoder",
    color: "#6CB6FF",
    fields: [
      ["cpr", "Pulsos por vuelta (CPR)", "n"],
      ["tipo", "Tipo", "t"],
    ],
    summary: (s) => `${s.cpr} CPR · ${s.tipo}`,
    capability: () => "Velocidad de cada rueda (rpm)",
  },
  imu: {
    name: "IMU",
    color: "#6CB6FF",
    fields: [
      ["ejes", "Ejes", "n"],
      ["bus", "Bus", "t"],
    ],
    summary: (s) => `${s.ejes} ejes · ${s.bus}`,
    capability: () => "Giro y aceleración",
  },
  turb: {
    name: "Turbina",
    color: "#FF2D55",
    fields: [
      ["diam", "Diámetro (mm)", "n"],
      ["v", "Voltaje (V)", "n"],
      ["imax", "Corriente (A)", "n"],
    ],
    summary: (s) => `Ø ${s.diam} mm · ${s.v} V · ${s.imax} A`,
    capability: () => "Actuador: succión de 0 a 100 %",
  },
};

/** Orden canónico de los tipos (para chips del catálogo y ordenación). */
export const ORDEN_TIPOS: string[] = Object.keys(TIPOS);

/** Color de un tipo, con respaldo gris. */
export const colorTipo = (t: string): string => TIPOS[t]?.color ?? "#A2A7B8";

/** Resumen de specs de un componente de tipo `t`. */
export const resumenSpecs = (t: string, s: Specs): string => TIPOS[t].summary(s);
