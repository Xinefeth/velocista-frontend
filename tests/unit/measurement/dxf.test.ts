// Escritor DXF de la medición (F1 del spec «Exportar e importar DXF»): capas, unidades, formato de
// números, handles, acentos y que el contorno del archivo coincida con el área y el perímetro del resultado.
import { describe, expect, it } from "vitest";
import { dxfFileName, dxfText, DXF_LAYERS, measurementToDxf } from "@/domain/measurement/dxf";
import type { PointApi } from "@/infrastructure/contracts/measurements";
import { measurement, result } from "../../black-box/measurement/_api";

const SQUARE: PointApi[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
// L cóncava: 10 × 10 menos un cuadrado de 5 × 5 → área 75, perímetro 40
const L_SHAPE: PointApi[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 10 },
  { x: 0, y: 10 },
];

const area = (p: PointApi[]) =>
  Math.abs(
    p.reduce((s, a, i) => s + (a.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * a.y), 0),
  ) / 2;
const perimeter = (p: PointApi[]) =>
  p.reduce(
    (s, a, i) => s + Math.hypot(p[(i + 1) % p.length].x - a.x, p[(i + 1) % p.length].y - a.y),
    0,
  );

function build(polygon: PointApi[], extra = {}, over = {}) {
  return measurement(7, {
    place_name: "Parque Ñandú",
    reference: null,
    result: result({
      polygon,
      corrected_path: [...polygon, polygon[0]],
      raw_path: polygon.map((p) => ({ x: p.x + 0.2, y: p.y - 0.1 })),
      perimeter_m: perimeter(polygon),
      area_m2: area(polygon),
      ...extra,
    }),
    ...over,
  });
}

type Pair = { code: number; value: string };
type Entity = { type: string; pairs: Pair[] };

function pairs(dxf: string): Pair[] {
  const lines = dxf.split("\r\n");
  expect(lines.pop()).toBe(""); // termina en salto de línea
  expect(lines.length % 2).toBe(0);
  const out: Pair[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    expect(lines[i]).toMatch(/^ *\d{1,4}$/);
    out.push({ code: Number(lines[i]), value: lines[i + 1] });
  }
  return out;
}

