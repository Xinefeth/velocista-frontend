import { describe, expect, it } from "vitest";
import { areaUnavailableReason, measures, polygonArea } from "@/domain/track/measures";
import { blankTrack } from "@/domain/track/commands";
import { EXAMPLE_EIGHT, EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import type { Track } from "@/domain/track/types";

const shape = (points: [number, number, number?][], closed = true): Track => ({
  ...blankTrack(),
  board: { widthCm: 600, heightCm: 600 },
  closed,
  points: points.map(([x, y, radius = 0]) => ({ x, y, radius, gap: false })),
});

describe("fórmula de Gauss", () => {
  it("área de un cuadrado y signo según el sentido", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea([...sq].reverse())).toBe(-100);
  });

  it("un triángulo y un polígono degenerado", () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 3 },
      ]),
    ).toBe(6);
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
      ]),
    ).toBe(0);
    expect(polygonArea([])).toBe(0);
  });
});

describe("largo, perímetro y área de figuras conocidas", () => {
  it("cuadrado de 200 cm: perímetro 800 cm y área 40 000 cm²", () => {
    const m = measures(
      shape([
        [100, 100],
        [300, 100],
        [300, 300],
        [100, 300],
      ]),
    );
    expect(m.lengthCm).toBe(800);
    expect(m.perimeterCm).toBe(800);
    expect(m.areaCm2).toBe(40000);
  });

  it("rectángulo de 200 × 100: perímetro 600 cm y área 20 000 cm²", () => {
    const m = measures(
      shape([
        [50, 50],
        [250, 50],
        [250, 150],
        [50, 150],
      ]),
    );
    expect(m.perimeterCm).toBe(600);
    expect(m.areaCm2).toBe(20000);
  });

  it("la dirección del recorrido no cambia el área", () => {
    const m = measures(
      shape([
        [50, 150],
        [250, 150],
        [250, 50],
        [50, 50],
      ]),
    );
    expect(m.areaCm2).toBe(20000);
  });

  it("círculo aproximado (cuadrado de 200 con radio 100): π·r² y 2·π·r con tolerancia", () => {
    const m = measures(
      shape([
        [100, 100, 100],
        [300, 100, 100],
        [300, 300, 100],
        [100, 300, 100],
      ]),
    );
    expect(m.perimeterCm!).toBeGreaterThan(2 * Math.PI * 100 * 0.995);
    expect(m.perimeterCm!).toBeLessThan(2 * Math.PI * 100 * 1.005);
    expect(m.areaCm2!).toBeGreaterThan(Math.PI * 100 * 100 * 0.995);
    expect(m.areaCm2!).toBeLessThan(Math.PI * 100 * 100 * 1.005);
  });

  it("figura en L cóncava: área 30 000 cm² y perímetro 800 cm", () => {
    const m = measures(
      shape([
        [0, 0],
        [200, 0],
        [200, 100],
        [100, 100],
        [100, 200],
        [0, 200],
      ]),
    );
    expect(m.perimeterCm).toBe(800);
    expect(m.areaCm2).toBe(30000);
  });

  it("figura en U cóncava: el área resta el hueco", () => {
    // 300 × 200 menos un hueco de 100 × 100 desde arriba.
    const m = measures(
      shape([
        [0, 0],
        [300, 0],
        [300, 200],
        [200, 200],
        [200, 100],
        [100, 100],
        [100, 200],
        [0, 200],
      ]),
    );
    expect(m.areaCm2).toBe(300 * 200 - 100 * 100);
  });

  it("«Técnica 3 × 2,5» es cerrada y sin cruces: tiene perímetro igual al largo y un área razonable", () => {
    const m = measures(EXAMPLE_TECHNIQUE);
    expect(m.lengthCm).toBeCloseTo(833.45, 2);
    expect(m.perimeterCm).toBe(m.lengthCm);
    expect(m.areaCm2!).toBeGreaterThan(0);
    // El contorno cabe en el rectángulo de 200 × 160 de la pista.
    expect(m.areaCm2!).toBeLessThan(200 * 160);
  });

  it("«Ocho libre» tiene un cruce: perímetro sí, área nula", () => {
    const m = measures(EXAMPLE_EIGHT);
    expect(m.lengthCm).toBeCloseTo(715.62, 2);
    expect(m.perimeterCm).toBe(m.lengthCm);
    expect(m.areaCm2).toBeNull();
    expect(areaUnavailableReason(EXAMPLE_EIGHT)).toMatch(/se cruza/);
  });

  it("una pista abierta no tiene perímetro ni área", () => {
    const m = measures(
      shape(
        [
          [50, 50],
          [250, 50],
          [250, 150],
          [50, 150],
        ],
        false,
      ),
    );
    expect(m.lengthCm).toBe(500);
    expect(m.perimeterCm).toBeNull();
    expect(m.areaCm2).toBeNull();
    expect(
      areaUnavailableReason(
        shape(
          [
            [50, 50],
            [250, 50],
          ],
          false,
        ),
      ),
    ).toMatch(/abierta/);
  });

  it("un circuito «cerrado» con 2 puntos cuenta como abierto", () => {
    const m = measures(
      shape(
        [
          [50, 50],
          [250, 50],
        ],
        true,
      ),
    );
    expect(m.perimeterCm).toBeNull();
    expect(m.areaCm2).toBeNull();
  });

  it("una pista vacía mide cero y no tiene área", () => {
    expect(measures(blankTrack())).toEqual({ lengthCm: 0, perimeterCm: null, areaCm2: null });
  });

  it("si el área se calcula, no hay razón para explicar su ausencia", () => {
    expect(
      areaUnavailableReason(
        shape([
          [0, 0],
          [200, 0],
          [200, 100],
          [0, 100],
        ]),
      ),
    ).toBeNull();
  });

  it("los valores van redondeados a 0,01", () => {
    const m = measures(EXAMPLE_TECHNIQUE);
    expect(Math.round(m.areaCm2! * 100) / 100).toBe(m.areaCm2);
    expect(Math.round(m.lengthCm * 100) / 100).toBe(m.lengthCm);
  });
});
