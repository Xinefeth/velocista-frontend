// Lector de planos DXF (F2 del spec «Exportar e importar DXF»): unidades, entidades soportadas, cada
// rechazo, lo que se ignora y la ida y vuelta con el escritor de F1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { measurementToDxf } from "@/domain/measurement/dxf";
import {
  DXF_MAX_BYTES,
  isDxfError,
  parseDxfPlan,
  type DxfError,
  type DxfPlan,
} from "@/domain/measurement/dxfParse";
import type { PointApi } from "@/infrastructure/contracts/measurements";
import { measurement, result } from "../../black-box/measurement/_api";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/fixtures/dxf", name), "utf8");

// ---- construcción de DXF pequeños a mano (código/valor) ----
const pair = (code: number, value: string | number) => `${String(code).padStart(3)}\n${value}`;
const lw = (
  pts: [number, number][],
  opts: { closed?: boolean; layer?: string; bulge?: number } = {},
) =>
  [
    pair(0, "LWPOLYLINE"),
    pair(8, opts.layer ?? "0"),
    pair(90, pts.length),
    pair(70, opts.closed === false ? 0 : 1),
    ...pts.flatMap(([x, y], i) => [
      pair(10, x),
      pair(20, y),
      ...(opts.bulge && i === 0 ? [pair(42, opts.bulge)] : []),
    ]),
  ].join("\n");
const line = (a: [number, number], b: [number, number], layer = "0") =>
  [
    pair(0, "LINE"),
    pair(8, layer),
    pair(10, a[0]),
    pair(20, a[1]),
    pair(11, b[0]),
    pair(21, b[1]),
  ].join("\n");
const simple = (type: string, layer = "0") =>
  [pair(0, type), pair(8, layer), pair(10, 0), pair(20, 0)].join("\n");