function section(all: Pair[], name: string): Pair[] {
  const start = all.findIndex(
    (p, i) => p.code === 0 && p.value === "SECTION" && all[i + 1].value === name,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const end = all.findIndex((p, i) => i > start && p.code === 0 && p.value === "ENDSEC");
  return all.slice(start + 2, end);
}

function entities(dxf: string): Entity[] {
  const out: Entity[] = [];
  for (const p of section(pairs(dxf), "ENTITIES")) {
    if (p.code === 0) out.push({ type: p.value, pairs: [] });
    else out.at(-1)!.pairs.push(p);
  }
  return out;
}

const get = (e: Entity, code: number) => e.pairs.find((p) => p.code === code)?.value;
const layerOf = (e: Entity) => get(e, 8)!;
const onLayer = (dxf: string, layer: string, type?: string) =>
  entities(dxf).filter((e) => layerOf(e) === layer && (!type || e.type === type));
const vertices = (e: Entity): PointApi[] => {
  const xs = e.pairs.filter((p) => p.code === 10).map((p) => Number(p.value));
  const ys = e.pairs.filter((p) => p.code === 20).map((p) => Number(p.value));
  return xs.map((x, i) => ({ x, y: ys[i] }));
};
/** Cotas de los lados (terminan en « m»); los ángulos van en la misma capa y terminan en «°». */
const sideTexts = (dxf: string) =>
  onLayer(dxf, "COTAS", "TEXT").filter((e) => / m$/.test(get(e, 1)!));
const angleTexts = (dxf: string) =>
  onLayer(dxf, "COTAS", "TEXT").filter((e) => get(e, 1)!.endsWith("\\U+00B0"));
const texts = (dxf: string, layer: string) => onLayer(dxf, layer, "TEXT").map((e) => get(e, 1)!);

describe("estructura del archivo", () => {
  const dxf = measurementToDxf(build(SQUARE));

  it("es R2000 en metros, sistema métrico, y termina en EOF", () => {
    const all = pairs(dxf);
    const header = section(all, "HEADER");
    const val = (name: string) => header[header.findIndex((p) => p.value === name) + 1].value;
    expect(val("$ACADVER")).toBe("AC1015");
    expect(val("$INSUNITS")).toBe("6");
    expect(val("$MEASUREMENT")).toBe("1");
    expect(all.at(-1)).toEqual({ code: 0, value: "EOF" });
  });

  it("las secciones vienen en orden y cada par código/valor está en su línea", () => {
    const order = pairs(dxf).flatMap((p, i, a) =>
      p.code === 0 && p.value === "SECTION" ? [a[i + 1].value] : [],
    );
    expect(order).toEqual(["HEADER", "TABLES", "BLOCKS", "ENTITIES", "OBJECTS"]);
    expect(dxf).not.toMatch(/[^\r]\n/); // el salto de línea es CRLF en todo el archivo
  });

  it("tiene las 8 capas con su nombre exacto en la tabla LAYER", () => {
    const tables = section(pairs(dxf), "TABLES");
    const layerStart = tables.findIndex(
      (p, i) => p.value === "TABLE" && tables[i + 1].value === "LAYER",
    );
    const layerEnd = tables.findIndex((p, i) => i > layerStart && p.value === "ENDTAB");
    const names = tables
      .slice(layerStart, layerEnd)
      .filter((p, i, a) => p.code === 2 && a[i - 1]?.code === 100)
      .map((p) => p.value);
    expect(names).toEqual(["0", ...DXF_LAYERS.map((l) => l.name)]);
    expect(DXF_LAYERS.map((l) => l.name)).toEqual([
      "CONTORNO",
      "TRAZO",
      "TRAZO_CRUDO",
      "ESQUINAS",
      "INICIO",
      "COTAS",
      "TEXTOS",
      "PLANO_REF",
    ]);
  });

  it("TRAZO_CRUDO nace congelada (apagada); las demás capas, no; colores ACI", () => {
    const tables = section(pairs(dxf), "TABLES");
    const flags: Record<string, { flag: number; color: number }> = {};
    tables.forEach((p, i) => {
      if (p.code === 2 && tables[i - 1]?.value === "AcDbLayerTableRecord")
        flags[p.value] = { flag: Number(tables[i + 1].value), color: Number(tables[i + 2].value) };
    });
    expect(flags.TRAZO_CRUDO.flag & 1).toBe(1);
    for (const l of DXF_LAYERS.filter((x) => x.name !== "TRAZO_CRUDO"))
      expect(flags[l.name].flag & 1).toBe(0);
    for (const l of DXF_LAYERS) expect([1, 3, 5, 7, 8]).toContain(flags[l.name].color);
  });

  it("los handles son hexadecimales únicos y crecientes, y $HANDSEED es mayor que todos", () => {
    const all = pairs(dxf);
    const handles = all
      .filter((p) => p.code === 5 && !all[all.indexOf(p) - 1]?.value.startsWith("$"))
      .map((p) => p.value);
    expect(handles.length).toBeGreaterThan(40);
    for (const h of handles) expect(h).toMatch(/^[0-9A-F]+$/);
    const nums = handles.map((h) => parseInt(h, 16));
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    const header = section(all, "HEADER");
    const seed = parseInt(header[header.findIndex((p) => p.value === "$HANDSEED") + 1].value, 16);
    expect(seed).toBeGreaterThan(Math.max(...nums));
  });

  it("cada entidad lleva sus marcadores de subclase y su dueño", () => {
    const sub: Record<string, string> = {
      LWPOLYLINE: "AcDbPolyline",
      TEXT: "AcDbText",
      POINT: "AcDbPoint",
      CIRCLE: "AcDbCircle",
    };
    for (const e of entities(dxf)) {
      const marks = e.pairs.filter((p) => p.code === 100).map((p) => p.value);
      expect(marks[0]).toBe("AcDbEntity");
      expect(marks).toContain(sub[e.type]);
      expect(get(e, 330)).toBeTruthy();
    }
  });
});

describe("números y texto", () => {
  const dxf = measurementToDxf(build(L_SHAPE, {}, { method: "gps" }));

  it("las coordenadas llevan 3 decimales y punto, sin separador de miles", () => {
    const coords = section(pairs(dxf), "ENTITIES").filter(
      (p) => (p.code >= 10 && p.code <= 39) || p.code === 40 || p.code === 50,
    );
    expect(coords.length).toBeGreaterThan(50);
    for (const c of coords) expect(c.value, `grupo ${c.code}`).toMatch(/^-?\d+\.\d{3}$/);
    const big = measurementToDxf(build(SQUARE.map((p) => ({ x: p.x * 1000, y: p.y * 1000 }))));
    expect(big).toContain("10000.000");
    expect(big).not.toMatch(/\d,\d{3}/);
  });

  it("no hay caracteres fuera de ASCII: los acentos y la ñ van como \\U+00XX", () => {
    expect(dxf).toMatch(/^[\x20-\x7e\r\n]*$/);
    const all = texts(dxf, "TEXTOS").join("\n");
    expect(all).toContain("Lugar: Parque \\U+00D1and\\U+00FA"); // Ñandú
    expect(all).toContain("\\U+00C1rea"); // Área
    expect(all).toContain("Per\\U+00EDmetro");
    expect(all).toContain("M\\U+00E9todo");
    expect(all).toContain("m\\U+00B2");
  });

  it("dxfText escapa lo especial: saltos, barra invertida y «%%»", () => {
    expect(dxfText("á é\nñ")).toBe("\\U+00E1 \\U+00E9 \\U+00F1");
    expect(dxfText("a\\b")).toBe("a/b");
    expect(dxfText("100%%")).not.toContain("%%");
  });

  it("no lleva latitud ni longitud ni coordenadas geográficas", () => {
    expect(dxf).not.toMatch(/\blat(itud)?\b|\blon(gitud)?\b|\blng\b|wgs|utm/i);
    // ningún valor parecido a una coordenada geográfica (grados con 4 o más decimales)
    expect(dxf).not.toMatch(/-?\d{1,3}\.\d{4,}/);
  });

  it("el bloque TEXTOS trae lugar, fecha, método, perímetro, área, cierre, calidad, ejes y unidades", () => {
    const t = texts(dxf, "TEXTOS");
    expect(t).toContain("Lugar: Parque \\U+00D1and\\U+00FA");
    expect(t).toContain("Fecha: 2026-11-03");
    expect(t).toContain("M\\U+00E9todo: GPS");
    expect(t).toContain("Per\\U+00EDmetro: 40.00 m");
    expect(t).toContain("\\U+00C1rea: 75.00 m\\U+00B2");
    expect(t.find((x) => x.startsWith("Error de cierre"))).toMatch(
      /^Error de cierre: 0\.62 m \(2\.0 %\)$/,
    );
    expect(t).toContain("Calidad: Confiable");
    expect(t).toContain("Ejes: +X este, +Y norte (origen en el inicio)");
    expect(t.at(-1)).toMatch(/^Unidades: metros/);
  });

  it("por pasos o carro los ejes son la dirección inicial", () => {
    for (const method of ["steps", "car"] as const) {
      const t = texts(measurementToDxf(build(SQUARE, {}, { method })), "TEXTOS").join("|");
      expect(t).toContain("+X direcci\\U+00F3n inicial del recorrido");
      expect(t).not.toContain("este");
    }
  });

  it("el bloque de textos queda a la izquierda del dibujo", () => {
    const xs = onLayer(dxf, "TEXTOS").map((e) => Number(get(e, 10)));
    expect(Math.max(...xs)).toBeLessThan(0);
  });
});

describe("contorno, esquinas, inicio y cotas", () => {
  it("CONTORNO es una LWPOLYLINE cerrada (70 = 1) con el polígono; el área y el perímetro coinciden", () => {
    for (const poly of [SQUARE, L_SHAPE]) {
      const m = build(poly);
      const [contour, ...rest] = onLayer(measurementToDxf(m), "CONTORNO");
      expect(rest).toHaveLength(0);
      expect(contour.type).toBe("LWPOLYLINE");
      expect(get(contour, 70)).toBe("1");
      expect(get(contour, 90)).toBe(String(poly.length));
      const v = vertices(contour);
      expect(v).toEqual(poly);
      expect(area(v)).toBeCloseTo(m.result!.area_m2, 3);
      expect(perimeter(v)).toBeCloseTo(m.result!.perimeter_m, 3);
    }
    expect(area(L_SHAPE)).toBe(75);
    expect(perimeter(L_SHAPE)).toBe(40);
  });

  it("un polígono que ya repite el primer punto no duplica el vértice", () => {
    const dxf = measurementToDxf(build([...SQUARE, SQUARE[0]]));
    expect(vertices(onLayer(dxf, "CONTORNO")[0])).toEqual(SQUARE);
  });

  it("TRAZO abierto con el recorrido corregido y TRAZO_CRUDO con el recorrido crudo", () => {
    const m = build(L_SHAPE);
    const dxf = measurementToDxf(m);
    const trace = onLayer(dxf, "TRAZO")[0];
    expect(get(trace, 70)).toBe("0");
    expect(vertices(trace)).toHaveLength(m.result!.corrected_path.length);
    const raw = onLayer(dxf, "TRAZO_CRUDO")[0];
    expect(get(raw, 70)).toBe("0");
    expect(vertices(raw)[0]).toEqual({ x: 0.2, y: -0.1 });
  });

  it("ESQUINAS numera los vértices del polígono salvo el inicio, con un punto y un texto cada una", () => {
    const dxf = measurementToDxf(build(L_SHAPE));
    const pts = onLayer(dxf, "ESQUINAS", "POINT").map((e) => ({
      x: Number(get(e, 10)),
      y: Number(get(e, 20)),
    }));
    expect(pts).toEqual(L_SHAPE.slice(1));
    expect(texts(dxf, "ESQUINAS")).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("INICIO es un círculo en (0, 0) con su texto", () => {
    const dxf = measurementToDxf(build(SQUARE));
    const [c] = onLayer(dxf, "INICIO", "CIRCLE");
    expect([get(c, 10), get(c, 20)]).toEqual(["0.000", "0.000"]);
    expect(Number(get(c, 40))).toBeGreaterThan(0);
    expect(texts(dxf, "INICIO")).toEqual(["Inicio"]);
  });

  it("COTAS: un texto por lado con su largo, en el punto medio y legible (nunca boca abajo)", () => {
    const dxf = measurementToDxf(build(L_SHAPE));
    const cotas = sideTexts(dxf);
    expect(cotas.map((e) => get(e, 1))).toEqual([
      "10.00 m",
      "5.00 m",
      "5.00 m",
      "5.00 m",
      "5.00 m",
      "10.00 m",
    ]);
    const mids = cotas.map((e) => [Number(get(e, 11)), Number(get(e, 21))]);
    expect(mids).toEqual([
      [5, 0],
      [10, 2.5],
      [7.5, 5],
      [5, 7.5],
      [2.5, 10],
      [0, 5],
    ]);
    for (const e of cotas) {
      const deg = Number(get(e, 50));
      expect(deg).toBeGreaterThan(-90);
      expect(deg).toBeLessThanOrEqual(90);
    }
    // lados horizontales a 0° y verticales a 90°, aunque el lado se recorra hacia atrás
    expect(cotas.map((e) => Number(get(e, 50)))).toEqual([0, 90, 0, 90, 0, 90]);
  });

  it("COTAS lleva también el ángulo interior de cada vértice, dentro del contorno, con el 270° de la L", () => {
    const dxf = measurementToDxf(build(L_SHAPE));
    const angles = angleTexts(dxf);
    expect(angles.map((e) => get(e, 1))).toEqual([
      "90\\U+00B0",
      "90\\U+00B0",
      "90\\U+00B0",
      "270\\U+00B0",
      "90\\U+00B0",
      "90\\U+00B0",
    ]);
    // cada ángulo está dentro de la L (a la vez que su vértice), con rotación 0 y centrado
    const inside = (x: number, y: number) =>
      x > 0 && x < 10 && y > 0 && y < 10 && !(x > 5 && y > 5);
    for (const e of angles) {
      expect(inside(Number(get(e, 11)), Number(get(e, 21)))).toBe(true);
      expect(Number(get(e, 50))).toBe(0);
    }
    // y los ángulos de un cuadrado son cuatro de 90°
    expect(angleTexts(measurementToDxf(build(SQUARE)))).toHaveLength(4);
  });

  it("un ángulo que no es entero lleva un decimal", () => {
    const tri: PointApi[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ];
    const t = angleTexts(measurementToDxf(build(tri))).map((e) => get(e, 1));
    expect(t.sort()).toEqual(["36.9\\U+00B0", "53.1\\U+00B0", "90\\U+00B0"]);
  });

  it("un lado inclinado que baja hacia la izquierda se gira 180° para quedar legible", () => {
    const tri: PointApi[] = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 8 },
    ];
    const cotas = sideTexts(measurementToDxf(build(tri)));
    const raw = [Math.atan2(5, 10), Math.atan2(3, -10), Math.atan2(-8, 0)].map(
      (a) => (a * 180) / Math.PI,
    );
    expect(Number(get(cotas[0], 50))).toBeCloseTo(raw[0], 2);
    expect(Number(get(cotas[1], 50))).toBeCloseTo(raw[1] - 180, 2); // 163° → −17°
    expect(Number(get(cotas[2], 50))).toBe(90); // −90° → 90°
  });
});

describe("plano de referencia", () => {
  it("sin referencia no hay PLANO_REF", () => {
    expect(onLayer(measurementToDxf(build(SQUARE)), "PLANO_REF")).toHaveLength(0);
  });

  it("con referencia: LWPOLYLINE cerrada a tamaño real (puntos × escala de captura)", () => {
    const m = build(
      SQUARE,
      {},
      {
        reference: {
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 1 },
            { x: 0, y: 1 },
          ],
          scale_n: 5,
          name: "Aula",
        },
      },
    );
    const [ref] = onLayer(measurementToDxf(m), "PLANO_REF");
    expect(get(ref, 70)).toBe("1");
    expect(vertices(ref)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]);
  });

  it("si la medición se comparó con un plano, el resumen lo dice", () => {
    const m = build(SQUARE, { perimeter_error_pct: -1.5, area_error_pct: 3.2 });
    expect(texts(measurementToDxf(m), "TEXTOS").join("|")).toContain(
      "Frente al plano: per\\U+00EDmetro -1.5 % \\U+00B7 \\U+00E1rea 3.2 %",
    );
  });
});

