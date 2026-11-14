// Giros casi rectos (ángulo interior > 165°) no cuentan como esquina al armar lados y ángulos; los
// avisos del servidor cuando el giroscopio parece mal calibrado; y el aviso de esquinas de más.
import { describe, expect, it } from "vitest";
import {
  closeRadius,
  dropFlatCorners,
  FLAT_TURN_DEG,
  liveView,
} from "@/domain/measurement/liveCorners";
import { extraMarksWarning } from "@/domain/measurement/guidedPlan";
import { warningText, withoutSuperseded } from "@/domain/measurement/labels";
import { visibleWarnings } from "@/domain/measurement/gpsFit";

const P = (x: number, y: number) => ({ x, y });
const deg = (d: number) => (d * Math.PI) / 180;

describe("dropFlatCorners", () => {
  it("quita el vértice casi recto de un lado (E 177,6°) y deja las 4 esquinas", () => {
    // rectángulo 20 × 10 con un vértice de más en el lado de abajo, con un giro de 2,4°
    const ring = [P(0, 0), P(10, 0), P(20, 0.42), P(20.4, 10), P(0, 10)];
    expect(dropFlatCorners(ring)).toHaveLength(4);
  });
  it("conserva un ángulo reflejo real (una L) y las esquinas de 90°", () => {
    const L = [P(0, 0), P(12, 0), P(12, 4), P(4, 4), P(4, 10), P(0, 10)];
    expect(dropFlatCorners(L)).toEqual(L);
  });
  it("conserva el primer vértice aunque sea casi recto", () => {
    const ring = [P(0, 0), P(10, 0.2), P(20, 0), P(10, 10)];
    expect(dropFlatCorners(ring)[0]).toEqual(P(0, 0));
  });
  it("el umbral es de 15° de giro (ángulo interior de 165°)", () => {
    expect(FLAT_TURN_DEG).toBe(15);
    const turn = (d: number) => [
      P(0, 0),
      P(10, 0),
      P(10 + 10 * Math.cos(deg(d)), 10 * Math.sin(deg(d))),
      P(0, 20),
    ];
    expect(dropFlatCorners(turn(14))).toHaveLength(3);
    expect(dropFlatCorners(turn(16))).toHaveLength(4);
  });
  it("nunca baja de un triángulo", () => {
    expect(dropFlatCorners([P(0, 0), P(10, 0), P(20, 0.1)]).length).toBe(3);
  });
});

describe("liveView con una esquina casi recta marcada de más", () => {
  // A (0,0) → B (10,0) → C (20,0.5): C es casi recta → D (20,10)
  const corners = [P(10, 0), P(20, 0.5), P(20, 10)];
  const walked = [10, 10.01, 9.5];
  it("une los lados de la esquina casi recta y no la cuenta (camino abierto)", () => {
    const v = liveView(P(0, 0), corners, P(8, 10), { walked, currentWalked: 12 });
    expect(v.sides).toHaveLength(2); // A→C (10 + 10,01) y C→D (9,5)
    expect(v.sides[0].length).toBeCloseTo(20.01, 6);
    expect(v.angles.map((a) => a.name)).toEqual(["B", "C"]); // B (la esquina real) y C (la actual)
    expect(v.angles[0].deg).toBeGreaterThan(80);
    expect(v.angles[0].deg).toBeLessThan(100);
  });
  it("un camino con solo esquinas reales queda igual que antes", () => {
    const v = liveView(P(0, 0), [P(10, 0), P(10, 6)], P(0, 5), {
      walked: [10, 6],
      currentWalked: 10,
    });
    expect(v.sides.map((s) => s.length)).toEqual([10, 6]);
    expect(v.angles).toHaveLength(2);
  });
  it("cerrado: el rectángulo con un vértice de más sigue siendo de 4 lados", () => {
    const v = liveView(P(0, 0), [P(10, 0), P(20, 0.4), P(20, 10), P(0, 10)], P(0.5, 0.5), {
      walked: [10, 10.01, 9.6, 20],
      closeWithin: closeRadius(1),
    });
    expect(v.closed).toBe(true);
    expect(v.sides).toHaveLength(4);
    expect(v.angles).toHaveLength(4);
    expect(v.sides[0].length).toBeCloseTo(20.01, 6);
  });
  it("una esquina recién marcada (lado siguiente corto) todavía no se descarta", () => {
    const v = liveView(P(0, 0), [P(10, 0), P(10.1, 0.3)], P(10.1, 0.3), {
      walked: [10, 0.3],
      currentWalked: 0,
    });
    expect(v.sides).toHaveLength(2);
  });
});

describe("avisos del giroscopio y esquinas de más", () => {
  it("«giroscopio mal calibrado» reemplaza a «no volviste a mirar hacia donde empezaste»", () => {
    expect(withoutSuperseded(["end_heading_unknown", "gyro_calibration_suspect"])).toEqual([
      "gyro_calibration_suspect",
    ]);
    expect(withoutSuperseded(["end_heading_unknown"])).toEqual(["end_heading_unknown"]);
    expect(visibleWarnings(["end_heading_unknown", "gyro_calibration_suspect"], null)).toEqual([
      "gyro_calibration_suspect",
    ]);
    expect(warningText("gyro_calibration_suspect")).toBe(
      "El giroscopio parece mal calibrado: recalibra y repite.",
    );
  });
  it("avisa cuando hay más esquinas marcadas que vértices en el plano", () => {
    const plan = { points: [P(0, 0), P(8, 0), P(8, 6), P(0, 6)] };
    expect(extraMarksWarning(plan, 4)).toBeNull();
    expect(extraMarksWarning(plan, 6)).toBe(
      "Marcaste 6 esquinas; el plano tiene 4. Sobran 2: revisa los giros.",
    );
  });
});