function dxf(entities: string[], units?: number, eol = "\n"): string {
  const header = units === undefined ? "" : [pair(9, "$INSUNITS"), pair(70, units)].join("\n");
  const text = [
    pair(0, "SECTION"),
    pair(2, "HEADER"),
    header,
    pair(0, "ENDSEC"),
    pair(0, "SECTION"),
    pair(2, "ENTITIES"),
    ...entities,
    pair(0, "ENDSEC"),
    pair(0, "EOF"),
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
  return text.replace(/\n/g, eol);
}

const SQUARE10: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const ok = (r: DxfPlan | DxfError): DxfPlan => {
  if (isDxfError(r)) throw new Error(`se esperaba un plano y salió: ${r.error}`);
  return r;
};
const err = (r: DxfPlan | DxfError): DxfError => {
  if (!isDxfError(r)) throw new Error("se esperaba un error");
  return r;
};

describe("archivos reales de ezdxf (R12, R2000 y R2010)", () => {
  it("R2000: LWPOLYLINE cerrada de 8 × 6 m con unidad en el encabezado", () => {
    const p = ok(parseDxfPlan(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    expect(p.unit).toBe("m");
    expect(p.unitSource).toBe("header");
    expect(p.contours).toHaveLength(1);
    expect(p.contours[0].layer).toBe("PLANO");
    expect(p.contours[0].perimeter_m).toBeCloseTo(28, 3);
    expect(p.contours[0].area_m2).toBeCloseTo(48, 3);
    // el primer vértice queda en (0, 0) aunque el dibujo esté lejos del origen
    expect(p.contours[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(p.chosen).toBe(0);
  });

  it("R2010: cuatro LINE desordenadas y en milímetros se unen en un contorno", () => {
    const p = ok(parseDxfPlan(fixture("rect-8x6-lines-mm-r2010.dxf")));
    expect(p.unit).toBe("mm");
    expect(p.contours).toHaveLength(1);
    expect(p.contours[0].layer).toBe("MUROS");
    expect(p.contours[0].perimeter_m).toBeCloseTo(28, 3);
    expect(p.contours[0].area_m2).toBeCloseTo(48, 3);
    expect(p.contours[0].points).toHaveLength(4);
  });

  it("R12: POLYLINE + VERTEX + SEQEND; sin unidad declarada pide la unidad", () => {
    const first = err(parseDxfPlan(fixture("rect-8x6-polyline-r12.dxf")));
    expect(first.needsUnit).toBe(true);
    expect(first.error).toContain("unidad");
    const p = ok(parseDxfPlan(fixture("rect-8x6-polyline-r12.dxf"), { unit: "m" }));
    expect(p.unitSource).toBe("asked");
    expect(p.contours[0].area_m2).toBeCloseTo(48, 3);
    const cm = ok(parseDxfPlan(fixture("rect-8x6-polyline-r12.dxf"), { unit: "cm" }));
    expect(cm.contours[0].area_m2).toBeCloseTo(48 / 10000, 6);
  });
});

describe("unidades", () => {
  const cases: [string, number, number, number][] = [
    ["mm", 4, 0.001, 10],
    ["cm", 5, 0.01, 10],
    ["m", 6, 1, 10],
    ["in", 1, 0.0254, 10],
  ];
  it.each(cases)("%s ($INSUNITS %i) se convierte a metros", (unit, code, factor, side) => {
    const p = ok(parseDxfPlan(dxf([lw(SQUARE10)], code)));
    expect(p.unit).toBe(unit);
    expect(p.unitSource).toBe("header");
    expect(p.contours[0].perimeter_m).toBeCloseTo(4 * side * factor, 9);
    expect(p.contours[0].area_m2).toBeCloseTo(side * side * factor * factor, 9);
  });

  it("una unidad que no se soporta (pies, kilómetros…) se rechaza con su motivo", () => {
    for (const code of [2, 3, 7, 10]) {
      const e = err(parseDxfPlan(dxf([lw(SQUARE10)], code)));
      expect(e.error).toContain(`código ${code}`);
      expect(e.needsUnit).toBeUndefined();
    }
  });

  it("sin $INSUNITS o con 0 (sin unidad) pide la unidad; con `unit` la usa y lo dice", () => {
    for (const text of [dxf([lw(SQUARE10)]), dxf([lw(SQUARE10)], 0)]) {
      expect(err(parseDxfPlan(text)).needsUnit).toBe(true);
      const p = ok(parseDxfPlan(text, { unit: "cm" }));
      expect(p.unit).toBe("cm");
      expect(p.unitSource).toBe("asked");
    }
  });

  it("si el archivo declara la unidad, `options.unit` no la cambia", () => {
    const p = ok(parseDxfPlan(dxf([lw(SQUARE10)], 6), { unit: "mm" }));
    expect(p.unit).toBe("m");
    expect(p.unitSource).toBe("header");
  });
});

describe("formato del texto", () => {
  it("CRLF, LF y CR dan el mismo resultado, y los espacios sobrantes no molestan", () => {
    const base = ok(parseDxfPlan(dxf([lw(SQUARE10)], 6, "\n")));
    for (const eol of ["\r\n", "\r"])
      expect(ok(parseDxfPlan(dxf([lw(SQUARE10)], 6, eol)))).toEqual(base);
    const spaced = dxf([lw(SQUARE10)], 6).replace(/\n/g, "  \n  ");
    expect(ok(parseDxfPlan(spaced))).toEqual(base);
  });

  it("ignora la tercera coordenada (z) y las propiedades que no conoce", () => {
    const e = [
      pair(0, "LWPOLYLINE"),
      pair(8, "0"),
      pair(70, 1),
      pair(38, 5),
      pair(43, 0.2),
      ...SQUARE10.flatMap(([x, y]) => [pair(10, x), pair(20, y), pair(91, 0)]),
    ].join("\n");
    expect(ok(parseDxfPlan(dxf([e], 6))).contours[0].area_m2).toBeCloseTo(100, 6);
  });
});

describe("contornos", () => {
  it("LWPOLYLINE abierta cuyo último punto repite el primero cuenta como cerrada", () => {
    const pts: [number, number][] = [...SQUARE10, [0, 0]];
    const p = ok(parseDxfPlan(dxf([lw(pts, { closed: false })], 6)));
    expect(p.contours[0].points).toHaveLength(4);
    expect(p.contours[0].area_m2).toBeCloseTo(100, 6);
  });

  it("una polilínea abierta que no cierra no es un contorno, y se avisa", () => {
    const e = err(parseDxfPlan(dxf([lw(SQUARE10, { closed: false })], 6)));
    expect(e.error).toContain("ningún contorno cerrado");
    const p = ok(
      parseDxfPlan(
        dxf(
          [
            lw(SQUARE10),
            lw(
              [
                [0, 0],
                [5, 5],
                [9, 1],
              ],
              { closed: false },
            ),
          ],
          6,
        ),
      ),
    );
    expect(p.ignored).toContain("polilíneas abiertas ×1");
  });

  it("cuatro LINE unidas punta con punta, aunque estén en sentidos mezclados", () => {
    const p = ok(
      parseDxfPlan(
        dxf(
          [
            line([0, 0], [10, 0]),
            line([10, 10], [10, 0]),
            line([10, 10], [0, 10]),
            line([0, 0], [0, 10]),
          ],
          6,
        ),
      ),
    );
    expect(p.contours[0].area_m2).toBeCloseTo(100, 6);
  });

  it("une extremos a menos de 1 mm y no los que están a más", () => {
    const near = dxf(
      [
        line([0, 0], [10, 0]),
        line([10.0005, 0], [10, 10]),
        line([10, 10.0004], [0, 10]),
        line([0, 10], [0, 0.0006]),
      ],
      6,
    );
    expect(ok(parseDxfPlan(near)).contours).toHaveLength(1);
    const far = dxf(
      [
        line([0, 0], [10, 0]),
        line([10.005, 0], [10, 10]),
        line([10, 10], [0, 10]),
        line([0, 10], [0, 0]),
      ],
      6,
    );
    const e = err(parseDxfPlan(far));
    expect(e.error).toContain("ningún contorno cerrado");
  });

  it("LINE sueltas se listan como ignoradas pero no estorban a un contorno válido", () => {
    const p = ok(parseDxfPlan(dxf([lw(SQUARE10), line([50, 50], [60, 60])], 6)));
    expect(p.ignored).toContain("LINE sueltas ×1");
  });

  it("varios contornos: los lista todos y propone el de mayor área", () => {
    const small: [number, number][] = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
    ];
    const p = ok(
      parseDxfPlan(dxf([lw(small, { layer: "PATIO" }), lw(SQUARE10, { layer: "MURO" })], 6)),
    );
    expect(p.contours.map((c) => [c.layer, Math.round(c.area_m2)])).toEqual([
      ["PATIO", 4],
      ["MURO", 100],
    ]);
    expect(p.chosen).toBe(1);
    expect(p.warnings.join(" ")).toContain("2 contornos");
  });

  it("un contorno cóncavo (L) conserva su área y perímetro", () => {
    const L: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
    ];
    const c = ok(parseDxfPlan(dxf([lw(L)], 6))).contours[0];
    expect(c.area_m2).toBeCloseTo(75, 6);
    expect(c.perimeter_m).toBeCloseTo(40, 6);
  });
});

describe("lo que se ignora", () => {
  it("ARC, CIRCLE, SPLINE, ELLIPSE, INSERT, HATCH, TEXT, DIMENSION y POINT se listan y no estorban", () => {
    const types = [
      "ARC",
      "CIRCLE",
      "SPLINE",
      "ELLIPSE",
      "INSERT",
      "HATCH",
      "TEXT",
      "MTEXT",
      "DIMENSION",
      "POINT",
    ];
    const p = ok(
      parseDxfPlan(dxf([lw(SQUARE10), ...types.map((t) => simple(t)), simple("CIRCLE")], 6)),
    );
    for (const t of types) expect(p.ignored.some((i) => i.startsWith(`${t} ×`))).toBe(true);
    expect(p.ignored).toContain("CIRCLE ×2");
    expect(p.contours).toHaveLength(1);
  });

  it("las capas TRAZO y TRAZO_CRUDO (del propio export) no cuentan como contornos", () => {
    const big: [number, number][] = [
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50],
    ];
    const p = ok(
      parseDxfPlan(
        dxf(
          [
            lw(SQUARE10, { layer: "CONTORNO" }),
            lw(big, { layer: "TRAZO" }),
            lw(big, { layer: "trazo_crudo" }),
          ],
          6,
        ),
      ),
    );
    expect(p.contours.map((c) => c.layer)).toEqual(["CONTORNO"]);
    expect(p.ignored.join("|")).toContain("capa TRAZO ×1");
    expect(p.ignored.join("|")).toContain("capa trazo_crudo ×1");
  });

  it("un contorno con arcos (bulge) se descarta con la advertencia «arcos no soportados»", () => {
    const e = err(parseDxfPlan(dxf([lw(SQUARE10, { bulge: 0.5 })], 6)));
    expect(e.error).toContain("arcos");
    const p = ok(
      parseDxfPlan(
        dxf([lw(SQUARE10, { bulge: 0.5, layer: "ARCOS" }), lw(SQUARE10, { layer: "OK" })], 6),
      ),
    );
    expect(p.contours.map((c) => c.layer)).toEqual(["OK"]);
    expect(p.warnings.join(" ")).toMatch(/arcos no están soportados/);
  });

  it("una POLYLINE con bulge en un vértice también se descarta", () => {
    const e = [
      pair(0, "POLYLINE"),
      pair(8, "0"),
      pair(70, 1),
      ...SQUARE10.flatMap(([x, y], i) => [
        pair(0, "VERTEX"),
        pair(8, "0"),
        pair(10, x),
        pair(20, y),
        ...(i === 1 ? [pair(42, 1)] : []),
      ]),
      pair(0, "SEQEND"),
    ].join("\n");
    expect(err(parseDxfPlan(dxf([e], 6))).error).toContain("arcos");
  });
});

describe("rechazos con motivo propio", () => {
  it("archivo vacío", () => {
    expect(err(parseDxfPlan("")).error).toBe("El archivo está vacío.");
    expect(err(parseDxfPlan("  \n \r\n")).error).toBe("El archivo está vacío.");
  });

  it("no es un DXF: texto cualquiera, JSON, o sin la sección ENTITIES", () => {
    for (const text of [
      "hola mundo\notra línea",
      '{"a":1}',
      "<svg/>",
      "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n",
    ])
      expect(err(parseDxfPlan(text)).error).toContain("no es un DXF válido");
  });

  it("DXF binario", () => {
    expect(err(parseDxfPlan("AutoCAD Binary DXF\r\n\x1a\0")).error).toContain("binario");
  });

  it("más de 5 MB, sin leer su contenido", () => {
    expect(DXF_MAX_BYTES).toBe(5 * 1024 * 1024);
    const big = "x".repeat(DXF_MAX_BYTES + 1);
    expect(err(parseDxfPlan(big)).error).toContain("5 MB");
    // justo en el límite sí se intenta leer (y falla por otro motivo)
    expect(err(parseDxfPlan("x".repeat(DXF_MAX_BYTES))).error).toContain("no es un DXF válido");
  });

  it("dibujo sin ningún contorno cerrado", () => {
    expect(err(parseDxfPlan(dxf([simple("CIRCLE"), line([0, 0], [1, 1])], 6))).error).toContain(
      "ningún contorno cerrado",
    );
    expect(err(parseDxfPlan(dxf([], 6))).error).toContain("ningún contorno cerrado");
  });

  it("menos de 3 vértices distintos", () => {
    for (const pts of [
      [
        [0, 0],
        [5, 5],
      ],
      [
        [1, 1],
        [1, 1],
        [1, 1],
      ],
      [
        [0, 0],
        [5, 5],
        [5, 5],
        [0, 0],
      ],
    ] as [number, number][][])
      expect(err(parseDxfPlan(dxf([lw(pts)], 6))).error).toContain("menos de 3 vértices");
  });

  it("contorno con auto-cruce (moño), con 4 vértices y con más", () => {
    const bowtie: [number, number][] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ];
    expect(err(parseDxfPlan(dxf([lw(bowtie)], 6))).error).toContain("se cruza consigo mismo");
    const star: [number, number][] = [
      [0, 0],
      [10, 0],
      [2, 8],
      [5, -3],
      [8, 8],
      [0, 0.5],
    ];
    expect(err(parseDxfPlan(dxf([lw(star)], 6))).error).toContain("se cruza consigo mismo");
  });

  it("contorno sin área (puntos en línea)", () => {
    expect(
      err(
        parseDxfPlan(
          dxf(
            [
              lw([
                [0, 0],
                [5, 0],
                [10, 0],
              ]),
            ],
            6,
          ),
        ),
      ).error,
    ).toContain("no encierra área");
  });

  it("un contorno malo no impide usar otro bueno del mismo archivo, pero lo advierte", () => {
    const bowtie: [number, number][] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ];
    const p = ok(
      parseDxfPlan(dxf([lw(bowtie, { layer: "MALO" }), lw(SQUARE10, { layer: "BUENO" })], 6)),
    );
    expect(p.contours.map((c) => c.layer)).toEqual(["BUENO"]);
    expect(p.warnings.join(" ")).toContain("capa MALO");
  });

  it("todos los motivos están en español y terminan en punto", () => {
    const errors = [
      parseDxfPlan(""),
      parseDxfPlan("hola"),
      parseDxfPlan(dxf([lw(SQUARE10)], 2)),
      parseDxfPlan(dxf([lw(SQUARE10)])),
      parseDxfPlan(dxf([], 6)),
    ].map((r) => err(r).error);
    for (const m of errors) expect(m).toMatch(/^[A-ZÁÉÍÓÚ].*[.]$/);
  });
});