describe("casos límite", () => {
  it("sin resultado no se puede exportar", () => {
    expect(() => measurementToDxf(measurement(1, { result: null }))).toThrow(/resultado/);
  });

  it("sin polígono ni recorridos genera un archivo válido con el resumen", () => {
    const m = measurement(1, {
      reference: null,
      result: result({ polygon: [], corrected_path: [], raw_path: [] }),
    });
    const dxf = measurementToDxf(m);
    expect(onLayer(dxf, "CONTORNO")).toHaveLength(0);
    expect(texts(dxf, "TEXTOS").length).toBeGreaterThan(5);
    expect(pairs(dxf).at(-1)).toEqual({ code: 0, value: "EOF" });
  });

  it("un terreno grande o pequeño ajusta el alto del texto y no deja «-0.000»", () => {
    const tiny = measurementToDxf(build(SQUARE.map((p) => ({ x: p.x / 100, y: p.y / 100 }))));
    const huge = measurementToDxf(build(SQUARE.map((p) => ({ x: p.x * 100, y: p.y * 100 }))));
    const h = (dxf: string) => Number(get(sideTexts(dxf)[0], 40));
    expect(h(tiny)).toBeCloseTo(0.1, 3);
    expect(h(huge)).toBeCloseTo(3, 3);
    expect(tiny + huge).not.toContain("-0.000");
  });
});

