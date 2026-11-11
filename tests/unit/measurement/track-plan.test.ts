// CU-1: lleva una pista del Trazador (cm del tablero) a tamaño real para usarla como plano.
import { describe, expect, it } from "vitest";
import { planOf, TRACK_PLAN_MISSING } from "@/domain/measurement/odometry";
import {
  drawnSides,
  EMPTY_PICK,
  isTrackPlanError,
  planOfPick,
  trackPlan,
  TRACK_PLAN_CROSSES,
  TRACK_PLAN_FEW_POINTS,
  TRACK_PLAN_OPEN,
  TRACK_PLAN_SCALE_ERROR,
  type TrackPlan,
} from "@/domain/measurement/trackPlan";
import { polygonDims } from "@/domain/measurement/dimensions";
import type { Track } from "@/domain/track/types";

type V = [number, number, number?];
const mk = (pts: V[], over: Partial<Track> = {}): Track => ({
  id: 1,
  name: "Aula",
  board: { widthCm: 300, heightCm: 250 },
  closed: true,
  points: pts.map(([x, y, radius = 0]) => ({ x, y, radius, gap: false })),
  zones: [],
  start: { edge: 0, t: 0.5 },
  profileId: null,
  ...over,
});
const rect = (r = 0) =>
  mk([
    [70, 65, r],
    [230, 65, r],
    [230, 185, r],
    [70, 185, r],
  ]);
const ok = (r: TrackPlan | { error: string }): TrackPlan => {
  if (isTrackPlanError(r)) throw new Error(r.error);
  return r;
};

describe("trackPlan: escala 1:N", () => {
  it("un rectángulo de 160 × 120 cm a 1:5 es de 8 × 6 m (28 m y 48 m²)", () => {
    const p = ok(trackPlan(rect(), { kind: "ratio", n: 5 }));
    expect(p.perimeter_m).toBeCloseTo(28, 6);
    expect(p.area_m2).toBeCloseTo(48, 6);
    expect(p.scaleN).toBeCloseTo(5, 9);
    expect(p.rounded).toBe(false);
    const d = polygonDims(p.corners)!;
    expect(d.sides.map((s) => s.length).sort((a, b) => a - b)).toEqual(
      [6, 6, 8, 8].map((v) => expect.closeTo(v, 6)),
    );
  });

  it("el primer vértice dibujado queda en el origen", () => {
    const p = ok(trackPlan(rect(), { kind: "ratio", n: 5 }));
    expect(p.corners[0]).toEqual({ x: 0, y: 0 });
    expect(p.contour[0]).toEqual({ x: 0, y: 0 });
  });

  it("con esquinas redondeadas (R15) el total sale del contorno, dentro de 0,5 % de la API", () => {
    const p = ok(trackPlan(rect(15), { kind: "ratio", n: 5 }));
    // contorno con arcos: 560 − (8 − 2π)·15 cm = 534,2 cm; área 19200 − (4 − π)·15² cm²
    const per = (560 - (8 - 2 * Math.PI) * 15) * 0.05;
    const ar = (19200 - (4 - Math.PI) * 225) * 0.0025;
    expect(Math.abs(p.perimeter_m - per) / per).toBeLessThan(0.005);
    expect(Math.abs(p.area_m2 - ar) / ar).toBeLessThan(0.005);
    expect(p.rounded).toBe(true);
    // los vértices dibujados siguen siendo el rectángulo esquina a esquina
    expect(polygonDims(p.corners)!.perimeter).toBeCloseTo(28, 6);
  });

  it("el contorno tiene una cantidad acotada de puntos", () => {
    expect(ok(trackPlan(rect(15), { kind: "ratio", n: 5 })).contour.length).toBeLessThan(200);
  });

  it("sirve para una L y una U", () => {
    const L = mk([
      [0, 0],
      [100, 0],
      [100, 40],
      [50, 40],
      [50, 100],
      [0, 100],
    ]);
    const pl = ok(trackPlan(L, { kind: "ratio", n: 10 }));
    expect(pl.corners).toHaveLength(6);
    expect(pl.area_m2).toBeCloseTo(((100 * 40 + 50 * 60) / 10000) * 100, 6);
    const U = mk([
      [0, 0],
      [30, 0],
      [30, 60],
      [60, 60],
      [60, 0],
      [90, 0],
      [90, 90],
      [0, 90],
    ]);
    const pu = ok(trackPlan(U, { kind: "ratio", n: 10 }));
    expect(pu.area_m2).toBeCloseTo(((90 * 90 - 30 * 60) / 10000) * 100, 6);
  });
});

