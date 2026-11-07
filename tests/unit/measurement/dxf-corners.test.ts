// DXF exportado de un recorrido con cientos de puntos (GPS): CONTORNO y trazos llevan todos los puntos,
// pero ESQUINAS y COTAS solo las esquinas reales; el archivo se vuelve a leer con el mismo perímetro y área.
import { describe, expect, it } from "vitest";
import { measurementToDxf } from "@/domain/measurement/dxf";
import { MAX_ANGLE_CORNERS } from "@/domain/measurement/dimensions";
import { isDxfError, parseDxfPlan, type DxfPlan } from "@/domain/measurement/dxfParse";
import type { PointApi } from "@/infrastructure/contracts/measurements";
import { measurement, result } from "../../black-box/measurement/_api";
import { area, gpsMeasurement, gpsWalk, perim, realWalk } from "./_gps";

type Pair = { code: number; value: string };
type Entity = { type: string; layer: string; pairs: Pair[] };

function entities(dxf: string): Entity[] {
  const lines = dxf.split("\r\n");
  lines.pop();
  const pairs: Pair[] = [];
  for (let i = 0; i < lines.length; i += 2)
    pairs.push({ code: Number(lines[i]), value: lines[i + 1] });
  const start = pairs.findIndex(
    (p, i) => p.value === "SECTION" && pairs[i + 1].value === "ENTITIES",
  );
  const end = pairs.findIndex((p, i) => i > start && p.code === 0 && p.value === "ENDSEC");
  const out: Entity[] = [];
  for (const p of pairs.slice(start + 2, end)) {
    if (p.code === 0) out.push({ type: p.value, layer: "", pairs: [] });
    else {
      out.at(-1)!.pairs.push(p);
      if (p.code === 8) out.at(-1)!.layer = p.value;
    }
  }
  return out;
}
const onLayer = (dxf: string, layer: string, type?: string) =>
  entities(dxf).filter((e) => e.layer === layer && (!type || e.type === type));
const val = (e: Entity, code: number) => e.pairs.find((p) => p.code === code)?.value ?? "";
const texts = (dxf: string, layer: string) => onLayer(dxf, layer, "TEXT").map((e) => val(e, 1));
const vertexCount = (e: Entity) => e.pairs.filter((p) => p.code === 10).length;
const sideTexts = (dxf: string) => texts(dxf, "COTAS").filter((t) => / m$/.test(t));
const angleTexts = (dxf: string) => texts(dxf, "COTAS").filter((t) => t.endsWith("\\U+00B0"));
const ok = (r: ReturnType<typeof parseDxfPlan>): DxfPlan => {
  if (isDxfError(r)) throw new Error(r.error);
  return r;
};

describe("contorno GPS real (473 vértices)", () => {
  const real = realWalk();
  const m = gpsMeasurement(real.CONTORNO, real.TRAZO, real.TRAZO_CRUDO);
  const dxf = measurementToDxf(m);

  it("CONTORNO, TRAZO y TRAZO_CRUDO conservan todos los puntos", () => {
    expect(vertexCount(onLayer(dxf, "CONTORNO")[0])).toBe(473);
    expect(vertexCount(onLayer(dxf, "TRAZO")[0])).toBe(real.TRAZO.length + 1); // el trazo corregido se cierra
    expect(vertexCount(onLayer(dxf, "TRAZO_CRUDO")[0])).toBe(474);
  });

  it("ESQUINAS y COTAS no pasan de las esquinas reales (≤ 15; aquí son 4)", () => {
    expect(onLayer(dxf, "ESQUINAS", "POINT").length).toBeLessThanOrEqual(15);
    expect(onLayer(dxf, "ESQUINAS", "POINT")).toHaveLength(4);
    expect(texts(dxf, "ESQUINAS")).toEqual(["1", "2", "3", "4"]);
    expect(sideTexts(dxf)).toHaveLength(4);
    expect(angleTexts(dxf)).toHaveLength(4);
    expect(texts(dxf, "COTAS").length).toBeLessThanOrEqual(30);
    // antes salían 473 puntos, 473 números, 473 largos y 473 ángulos (más de 1400 textos)
    expect(entities(dxf).filter((e) => e.type === "TEXT").length).toBeLessThan(40);
  });

  it("los lados rotulados son los del contorno simplificado (cuatro lados de unos 55 a 79 m)", () => {
    const lengths = sideTexts(dxf).map((t) => parseFloat(t));
    expect(lengths.map(Math.round).sort((a, b) => a - b)).toEqual([55, 58, 78, 79]);
    for (const a of angleTexts(dxf)) expect(Math.abs(parseFloat(a) - 90)).toBeLessThan(5);
  });

  it("TEXTOS lleva el perímetro y el área de la medición (no los del polígono simplificado) y cuántas esquinas", () => {
    const t = texts(dxf, "TEXTOS");
    expect(t).toContain(`Per\\U+00EDmetro: ${m.result!.perimeter_m.toFixed(2)} m`);
    expect(t).toContain(`\\U+00C1rea: ${m.result!.area_m2.toFixed(2)} m\\U+00B2`);
    expect(t).toContain("Cotas: 4 esquinas detectadas");
    // el simplificado mide menos que lo medido: el texto no debe haberse contagiado de él
    expect(m.result!.perimeter_m).toBeCloseTo(perim(real.CONTORNO), 6);
  });

  it("al volver a leer el DXF, el contorno da el mismo perímetro y área (a 1 cm y 0.1 m²)", () => {
    const plan = ok(parseDxfPlan(dxf));
    const contour = plan.contours[plan.chosen];
    expect(contour.layer).toBe("CONTORNO");
    expect(contour.points).toHaveLength(473);
    expect(Math.abs(contour.perimeter_m - m.result!.perimeter_m)).toBeLessThan(0.01);
    expect(Math.abs(contour.area_m2 - m.result!.area_m2)).toBeLessThan(0.1);
    // no hay más contornos: los trazos y los textos se ignoran
    expect(plan.contours).toHaveLength(1);
  });

  it("el DXF ya no se llena de textos: pesa mucho menos que con una etiqueta por punto", () => {
    expect(dxf.length).toBeLessThan(150_000);
  });
});

