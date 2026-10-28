// Reglas de los dos perfiles del prototipo, como pruebas (ya en cm y con los nombres del contrato).
// No son perfiles de producción: en la consola las reglas vienen de GET /api/profiles.
import type { TrackRuleId, TrackRules } from "@/domain/track/types";

type Rule = [boolean, number | boolean];

const make = (rules: Record<TrackRuleId, Rule>): TrackRules => ({
  lineWidthMm: 19,
  gapLengthCm: 2,
  rules: Object.fromEntries(
    Object.entries(rules).map(([id, [enabled, value]]) => [id, { enabled, value }]),
  ) as TrackRules["rules"],
});

/** «Let's Go Robot 2026» del prototipo (lengthMin 5 m y lengthMax 30 m pasan a 500 y 3000 cm). */
export const LGR_2026 = make({
  radius_min: [true, 15],
  angle_min: [true, 90],
  no_sharp: [false, true],
  separation_min: [true, 30],
  margin: [true, 30],
  zone_distance: [true, 30],
  closed: [true, true],
  length_min: [false, 500],
  length_max: [false, 3000],
  straight_min: [false, 10],
  straight_max: [false, 200],
  cross_max: [true, 0],
  gap_max: [true, 0],
});

/** «Entrenamiento libre» del prototipo. */
export const FREE_TRAINING = make({
  radius_min: [true, 5],
  angle_min: [true, 30],
  no_sharp: [false, true],
  separation_min: [true, 12],
  margin: [true, 12],
  zone_distance: [true, 10],
  closed: [true, true],
  length_min: [false, 500],
  length_max: [false, 3000],
  straight_min: [false, 10],
  straight_max: [false, 200],
  cross_max: [false, 2],
  gap_max: [false, 4],
});

/** Reglas con todo desactivado: base para probar una regla a la vez. */
export const NO_RULES: TrackRules = make({
  radius_min: [false, 15],
  angle_min: [false, 90],
  no_sharp: [false, true],
  separation_min: [false, 30],
  margin: [false, 30],
  zone_distance: [false, 30],
  closed: [false, true],
  length_min: [false, 500],
  length_max: [false, 3000],
  straight_min: [false, 10],
  straight_max: [false, 200],
  cross_max: [false, 0],
  gap_max: [false, 0],
});

/** Copia de `base` con algunas reglas cambiadas. */
export function withRules(base: TrackRules, patch: Partial<Record<TrackRuleId, Rule>>): TrackRules {
  const rules = { ...base.rules };
  for (const [id, [enabled, value]] of Object.entries(patch) as [TrackRuleId, Rule][])
    rules[id] = { enabled, value };
  return { ...base, rules };
}