describe("trackPlan: largo real de un lado", () => {
  it("el lado de 160 cm medido en 8 m da 1:5 y el mismo plano que la razón", () => {
    const a = ok(trackPlan(rect(), { kind: "side", index: 0, realM: 8 }));
    const b = ok(trackPlan(rect(), { kind: "ratio", n: 5 }));
    expect(a.scaleN).toBeCloseTo(5, 9);
    expect(a.perimeter_m).toBeCloseTo(b.perimeter_m, 9);
    expect(a.area_m2).toBeCloseTo(b.area_m2, 9);
  });

  it("con otro lado: el de 120 cm medido en 6 m también da 1:5", () => {
    expect(ok(trackPlan(rect(), { kind: "side", index: 1, realM: 6 })).scaleN).toBeCloseTo(5, 9);
  });

  it("drawnSides da nombres y largos dibujados", () => {
    const s = drawnSides(rect());
    expect(s.map((x) => x.name)).toEqual(["AB", "BC", "CD", "DA"]);
    expect(s.map((x) => x.lengthCm)).toEqual([160, 120, 160, 120]);
  });
});

describe("trackPlan: errores", () => {
  it("escalas inválidas", () => {
    for (const s of [
      { kind: "ratio", n: 0 },
      { kind: "ratio", n: -3 },
      { kind: "ratio", n: NaN },
      { kind: "side", index: 0, realM: 0 },
      { kind: "side", index: 0, realM: NaN },
      { kind: "side", index: 9, realM: 5 },
    ] as const)
      expect(trackPlan(rect(), s)).toEqual({ error: TRACK_PLAN_SCALE_ERROR });
  });

  it("pista abierta, con menos de 3 vértices o que se cruza", () => {
    expect(
      trackPlan(
        mk(
          [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
          { closed: false },
        ),
        { kind: "ratio", n: 1 },
      ),
    ).toEqual({ error: TRACK_PLAN_OPEN });
    expect(
      trackPlan(
        mk([
          [0, 0],
          [10, 0],
        ]),
        { kind: "ratio", n: 1 },
      ),
    ).toEqual({ error: TRACK_PLAN_FEW_POINTS });
    const bow = mk([
      [0, 0],
      [100, 100],
      [100, 0],
      [0, 100],
    ]);
    expect(trackPlan(bow, { kind: "ratio", n: 1 })).toEqual({ error: TRACK_PLAN_CROSSES });
  });
});

describe("planOfPick y planOf con «pista»", () => {
  const tracks = [rect()];
  it("sin pista elegida no hay plano", () => {
    expect(planOfPick(tracks, EMPTY_PICK)).toBeNull();
  });
  it("con pista y escala válidas da el plano; con la escala vacía, el error", () => {
    const good = planOfPick(tracks, { ...EMPTY_PICK, trackId: 1, n: "5" });
    expect(isTrackPlanError(good!)).toBe(false);
    expect(planOfPick(tracks, { ...EMPTY_PICK, trackId: 1, n: "" })).toEqual({
      error: TRACK_PLAN_SCALE_ERROR,
    });
    // lado más largo por defecto y coma decimal
    const side = planOfPick(tracks, { ...EMPTY_PICK, trackId: 1, mode: "side", realM: "8,0" });
    expect(ok(side as TrackPlan).scaleN).toBeCloseTo(5, 9);
  });
  it("planOf pide elegir una pista, o usa el plano elegido", () => {
    const form = {
      contour: "pista",
      name: "",
      length: "",
      width: "",
      scaleN: "",
      tapeSide: "",
    } as const;
    expect(planOf(form)).toBe(TRACK_PLAN_MISSING);
    const p = ok(trackPlan(rect(), { kind: "ratio", n: 5 }));
    expect(planOf(form, null, p)).toEqual({ plan: p.contour, name: "Aula" });
  });
});
