// Regla compartida «¿sirve el GPS aquí?» (SP-06, HU-37): movida al dominio para la consola y el celular.
import { describe, expect, it } from "vitest";
import { gpsFits, smallField, TARGET_PCT } from "@/domain/measurement/gpsFit";

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
  it("lado = perímetro / 4; menor que el mínimo avisa con ambos números", () => {
    expect(smallField(40, 30)).toEqual({ side: 10, minSide: 30 });
  });
  it("lado igual o mayor que el mínimo no avisa", () => {
    expect(smallField(120, 30)).toBeNull();
    expect(smallField(200, 30)).toBeNull();
  });
  it("sin mínimo o sin perímetro válido no avisa", () => {
    expect(smallField(40, null)).toBeNull();
    expect(smallField(0, 30)).toBeNull();
    expect(smallField(Number.NaN, 30)).toBeNull();
  });
});
