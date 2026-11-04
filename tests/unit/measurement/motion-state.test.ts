// Estado «caminando / quieto» del celular (HU-37, F1): función pura sobre lecturas del acelerómetro.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GRAVITY,
  motionState,
  NO_DATA_MS,
  STEP_THRESHOLD,
  type MotionSample,
} from "@/domain/measurement/phone";

/** Lecturas cada `dt` ms entre `from` y `to`, con |a| − g = f(t en segundos). */
function samples(from: number, to: number, f: (sec: number) => number, dt = 20): MotionSample[] {
  const out: MotionSample[] = [];
  for (let t = from; t <= to; t += dt) out.push({ t, acc: [0, 0, GRAVITY + f((t - from) / 1000)] });
  return out;
}

describe("motionState", () => {
  it("sin lecturas: no hay datos", () => {
    expect(motionState([], 1000)).toBe("no_data");
  });

  it("celular quieto sobre la mesa (ruido mínimo): quieto", () => {
    const s = samples(0, 3000, (x) => 0.03 * Math.sin(x * 50));
    expect(motionState(s, 3000)).toBe("still");
  });

  it("caminata a ~1,8 pasos por segundo: caminando", () => {
    const s = samples(0, 3000, (x) => 3 * Math.sin(2 * Math.PI * 1.8 * x));
    expect(motionState(s, 3000)).toBe("walking");
  });

  it("sacudida fuerte: se considera movimiento (caminando)", () => {
    const s = samples(0, 1500, (x) => (Math.round(x * 20) % 2 ? 2 : -2), 50);
    expect(motionState(s, 1500)).toBe("walking");
  });

  it("movimiento suave sin paso pero con variación sostenida: caminando", () => {
    // pico de 1,0 (bajo el umbral de paso) pero con desviación mayor a 0,6
    const s = samples(0, 1500, (x) => (Math.round(x * 25) % 2 ? 1 : -1), 40);
    expect(motionState(s, 1500)).toBe("walking");
  });

  it("un balanceo leve (menos de la desviación mínima) sigue siendo quieto", () => {
    const s = samples(0, 3000, (x) => 0.3 * Math.sin(2 * Math.PI * 2 * x));
    expect(motionState(s, 3000)).toBe("still");
  });

  it("al dejar de caminar pasa a quieto cuando el último paso queda atrás (más de 1,5 s)", () => {
    const walk = samples(0, 2000, (x) => 3 * Math.sin(2 * Math.PI * 1.8 * x));
    const rest = samples(2020, 5000, () => 0.02);
    expect(motionState([...walk, ...rest.filter((r) => r.t <= 2500)], 2500)).toBe("walking");
    expect(motionState([...walk, ...rest], 5000)).toBe("still");
  });

  it("sin lecturas por más de 3 s: sin datos; justo antes, todavía quieto", () => {
    const s = samples(0, 1000, () => 0.01);
    expect(motionState(s, 1000 + NO_DATA_MS)).toBe("still");
    expect(motionState(s, 1000 + NO_DATA_MS + 1)).toBe("no_data");
  });

  it("usa el umbral de pasos calibrado si se pasa", () => {
    const s = samples(0, 3000, (x) => 1.6 * Math.sin(2 * Math.PI * 1.5 * x));
    // un umbral alto no cuenta pasos, pero la variación sostenida igual lo marca en movimiento
    expect(motionState(s, 3000, STEP_THRESHOLD * 3)).toBe("walking");
    expect(motionState(s, 3000, STEP_THRESHOLD)).toBe("walking");
  });
});

describe("estilos del chip de movimiento", () => {
  it("usa solo tokens de la paleta y nunca --dim para el texto", () => {
    const css = readFileSync(resolve(__dirname, "../../../src/celular/phone.css"), "utf8");
    const rules = [...css.matchAll(/(\.motion[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThanOrEqual(4);
    for (const [, sel, body] of rules) {
      expect(body, sel).not.toContain("--dim");
      expect(body, sel).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});
