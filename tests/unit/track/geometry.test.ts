import { describe, expect, it } from "vitest";
import { analyze } from "@/domain/track/rules";
import { build, crossings, edgesOf } from "@/domain/track/geometry";
import { EXAMPLE_EIGHT, EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import type { Track } from "@/domain/track/types";
import { FREE_TRAINING, LGR_2026 } from "./fixtures";

// Valores de referencia: se obtuvieron ejecutando `Track2` del prototipo sin modificarlo.
describe("geometría: valores de referencia del prototipo", () => {
  it("«Técnica 3 × 2,5» mide 833,448 cm", () => {
    const a = analyze(EXAMPLE_TECHNIQUE, LGR_2026);
    expect(a.g.L).toBeCloseTo(833.448, 3);
    expect(EXAMPLE_TECHNIQUE.points).toHaveLength(12);
    expect(a.g.arcs).toHaveLength(8);
    expect(a.g.corners).toHaveLength(4);
    expect(a.g.gaps).toHaveLength(0);
    expect(a.cross).toHaveLength(0);
    expect(a.issues).toHaveLength(0);
    expect(a.stats.sepMin).toBeCloseTo(30, 1);
    expect(a.stats.edgeMin).toBeCloseTo(45, 1);
    expect(a.stats.radiusMin).toBeCloseTo(15, 1);
    expect(a.stats.straight.L).toBeCloseTo(130, 1);
  });

  it("«Ocho libre» mide 715,617 cm y cumple su perfil", () => {
    const a = analyze(EXAMPLE_EIGHT, FREE_TRAINING);
    expect(a.g.L).toBeCloseTo(715.617, 3);
    expect(a.g.arcs).toHaveLength(5);
    expect(a.g.corners).toHaveLength(1);
    expect(a.g.gaps).toHaveLength(1);
    expect(a.cross).toHaveLength(1);
    expect(a.issues).toHaveLength(0);
    expect(a.stats.sepMin).toBeCloseTo(12.5, 1);
    expect(a.stats.edgeMin).toBeCloseTo(40, 1);
    expect(a.stats.radiusMin).toBeCloseTo(30, 1);
    expect(a.stats.straight.L).toBeCloseTo(160, 1);
  });

  it("«Ocho libre» bajo Let's Go tiene 2 incidencias: cruce y corte", () => {
    const a = analyze(EXAMPLE_EIGHT, LGR_2026);
    expect(a.issues.map((i) => [i.sev, i.kind])).toEqual([
      ["error", "cruce"],
      ["error", "corte"],
    ]);
  });

  it("«Técnica» también cumple el perfil de entrenamiento libre", () => {
    expect(analyze(EXAMPLE_TECHNIQUE, FREE_TRAINING).issues).toHaveLength(0);
  });
});

describe("geometría: casos básicos", () => {
  const open = (points: [number, number, number?][], closed = false): Track => ({
    id: null,
    name: "t",
    board: { widthCm: 300, heightCm: 250 },
    closed,
    points: points.map(([x, y, radius = 0]) => ({ x, y, radius, gap: false })),
    zones: [],
    start: { edge: 0, t: 0.5 },
    profileId: null,
  });

  it("una recta mide lo que mide el segmento", () => {
    expect(build(open([[0, 0], [100, 0]])).L).toBeCloseTo(100, 3);
  });

  it("una esquina viva no acorta la línea", () => {
    expect(build(open([[0, 0], [100, 0], [100, 50]])).L).toBeCloseTo(150, 2);
  });

  it("una curva con radio acorta la línea respecto a la esquina viva", () => {
    const L = build(open([[0, 0], [100, 0, 20], [100, 50]])).L;
    expect(L).toBeLessThan(150);
    expect(L).toBeGreaterThan(130);
  });

  it("con menos de 3 puntos `closed` se ignora (igual que el prototipo)", () => {
    const g = build(open([[0, 0], [100, 0]], true));
    expect(g.closed).toBe(false);
    expect(edgesOf({ points: g.pts.length ? open([[0, 0], [100, 0]]).points : [], closed: false })).toHaveLength(1);
  });

  it("detecta el cruce de un ocho", () => {
    const g = build(EXAMPLE_EIGHT);
    expect(crossings(g.pts, g.closed)).toHaveLength(1);
  });

  it("reduce el radio cuando no cabe entre vecinos", () => {
    const g = build(open([[0, 0], [50, 0, 40], [50, 10, 40], [100, 10]]));
    expect(g.V[1].fit).toBeLessThan(1);
  });
});
