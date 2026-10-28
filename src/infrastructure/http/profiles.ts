// Perfiles de reglamento de la API (GET /profiles) vistos como perfiles de pista (EN-28).
// Solo lgr2026 y libre traen `rules.track`; los demás (club, mr4a, mr4s, mr4m) se devuelven sin reglas
// de pista para que la interfaz los muestre como no disponibles. No hay perfiles de respaldo.
import type { TrackProfile, TrackRuleId, TrackRules } from "@/domain/track/types";
import type { ProfileApi } from "@/infrastructure/contracts/tracks";
import { request } from "@/infrastructure/http/api";

const RULE_IDS: TrackRuleId[] = [
  "radius_min",
  "angle_min",
  "no_sharp",
  "separation_min",
  "margin",
  "zone_distance",
  "closed",
  "length_min",
  "length_max",
  "straight_min",
  "straight_max",
  "cross_max",
  "gap_max",
];

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Traduce el bloque `rules.track`. Devuelve `null` si falta o está incompleto (13 reglas
 * `{enabled, value}` más `line_width_mm` y `gap_length_cm`), para no verificar con datos a medias.
 */
export function parseTrackRules(raw: unknown): TrackRules | null {
  if (!isObject(raw)) return null;
  const lineWidthMm = raw.line_width_mm;
  const gapLengthCm = raw.gap_length_cm;
  if (typeof lineWidthMm !== "number" || typeof gapLengthCm !== "number") return null;
  const rules = {} as TrackRules["rules"];
  for (const id of RULE_IDS) {
    const rule = raw[id];
    if (!isObject(rule) || typeof rule.enabled !== "boolean") return null;
    if (typeof rule.value !== "number" && typeof rule.value !== "boolean") return null;
    rules[id] = { enabled: rule.enabled, value: rule.value };
  }
  return { lineWidthMm, gapLengthCm, rules };
}

/** Convierte un perfil de la API; el nombre visible es su `label`. */
export function toTrackProfile(p: ProfileApi): TrackProfile {
  return { id: p.id, name: p.label || p.id, rules: parseTrackRules(p.rules?.track) };
}

export const profilesApi = {
  /** Lista todos los perfiles (la API los devuelve como lista simple, sin paginar). */
  async list(): Promise<TrackProfile[]> {
    return (await request<ProfileApi[]>("/profiles")).map(toTrackProfile);
  },
};
