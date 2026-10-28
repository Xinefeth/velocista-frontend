// Modelo de dominio del Trazador de pistas (EN-28). Sin dependencias fuera de domain/track.
// Unidades: centímetros; y hacia arriba; origen en la esquina inferior izquierda del tablero.

/** Vértice de control. `radius` 0 = esquina viva; `gap` marca un corte en el tramo que sale del punto. */
export interface TrackPoint {
  x: number;
  y: number;
  radius: number;
  gap: boolean;
}

/** Zona rectangular prohibida (postes, logos, rampas). */
export interface TrackZone {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}

/** Salida: tramo (índice de arista) y posición relativa 0..1. */
export interface TrackStart {
  edge: number;
  t: number;
}

export interface Track {
  /** Entero asignado por la API; `null` mientras la pista no se ha guardado. */
  id: number | null;
  name: string;
  board: { widthCm: number; heightCm: number };
  closed: boolean;
  points: TrackPoint[];
  zones: TrackZone[];
  start: TrackStart;
  profileId: string | null;
  /** Derivado de la geometría; se envía al guardar. */
  lengthCm?: number;
  /** Solo lectura, los pone la API (ISO 8601). */
  createdAt?: string;
  updatedAt?: string;
}

/** Reglas de pista (nombres del contrato). */
export type TrackRuleId =
  | "radius_min"
  | "angle_min"
  | "no_sharp"
  | "separation_min"
  | "margin"
  | "zone_distance"
  | "closed"
  | "length_min"
  | "length_max"
  | "straight_min"
  | "straight_max"
  | "cross_max"
  | "gap_max";

export interface RuleSetting {
  enabled: boolean;
  /** Número o booleano (`no_sharp`, `closed`). Longitudes en cm, `angle_min` en grados. */
  value: number | boolean;
}

export interface TrackRules {
  /** Ancho de la línea en milímetros. */
  lineWidthMm: number;
  /** Largo de un corte en cm. */
  gapLengthCm: number;
  rules: Record<TrackRuleId, RuleSetting>;
}

/** Perfil con reglas de pista (viene de la API, ver infrastructure/http/profiles.ts). */
export interface TrackProfile {
  id: string;
  name: string;
  /** `null` si el perfil no declara `rules.track` (club, mr4a, mr4s, mr4m). */
  rules: TrackRules | null;
}

export type IssueSeverity = "error" | "warn";

export type IssueKind =
  | "forma"
  | "ajuste"
  | "cerrado"
  | "borde"
  | "zona"
  | "separacion"
  | "radio"
  | "angulo"
  | "esquina"
  | "cruce"
  | "corte"
  | "recta"
  | "largo";

export interface IssueRef {
  v?: number;
  e?: number;
  z?: number;
}

export interface TrackIssue {
  sev: IssueSeverity;
  kind: IssueKind;
  msg: string;
  x: number | null;
  y: number | null;
  ref: IssueRef | null;
  /** Corrección de un clic para el aviso de ajuste de radio. */
  fix?: { v: number; r: number };
}

export interface SamplePoint {
  x: number;
  y: number;
  /** ¿Pertenece a un tramo recto? */
  st: boolean;
  /** Origen: `e<i>` arista, `v<i>` vértice. */
  src: string;
  /** Longitud de arco acumulada. */
  s: number;
}

export interface VertexInfo {
  turn: number;
  t: number;
  r: number;
  rEff: number;
  tEff: number;
  fit: number;
  bad: "dup" | "reversa" | null;
  d1: [number, number] | null;
  d2: [number, number] | null;
}

export interface Corner {
  v: number;
  x: number;
  y: number;
  /** Ángulo interior en grados. */
  a: number;
}

export interface GapInfo {
  e: number;
  x: number;
  y: number;
  room: number;
}

export interface Arc {
  v: number;
  cx: number;
  cy: number;
  r: number;
  a0: number;
  sw: number;
}

export interface Straight {
  e: number;
  a: { x: number; y: number };
  b: { x: number; y: number };
  L: number;
  i0: number;
  i1: number;
}

export interface Geometry {
  pts: SamplePoint[];
  V: VertexInfo[];
  E: [number, number][];
  corners: Corner[];
  gaps: GapInfo[];
  arcs: Arc[];
  straights: Straight[];
  /** Largo total de la línea en cm (con arcos). */
  L: number;
  closed: boolean;
}

export interface Crossing {
  x: number;
  y: number;
  i: number;
  j: number;
  ang: number;
}

export interface StraightRun {
  L: number;
  i0: number;
  i1: number;
  src: string;
  mx: number;
  my: number;
}

export interface TrackStats {
  length: number;
  straight: { L: number };
  sepMin: number;
  edgeMin: number;
  crossings: number;
  corners: number;
  curves: number;
  radiusMin: number;
  points: number;
  gaps: number;
}

export interface Analysis {
  g: Geometry;
  issues: TrackIssue[];
  stats: TrackStats;
  cross: Crossing[];
}

export const DEG = Math.PI / 180;
