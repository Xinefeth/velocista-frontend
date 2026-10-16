// Deriva la vista de la regleta (HU-15) a partir del último mensaje `senales` de /ws/consola.
// Fuente: canal `regleta` (16 lecturas) del grupo `senales`.
// Es lógica pura, sin React, para poder probarla y para que Regleta() la use con respaldo
// a la simulación cuando aún no hay datos reales.
import type { Senales } from "@/infrastructure/contracts/contract";
import type { MensajeConsola } from "@/infrastructure/contracts/messages";
import { clamp } from "@/domain/format";

/** Canales que declara la regleta (2 × QTR-8A). */
export const STRIP_CHANNELS = 16;

/**
 * Fondo de escala de una lectura de canal. El robot falso emite 0..1000 y el QTR-8A
 * analógico entrega 0..1023; normalizamos con este valor y recortamos a 0..1.
 */
export const STRIP_FULL_SCALE = 1000;

/** Una barra cuenta como "sobre la línea" cuando su lectura normalizada supera esto. */
export const ACTIVE_THRESHOLD = 0.5;

/** Si ninguna barra supera esto, se considera que la línea está perdida. */
export const LOST_THRESHOLD = 0.15;

/** Posición de la barra extrema respecto al centro, en mm (canal 0 = −72, canal 15 = +72). */
export const STRIP_HALF_MM = 72;

/** La línea está centrada mientras su posición normalizada no pase de esto. */
export const CENTERED_NORM = 0.25;

export interface StripView {
  /** 16 lecturas normalizadas a 0..1 (altura de cada barra). */
  bars: number[];
  /** Dígito 0..9 que se muestra bajo cada barra. */
  digits: number[];
  /** Posición de la línea respecto al centro, normalizada a −1..1 (+ = derecha). 0 si perdida. */
  positionNorm: number;
  /** Posición de la línea en mm (positionNorm × STRIP_HALF_MM). */
  positionMm: number;
  /** Error de seguimiento derivado de la posición normalizada. */
  error: number;
  /** ¿La línea está centrada? (falso si está perdida). */
  centered: boolean;
  /** ¿Se perdió la línea (ninguna barra supera el umbral)? */
  lost: boolean;
  /** Cuántas barras superan el umbral ("sobre la línea"). */
  active: number;
}

/** Último mensaje `senales` del velocista (los mensajes llegan con el más nuevo primero). */
export function latestSignals(messages: MensajeConsola[]): Senales | null {
  for (const message of messages) {
    if (message.sender === "robot" && message.type === "signals") {
      return message.data as unknown as Senales;
    }
  }
  return null;
}

/** Normaliza las 16 lecturas crudas de la regleta a 0..1. */
function normalizeReadings(readings: number[]): number[] {
  return Array.from({ length: STRIP_CHANNELS }, (_, i) =>
    clamp(readings[i] / STRIP_FULL_SCALE, 0, 1),
  );
}

/**
 * Arma la vista de la regleta desde los canales de un `senales`.
 * Devuelve null si el mensaje no trae un canal `regleta` con las 16 lecturas.
 */
export function stripFromSignals(signals: Senales | null): StripView | null {
  // La clave de canal `regleta` la define el firmware; se migrará con él (a `line_array`).
  const readings = signals?.channels?.regleta;
  if (
    !Array.isArray(readings) ||
    readings.length !== STRIP_CHANNELS ||
    !readings.every((value) => typeof value === "number" && Number.isFinite(value))
  )
    return null;

  const bars = normalizeReadings(readings as number[]);
  const digits = bars.map((v) => Math.round(v * 9));
  const active = bars.filter((v) => v >= ACTIVE_THRESHOLD).length;
  const peak = Math.max(...bars);
  const lost = peak < LOST_THRESHOLD;

  // Posición de la línea = centroide ponderado de las 16 lecturas (canal 0..15),
  // llevado a −1..1 respecto al centro (7.5).
  let positionNorm = 0;
  if (!lost) {
    const sum = bars.reduce((a, v) => a + v, 0);
    const weighted = bars.reduce((a, v, i) => a + v * i, 0);
    const centroid = sum > 0 ? weighted / sum : (STRIP_CHANNELS - 1) / 2;
    positionNorm = clamp((centroid - (STRIP_CHANNELS - 1) / 2) / ((STRIP_CHANNELS - 1) / 2), -1, 1);
  }

  return {
    bars,
    digits,
    positionNorm,
    positionMm: positionNorm * STRIP_HALF_MM,
    error: positionNorm,
    centered: !lost && Math.abs(positionNorm) < CENTERED_NORM,
    lost,
    active,
  };
}

/** Vista de la regleta desde los mensajes de /ws/consola, o null si no hay `senales` útil. */
export function stripFromMessages(messages: MensajeConsola[]): StripView | null {
  return stripFromSignals(latestSignals(messages));
}