describe("ida y vuelta con el escritor de F1", () => {
  const SQUARE: PointApi[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
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
  const perim = (p: PointApi[]) =>
    p.reduce(
      (s, a, i) => s + Math.hypot(p[(i + 1) % p.length].x - a.x, p[(i + 1) % p.length].y - a.y),
      0,
    );
  const exported = (polygon: PointApi[], reference: PointApi[] | null = null) =>
    measurementToDxf(
      measurement(7, {
        reference: reference && { points: reference, scale_n: 1, name: "" },
        result: result({
          polygon,
          corrected_path: [...polygon, polygon[0]],
          raw_path: polygon.map((p) => ({ x: p.x + 0.2, y: p.y - 0.1 })),
          perimeter_m: perim(polygon),
          area_m2: area(polygon),
        }),
      }),
    );

  it.each([
    ["cuadrado 10 × 10", SQUARE],
    ["L cóncava", L_SHAPE],
  ])("%s: perímetro y área a menos de 1 mm", (_n, poly) => {
    const p = ok(parseDxfPlan(exported(poly)));
    expect(p.unit).toBe("m");
    expect(p.unitSource).toBe("header");
    expect(p.contours).toHaveLength(1); // TRAZO y TRAZO_CRUDO no cuentan
    expect(p.contours[0].layer).toBe("CONTORNO");
    expect(Math.abs(p.contours[0].perimeter_m - perim(poly))).toBeLessThan(0.001);
    expect(Math.abs(p.contours[0].area_m2 - area(poly))).toBeLessThan(0.001);
    expect(p.ignored.join("|")).toMatch(/capa TRAZO ×1/);
    expect(p.ignored.join("|")).toMatch(/capa TRAZO_CRUDO ×1/);
    expect(p.ignored.join("|")).toMatch(/POINT ×/);
    expect(p.ignored.join("|")).toMatch(/TEXT ×/);
    expect(p.ignored.join("|")).toMatch(/CIRCLE ×1/);
  });

  it("los vértices coinciden con el polígono (hasta 1 mm) y empiezan en (0, 0)", () => {
    const pts = ok(parseDxfPlan(exported(L_SHAPE))).contours[0].points;
    expect(pts).toHaveLength(L_SHAPE.length);
    pts.forEach((q, i) => {
      expect(Math.abs(q.x - L_SHAPE[i].x)).toBeLessThan(0.001);
      expect(Math.abs(q.y - L_SHAPE[i].y)).toBeLessThan(0.001);
    });
  });

  it("con plano de referencia lista CONTORNO y PLANO_REF y propone el de mayor área", () => {
    const ref: PointApi[] = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
      { x: 0, y: 6 },
    ];
    const p = ok(parseDxfPlan(exported(SQUARE, ref)));
    expect(p.contours.map((c) => c.layer).sort()).toEqual(["CONTORNO", "PLANO_REF"]);
    expect(p.contours[p.chosen].layer).toBe("CONTORNO"); // 100 m² > 48 m²
    const ref2 = p.contours.find((c) => c.layer === "PLANO_REF")!;
    expect(ref2.area_m2).toBeCloseTo(48, 3);
    expect(ref2.perimeter_m).toBeCloseTo(28, 3);
  });

  it("el ejemplo exportado por la consola (R2000, L con plano) se lee igual", () => {
    const p = ok(parseDxfPlan(fixture("export-terreno-en-L.dxf")));
    const byLayer = Object.fromEntries(p.contours.map((c) => [c.layer, c]));
    expect(byLayer.CONTORNO.area_m2).toBeCloseTo(75, 3);
    expect(byLayer.CONTORNO.perimeter_m).toBeCloseTo(40, 3);
    expect(byLayer.PLANO_REF.area_m2).toBeCloseTo(100, 3);
    expect(p.contours[p.chosen].layer).toBe("PLANO_REF");
  });
});
