// Regla compartida «¿sirve el GPS aquí?» (SP-06, HU-37): movida al dominio para la consola y el celular.
import { describe, expect, it } from "vitest";
import {
  gpsFits,
  isPlausibleSize,
  MAX_PLAUSIBLE_MIN_SIDE_M,
  shortSide,
  smallField,
  TARGET_PCT,
  visibleWarnings,
} from "@/domain/measurement/gpsFit";

describe("gpsFits (movida a src/domain/measurement)", () => {
  it("sin mínimo no hay veredicto", () => {
    expect(gpsFits(10, null)).toBeNull();
  });
  it("lado vacío o cero pide escribirlo (aviso)", () => {
    expect(gpsFits(0, 30)?.tone).toBe("warn");
  });
  it("igual al mínimo sirve; menor no sirve, con el mínimo en el texto", () => {
    expect(gpsFits(30, 30)?.tone).toBe("good");
    expect(gpsFits(29.9, 30)?.tone).toBe("bad");
    expect((gpsFits(6, 30) as { sub: string }).sub).toContain("30");
  });
  it("el error aceptado es el del backend (10 %)", () => {
    expect(TARGET_PCT).toBe(10);
  });
});

describe("smallField (aviso al terminar)", () => {
  it("el lado corto menor que el mínimo avisa con ambos números", () => {
    expect(smallField(10, 30)).toEqual({ side: 10, minSide: 30 });
  });
  it("lado igual o mayor que el mínimo no avisa", () => {
    expect(smallField(30, 30)).toBeNull();
    expect(smallField(80, 30)).toBeNull();
  });
  it("sin mínimo o sin lado no avisa", () => {
    expect(smallField(10, null)).toBeNull();
    expect(smallField(null, 30)).toBeNull();
  });
  it("valores no creíbles (0, negativos, NaN, infinito, precisión absurda) no avisan", () => {
    for (const bad of [0, -5, Number.NaN, Infinity]) {
      expect(smallField(bad, 30), `lado ${bad}`).toBeNull();
      expect(smallField(10, bad), `mínimo ${bad}`).toBeNull();
    }
    // un mínimo de 2 838 m sale de una lectura suelta mala: no es un terreno posible
    expect(smallField(112.8, 2838.4)).toBeNull();
    expect(smallField(10, 100_000)).toBeNull();
  });
});

describe("tamaños creíbles", () => {
  it("creíble: número finito, mayor que 0 y hasta 500 m", () => {
    expect(MAX_PLAUSIBLE_MIN_SIDE_M).toBe(500);
    expect(isPlausibleSize(0.5)).toBe(true);
    expect(isPlausibleSize(500)).toBe(true);
    for (const bad of [0, -1, 500.1, 2838.4, Number.NaN, Infinity, null, undefined])
      expect(isPlausibleSize(bad), String(bad)).toBe(false);
  });
  it("el aviso del servidor «lugar chico» se oculta si su tamaño no es creíble", () => {
    const w = ["gps_space_too_small", "scale_needs_corner"];
    expect(visibleWarnings(w, 30)).toEqual(w);
    for (const bad of [0, -3, Number.NaN, 100_000, null])
      expect(visibleWarnings(w, bad), String(bad)).toEqual(["scale_needs_corner"]);
    // los demás avisos no dependen de ese tamaño
    expect(visibleWarnings(["scale_needs_corner"], null)).toEqual(["scale_needs_corner"]);
  });
});

const rect = (w: number, h: number, deg = 0) => {
  const a = (deg * Math.PI) / 180;
  return [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([x, y]) => ({
    x: x * Math.cos(a) - y * Math.sin(a),
    y: x * Math.sin(a) + y * Math.cos(a),
  }));
};

describe("shortSide (lado corto del terreno)", () => {
  it("un cuadrado de 100 × 100 mide ~100", () => {
    expect(shortSide(rect(100, 100))).toBeCloseTo(100, 6);
  });
  it("un rectángulo de 62 × 164 mide ~62, también girado 30°", () => {
    expect(shortSide(rect(62, 164))).toBeCloseTo(62, 6);
    expect(shortSide(rect(62, 164, 30))).toBeCloseTo(62, 6);
    expect(shortSide(rect(164, 62, 117))).toBeCloseTo(62, 6);
  });
  it("no es perímetro / 4 ni el lado largo: en el terreno alargado da mucho menos", () => {
    const perimeter = 2 * (62 + 164);
    expect(perimeter / 4).toBeGreaterThan(110);
    expect(shortSide(rect(62, 164))!).toBeLessThan(perimeter / 4 / 1.5);
  });
  it("menos de 3 puntos, puntos iguales o alineados, o valores no finitos → null", () => {
    expect(shortSide(undefined)).toBeNull();
    expect(shortSide([])).toBeNull();
    expect(
      shortSide([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ]),
    ).toBeNull();
    expect(
      shortSide([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull();
    expect(
      shortSide([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
      ]),
    ).toBeNull();
    expect(
      shortSide([
        { x: 0, y: 0 },
        { x: 5, y: Number.NaN },
        { x: 10, y: 3 },
      ]),
    ).toBeNull();
  });
});
