// Tipos de vueltas y corridas (HU-19, HU-20), del prototipo (Protoripo.html).
import type { Segment } from "@/domain/simulator";

/** Una vuelta completada o no, con sus tramos y sectores. */
export interface Vuelta {
  n: number;
  t: number;
  iae: number;
  ctrl: string;
  p: Record<string, number>;
  vbat: number;
  segs: Segment[];
  sec: number[];
  /** Color de cada sector respecto a la mejor marca ("purple" | "green" | "yellow"). */
  col: string[];
  fin: boolean;
  lost: number;
  src: string;
  why: string;
  robot: string;
}

/** Una corrida registrada: vuelta con su métrica J y la versión del robot (HU-20). */
export interface Corrida {
  /** ID persistido; ausente en fixtures locales. */
  id?: number;
  n: number;
  robot: string;
  ver: string;
  ctrl: string;
  p: Record<string, number>;
  t: number | null;
  fin: boolean;
  iae: number;
  vbat: number;
  sec: number[];
  src: string;
  note: string;
  /** J = tiempo + 2 × error acumulado; 120 si no termina. */
  J: number;
}
