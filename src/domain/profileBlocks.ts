// Bloqueos preventivos del reglamento (HU-10): qué opciones del Armador prohíbe un perfil y por qué.
// Funciones puras de (perfil, ranura, ítem): no leen estado global. Comparten los predicados con
// `checks()` (src/domain/rules.ts), así que un ítem bloqueado que se elige siempre sale "bad" allí.
// Si falta el dato del ítem para evaluar una regla, NO se bloquea: el panel de cumplimiento audita.
import type { Component, Profile, Slot } from "@/domain/models/domain";
import { num } from "@/domain/format";
import {
  chassisMaterialAllowed,
  fitsDimensions,
  mcuAllowed,
  motorFamilyAllowed,
} from "@/domain/rules";

export interface Block {
  blocked: boolean;
  /** Frase en español con perfil y regla. Vacía si no está bloqueado. */
  reason: string;
}

export interface QtyLimit {
  max: number;
  reason: string;
}

const FREE: Block = { blocked: false, reason: "" };

/** «Muchik Rumble 4 · Amateur»: competición y categoría del perfil. */
export const profileLabel = (p: Profile): string => `${p.comp} · ${p.cat}`;

const block = (reason: string): Block => ({ blocked: true, reason });

/** ¿El dato existe y es un número? (una especificación ausente no bloquea). */
const hasNumber = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "" && Number.isFinite(num(v));

/** ¿Toda la ranura está prohibida (turbina, encoders, IMU)? */
export function slotBlock(profile: Profile, slot: Slot): Block {
  const r = profile.rules,
    where = profileLabel(profile);
  if (slot.key === "turb" && !r.turbine) return block(`Turbina no permitida en ${where}`);
  if (slot.key === "enc" && !r.enc) return block(`Encoders no permitidos en ${where}`);
  if (slot.key === "imu" && !r.imu) return block(`IMU no permitida en ${where}`);
  return FREE;
}

/**
 * ¿Este ítem del catálogo está prohibido para este perfil en esta ranura?
 * `qty` es la cantidad que habría en la ranura (solo cuenta para los sensores de línea).
 */
export function itemBlock(profile: Profile, slot: Slot, item: Component, qty = 1): Block {
  const r = profile.rules,
    where = profileLabel(profile);
  switch (slot.key) {
    case "exp":
      return r.commercialPcb === false && item.specs.comercial === "Sí"
        ? block(`Placa de expansión comercial no permitida en ${where}`)
        : FREE;
    case "motor": {
      const family = item.specs.familia;
      return r.motorFam && family !== undefined && !motorFamilyAllowed(family, r.motorFam)
        ? block(`Motor ${String(family)} no permitido en ${where}: solo ${r.motorFam.join(", ")}`)
        : FREE;
    }
    case "mcu":
      return r.mcu && !mcuAllowed(item.name, r.mcu)
        ? block(`Microcontrolador no permitido en ${where}: solo ${r.mcu.join(", ")}`)
        : FREE;
    case "chasis": {
      const material = item.specs.material;
      if (r.chasisMat && material !== undefined && !chassisMaterialAllowed(material, r.chasisMat))
        return block(
          `Chasis de ${String(material)} no permitido en ${where}: solo ${r.chasisMat.join(" o ")}`,
        );
      const { ancho, largo } = item.specs;
      if (
        r.dim &&
        hasNumber(ancho) &&
        hasNumber(largo) &&
        !fitsDimensions(num(ancho), num(largo), r.dim)
      )
        return block(
          `Chasis de ${num(ancho)} × ${num(largo)} mm no permitido en ${where}: máximo ${r.dim[0]} × ${r.dim[1]} mm`,
        );
      return FREE;
    }
    case "linea": {
      const channels = item.specs.canales;
      if (!r.maxSensors || !hasNumber(channels)) return FREE;
      const total = num(channels) * Math.max(1, qty);
      return total > r.maxSensors
        ? block(`${total} sensores no permitidos en ${where}: máximo ${r.maxSensors}`)
        : FREE;
    }
    default:
      return FREE;
  }
}

/**
 * Tope de cantidad de la ranura, o null si no hay. Motores: `rules.motors`. Sensores de línea:
 * cuántos módulos del ítem elegido caben en `rules.maxSensors` (necesita `item`).
 */
export function qtyLimit(profile: Profile, slot: Slot, item?: Component): QtyLimit | null {
  const r = profile.rules,
    where = profileLabel(profile);
  if (slot.key === "motor" && r.motors)
    return { max: r.motors, reason: `Máximo ${r.motors} motores en ${where}` };
  if (slot.key === "linea" && r.maxSensors && item && hasNumber(item.specs.canales)) {
    const channels = num(item.specs.canales);
    if (channels > 0)
      return {
        max: Math.max(1, Math.floor(r.maxSensors / channels)),
        reason: `Máximo ${r.maxSensors} sensores en ${where}`,
      };
  }
  return null;
}
