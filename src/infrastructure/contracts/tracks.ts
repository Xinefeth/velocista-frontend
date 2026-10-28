// Tipos del cable para pistas y perfiles de pista (EN-28). Claves en inglés y snake_case,
// según el contrato fijo con el backend (velocista-backend: en-28-tracks-api). Unidades: cm.

export interface TrackPointApi {
  x: number;
  y: number;
  radius: number;
  gap: boolean;
}

export interface TrackZoneApi {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}

/** Recurso `Track` de GET /api/tracks/{id}. */
export interface TrackApi {
  id: number;
  name: string;
  board: { width_cm: number; height_cm: number };
  closed: boolean;
  points: TrackPointApi[];
  zones: TrackZoneApi[];
  start: { edge: number; t: number };
  profile_id: string | null;
  length_cm: number;
  created_at: string;
  updated_at: string;
}

/** Cuerpo de POST/PUT: el backend ignora `id`, `created_at` y `updated_at`, así que no se envían. */
export type TrackBodyApi = Omit<TrackApi, "id" | "created_at" | "updated_at">;

export interface TrackPageApi {
  items: TrackApi[];
  total: number;
  limit: number;
  offset: number;
}

export interface RuleSettingApi {
  enabled: boolean;
  value: number | boolean;
}

/** Bloque `rules.track` de un perfil (longitudes en cm, `angle_min` en grados, `line_width_mm` en mm). */
export interface TrackRulesApi {
  line_width_mm: number;
  gap_length_cm: number;
  radius_min: RuleSettingApi;
  angle_min: RuleSettingApi;
  no_sharp: RuleSettingApi;
  separation_min: RuleSettingApi;
  margin: RuleSettingApi;
  zone_distance: RuleSettingApi;
  closed: RuleSettingApi;
  length_min: RuleSettingApi;
  length_max: RuleSettingApi;
  straight_min: RuleSettingApi;
  straight_max: RuleSettingApi;
  cross_max: RuleSettingApi;
  gap_max: RuleSettingApi;
}

/** Perfil de GET /api/profiles (lista simple, sin paginar). `rules.track` solo existe en lgr2026 y libre. */
export interface ProfileApi {
  id: string;
  competition: string;
  label: string;
  category: string;
  rules: { track?: TrackRulesApi } & Record<string, unknown>;
}