describe("recorrido GPS sintético (~98 × 91 m girado, ~470 puntos con ruido de 1 m)", () => {
  const walk = gpsWalk(78, 55, 35);
  const m = gpsMeasurement(walk);
  const dxf = measurementToDxf(m);

  it("ESQUINAS y COTAS tienen como mucho 8 esquinas; CONTORNO conserva los 470 puntos", () => {
    expect(vertexCount(onLayer(dxf, "CONTORNO")[0])).toBe(470);
    const corners = onLayer(dxf, "ESQUINAS", "POINT").length;
    expect(corners).toBeGreaterThanOrEqual(3);
    expect(corners).toBeLessThanOrEqual(8);
    expect(sideTexts(dxf).length).toBeLessThanOrEqual(8);
    expect(texts(dxf, "COTAS").length).toBeLessThanOrEqual(16);
  });

  it("ida y vuelta: sin ruido se relee con el mismo perímetro y área", () => {
    // con ±1 m de ruido el contorno completo se cruza consigo mismo y el lector lo rechaza con su
    // motivo (el recorrido real que deja el backend ya viene suavizado y sí se relee, ver arriba)
    const clean = gpsWalk(78, 55, 35, 470, 0);
    const plan = ok(parseDxfPlan(measurementToDxf(gpsMeasurement(clean))));
    const c = plan.contours[plan.chosen];
    expect(Math.abs(c.perimeter_m - perim(clean))).toBeLessThan(0.01);
    expect(Math.abs(c.area_m2 - area(clean))).toBeLessThan(0.1);
    expect(c.points).toHaveLength(470);
  });
});

describe("esquinas marcadas por el usuario (recorrido por pasos)", () => {
  // cinco esquinas marcadas; el trazo trae cientos de puntos pero el polígono son las esquinas
  const marked: PointApi[] = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 12 },
    { x: 10, y: 18 },
    { x: 0, y: 12 },
  ];
  const m = measurement(8, {
    method: "steps",
    reference: null,
    result: result({
      polygon: marked,
      corrected_path: gpsWalk(20, 12, 0, 500, 0.2),
      raw_path: gpsWalk(20, 12, 0, 500, 0.4),
      perimeter_m: perim(marked),
      area_m2: area(marked),
    }),
  });
  const dxf = measurementToDxf(m);

  it("todas las esquinas marcadas se rotulan, con sus lados y ángulos, y se dice que están marcadas", () => {
    expect(onLayer(dxf, "ESQUINAS", "POINT")).toHaveLength(4); // 5 menos el inicio, que coincide con (0, 0)
    expect(sideTexts(dxf)).toHaveLength(5);
    expect(angleTexts(dxf)).toHaveLength(5);
    expect(texts(dxf, "TEXTOS")).toContain("Cotas: 5 esquinas marcadas");
    expect(vertexCount(onLayer(dxf, "TRAZO")[0])).toBe(500);
    expect(vertexCount(onLayer(dxf, "CONTORNO")[0])).toBe(5);
  });

  it("con `corners.marked` explícitas se usan esas aunque el polígono sea grande", () => {
    const big = gpsMeasurement(gpsWalk(78, 55, 0));
    const out = measurementToDxf(big, {
      corners: {
        marked: [
          { x: 0, y: 0 },
          { x: 78, y: 0 },
          { x: 78, y: 55 },
        ],
      },
    });
    expect(onLayer(out, "ESQUINAS", "POINT")).toHaveLength(2);
    expect(texts(out, "TEXTOS")).toContain("Cotas: 3 esquinas marcadas");
    expect(sideTexts(out)).toHaveLength(3);
  });
});

describe("muchas esquinas (más de 40): sin ángulos y con tope de textos", () => {
  // contorno redondo con ondulación: muchas esquinas aunque se simplifique
  const wavy: PointApi[] = Array.from({ length: 180 }, (_, i) => {
    const a = (2 * Math.PI * i) / 180;
    const r = 40 + 4 * Math.sin(a * 9);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  const m = gpsMeasurement(wavy);

  it("pasando una tolerancia muy fina salen más de 40 esquinas: solo longitudes, nada de ángulos", () => {
    const dxf = measurementToDxf(m, {
      corners: { tolerance: 0.05, minSide: 0.05, flatDeg: 0, maxCorners: 200 },
    });
    const corners = onLayer(dxf, "ESQUINAS", "POINT").length;
    expect(corners).toBeGreaterThan(MAX_ANGLE_CORNERS);
    expect(angleTexts(dxf)).toHaveLength(0);
    expect(sideTexts(dxf).length).toBeGreaterThan(MAX_ANGLE_CORNERS);
    expect(
      texts(dxf, "TEXTOS").some((t) =>
        t.startsWith("Ángulos no rotulados".replace("Á", "\\U+00C1")),
      ),
    ).toBe(true);
  });

  it("con los ajustes normales el total de textos queda acotado (≤ 60 esquinas)", () => {
    const dxf = measurementToDxf(m);
    expect(onLayer(dxf, "ESQUINAS", "POINT").length).toBeLessThanOrEqual(60);
    expect(texts(dxf, "COTAS").length).toBeLessThanOrEqual(120);
  });
});
