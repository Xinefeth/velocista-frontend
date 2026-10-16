// Controladores enchufables y sus parámetros (HU-17, EN-21, HU-31), del prototipo (Protoripo.html).
import type { Controller, ParamDef, Setup } from "@/domain/models/domain";
import { fmt } from "@/domain/format";

/** Definición de cada parámetro: rango, paso y decimales. */
export const PDEF: Record<string, ParamDef> = {
  kp: { name: "Kp", t: "Proporcional", min: 0, max: 2, step: 0.01, dec: 2 },
  ki: { name: "Ki", t: "Integral", min: 0, max: 0.3, step: 0.005, dec: 3 },
  kd: { name: "Kd", t: "Derivativo", min: 0, max: 10, step: 0.1, dec: 1 },
  base: { name: "Base", t: "Velocidad base (%)", min: 10, max: 100, step: 1, dec: 0 },
  max: { name: "Máx", t: "PWM máximo (%)", min: 20, max: 100, step: 1, dec: 0 },
  kv: {
    name: "Kv",
    t: "Frenado: cuánto baja la velocidad con el error",
    min: 0,
    max: 1,
    step: 0.05,
    dec: 2,
  },
  vmin: { name: "Vmín", t: "Velocidad mínima en curva (%)", min: 10, max: 60, step: 1, dec: 0 },
  g: { name: "G", t: "Ganancia de las reglas difusas", min: 0, max: 2, step: 0.01, dec: 2 },
  d: { name: "D", t: "Amortiguamiento (derivativo)", min: 0, max: 10, step: 0.1, dec: 1 },
};

export const CTRL: Record<string, Controller> = {
  pid: {
    name: "PID",
    short: "PID",
    keys: ["kp", "ki", "kd", "base", "max"],
    tw: ["kp", "kd"],
    desc: "Clásico. Con Ki = 0 funciona como PD, lo más usado en velocistas.",
    presets: {
      Seguro: { kp: 0.45, ki: 0, kd: 3.5, base: 38, max: 80 },
      Base: { kp: 0.6, ki: 0, kd: 2.5, base: 45, max: 86 },
      Agresivo: { kp: 0.8, ki: 0, kd: 4.0, base: 62, max: 86 },
    },
  },
  adapt: {
    name: "PID adaptativo",
    short: "Adaptativo",
    keys: ["kp", "ki", "kd", "base", "max", "kv", "vmin"],
    tw: ["kp", "kd", "kv"],
    desc: "PID con velocidad base variable: frena según el error (Kv) sin bajar de Vmín. Rápido en rectas, prudente en curvas.",
    presets: {
      Seguro: { kp: 0.5, ki: 0, kd: 3.0, base: 55, max: 86, kv: 0.5, vmin: 30 },
      Base: { kp: 0.6, ki: 0, kd: 2.8, base: 65, max: 86, kv: 0.55, vmin: 32 },
      Agresivo: { kp: 0.75, ki: 0, kd: 3.5, base: 78, max: 86, kv: 0.6, vmin: 35 },
    },
  },
  fuzzy: {
    name: "Difuso",
    short: "Difuso",
    keys: ["g", "d", "base", "max"],
    tw: ["g", "d"],
    desc: "Reglas difusas: corrige suave con error chico y fuerte con error grande. Para comparar contra el PID en el informe.",
    presets: {
      Seguro: { g: 0.5, d: 3.0, base: 42, max: 86 },
      Base: { g: 0.65, d: 2.6, base: 50, max: 86 },
      Agresivo: { g: 0.85, d: 3.6, base: 60, max: 86 },
    },
  },
};

/** Resumen corto de un setup: los parámetros que optimiza Twiddle, Ki si aplica y la base. */
export const psum = (c: string, p: Record<string, number>): string =>
  CTRL[c].tw
    .map((k) => `${PDEF[k].name} ${fmt(p[k], PDEF[k].dec)}`)
    .concat(p.ki > 0 ? [`Ki ${fmt(p.ki, 3)}`] : [])
    .concat([`${Math.round(p.base)} %`])
    .join(" · ");

/** True si dos setups difieren en controlador o en algún parámetro. */
export const differs = (a: Setup, b: Setup): boolean =>
  a.controller !== b.controller ||
  CTRL[a.controller].keys.some((k) => Math.abs(a.parameters[k] - b.parameters[k]) > 1e-9);
