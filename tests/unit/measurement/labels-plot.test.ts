import { describe, expect, it } from "vitest";
import {
  deviceCode,
  errorText,
  fmtEs,
  qualityOf,
  QUALITY,
  REASONS,
  signedPct,
  VERDICT,
} from "@/domain/measurement/labels";
import { area, boundsOf, fitView, gridStep, perimeter, rectangle } from "@/domain/measurement/plot";
import { ErrorApi } from "@/infrastructure/http/api";

describe("textos de la medición", () => {
  it("el semáforo usa los mismos límites que el backend (3 % y 6 %)", () => {
    expect(qualityOf(2.99)).toBe("green");
    expect(qualityOf(3)).toBe("yellow");
    expect(qualityOf(6)).toBe("yellow");
    expect(qualityOf(6.01)).toBe("red");
    expect(QUALITY.red.tone).toBe("bad");
  });

  it("traduce los motivos de error del backend y deja el detalle si no lo conoce", () => {
    expect(errorText(new ErrorApi(422, "polygon_underdetermined", "x"))).toBe(
      REASONS.polygon_underdetermined,
    );
    expect(errorText(new ErrorApi(500, "otro", "Detalle del backend"))).toBe("Detalle del backend");
    expect(errorText(new TypeError("Failed to fetch"))).toMatch(/No hay conexión/);
  });

  it("cada veredicto del modelo tiene texto y tono", () => {
    expect(VERDICT.no_improvement.tone).toBe("bad");
    expect(VERDICT.improves_green.label).toMatch(/verde/);
  });

  it("formatea como es-PE, con signo y guion si no hay valor", () => {
    const es = (v: number) =>
      v.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    expect(fmtEs(12.5, 1)).toBe(es(12.5));
    expect(fmtEs(null)).toBe("—");
    expect(fmtEs(Number.NaN)).toBe("—");
    expect(signedPct(3.21)).toBe(`+${es(3.2)} %`);
    expect(signedPct(-1)).toBe(`${es(-1)} %`);
  });

  it("el código corto del celular son 8 caracteres sin el prefijo", () => {
    expect(deviceCode("cel-621b8d99-5d72-4b65")).toBe("621b8d99");
  });
});

describe("proyección de los lienzos", () => {
  it("encaja los puntos centrados con la misma escala en x e y", () => {
    const b = boundsOf(rectangle(10, 6))!;
    expect(b).toEqual({ x0: 0, x1: 10, y0: 0, y1: 6 });
    const v = fitView(b, 220, 220, 10);
    expect(v.k).toBeCloseTo(20);
    expect(v.P({ x: 5, y: 3 })).toEqual([110, 110]);
    // y hacia arriba: más metros en y es más arriba en el lienzo
    expect(v.P({ x: 5, y: 6 })[1]).toBeLessThan(110);
    const back = v.M(...v.P({ x: 2, y: 4 }));
    expect(back.x).toBeCloseTo(2);
    expect(back.y).toBeCloseTo(4);
  });

  it("ignora grupos vacíos y valores no numéricos", () => {
    expect(boundsOf([], null, [{ x: NaN, y: 1 }])).toBeNull();
  });

  it("perímetro y área de Gauss sirven para una figura en L", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 8 },
      { x: 0, y: 8 },
    ];
    expect(perimeter(L)).toBeCloseTo(28);
    expect(area(L)).toBeCloseTo(24);
  });

  it("la cuadrícula crece con lo que se ve", () => {
    expect([gridStep(8), gridStep(30), gridStep(100), gridStep(500)]).toEqual([1, 5, 10, 50]);
  });
});