describe("dxfFileName", () => {
  const m = (place: string, over = {}) => ({
    id: 12,
    place_name: place,
    finished_at: "2026-11-03T10:02:00Z",
    started_at: "2026-11-03T10:00:00Z",
    ...over,
  });
  it("<lugar>-<id>-<fecha>.dxf con el lugar sin tildes, espacios ni símbolos", () => {
    expect(dxfFileName(m("Parque Ñandú / Lima #2"))).toBe("Parque_Nandu_Lima_2-12-2026-11-03.dxf");
    expect(dxfFileName(m("Aula 204"))).toBe("Aula_204-12-2026-11-03.dxf");
  });
  it("sin lugar usa «medicion» y sin terminar usa la fecha de inicio", () => {
    expect(dxfFileName(m("¿¡?!"))).toBe("medicion-12-2026-11-03.dxf");
    expect(dxfFileName(m("A", { finished_at: null }))).toBe("A-12-2026-11-03.dxf");
    expect(dxfFileName(m("A", { finished_at: null, started_at: "" }))).toBe("A-12-sin-fecha.dxf");
  });
  it("el nombre solo tiene letras, números, guiones y punto", () => {
    expect(dxfFileName(m("Ünï cödé ✓ 日本"))).toMatch(/^[A-Za-z0-9_.-]+\.dxf$/);
  });
});
