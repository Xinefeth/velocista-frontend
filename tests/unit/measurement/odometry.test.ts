import { describe, expect, it } from "vitest";
import {
  closureSegment,
  compareWithPlan,
  planOf,
  recommendations,
  referencePoints,
  tapeSideOf,
  type PlaceForm,
} from "@/domain/measurement/odometry";
import { area, perimeter } from "@/domain/measurement/plot";
import { measurement, result } from "../../black-box/measurement/_api";

const form = (o: Partial<PlaceForm> = {}): PlaceForm => ({
  contour: "aula",
  name: "",
  length: "10",
  width: "6",
  scaleN: "50",
  tapeSide: "",
  ...o,
});

describe("plano del lugar", () => {
  it("los lugares conocidos traen su plano (patio en L de 12 × 10)", () => {
    const p = planOf(form({ contour: "patio" }));
    if (typeof p === "string") throw new Error(p);
    expect(area(p.plan!)).toBe(4 * 12 + 6 * 5);
  });

  it("un dibujo a escala 1:50 de 16 × 12 cm es un lugar de 8 × 6 m", () => {
    const p = planOf(form({ contour: "escala", length: "16", width: "12", scaleN: "50" }));
    if (typeof p === "string") throw new Error(p);
    expect(perimeter(p.plan!)).toBeCloseTo(28);
    expect(p.name).toBe("Plano 1:50");
  });

  it("«otro» necesita nombre; largo y ancho son opcionales pero válidos", () => {
    expect(planOf(form({ contour: "otro" }))).toMatch(/nombre/);
    expect(planOf(form({ contour: "otro", name: "Casa", length: "", width: "" }))).toEqual({
      plan: null,
      name: "Casa",
    });
    expect(planOf(form({ contour: "otro", name: "Casa", length: "-3" }))).toMatch(/mayores que 0/);
  });

  it("lado con cinta opcional, positivo y con coma decimal", () => {
    expect(tapeSideOf(form())).toBeNull();
    expect(tapeSideOf(form({ tapeSide: "8,5" }))).toBe(8.5);
    expect(tapeSideOf(form({ tapeSide: "x" }))).toMatch(/mayor que 0/);
  });
});

describe("comparación con el plano", () => {
  it("usa la comparación del backend si el celular mandó el plano", () => {
    const d = compareWithPlan(measurement(1), null)!;
    expect(d.planPerimeter).toBe(32);
    expect(d.perimeterPct).toBeCloseTo(((31.5 - 32) / 32) * 100);
  });

  it("si no, compara con el plano elegido en la consola (corregido o crudo)", () => {
    const m = measurement(1, {
      reference: null,
      result: result({ reference_perimeter_m: null, reference_area_m2: null }),
    });
    const plan = planOf(form()) as { plan: { x: number; y: number }[] };
    expect(compareWithPlan(m, plan.plan)!.planArea).toBe(48);
    expect(compareWithPlan(m, plan.plan, false)!.perimeterPct).toBeCloseTo(
      ((31.9 - 28) / 28) * 100,
    );
    expect(compareWithPlan(m, null)).toBeNull();
  });

  it("el plano del backend se dibuja a tamaño real (× escala)", () => {
    const m = measurement(1, {
      reference: { points: [{ x: 1, y: 2 }], scale_n: 100, name: "" },
    });
    expect(referencePoints(m, null)).toEqual([{ x: 100, y: 200 }]);
  });
});

describe("recomendaciones", () => {
  it("medición verde y calibrada: lista para el informe", () => {
    expect(recommendations(measurement(1)).map((a) => a.tone)).toEqual(["ok"]);
  });

  it("roja, sin calibrar y con aviso del backend: lo dice todo", () => {
    const m = measurement(1, {
      calibration: { ...measurement(1).calibration, gyro_calibrated: false },
      result: result({
        closure_error_pct: 9,
        quality: "red",
        warnings: ["end_heading_unknown"],
        corners: 1,
      }),
    });
    const titles = recommendations(m).map((a) => a.title);
    expect(titles[0]).toMatch(/no volviste a mirar/);
    expect(titles).toContain("Calibra el giroscopio");
    expect(titles).toContain("Marca cada esquina");
    expect(recommendations(m).some((a) => a.tone === "bad")).toBe(true);
  });

  it("el error de cierre une el final con el inicio", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 5, y: 1 };
    expect(closureSegment([a, b])).toEqual([b, a]);
    expect(closureSegment([])).toEqual([]);
  });
});
