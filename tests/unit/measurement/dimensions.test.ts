// Cotas de un plano: lados, ángulos interiores, nombres de vértice y colocación de etiquetas.
import { describe, expect, it } from "vitest";
import {
  angleLabel,
  chainSides,
  cleanRing,
  diffLabel,
  lengthLabel,
  placeLabels,
  polygonDims,
  sideDiffs,
  vertexName,
  type LabelRequest,
} from "@/domain/measurement/dimensions";
import type { Pt } from "@/domain/measurement/plot";

const RECT: Pt[] = [
  { x: 0, y: 0 },
  { x: 8, y: 0 },
  { x: 8, y: 6 },
  { x: 0, y: 6 },
];
// L cóncava: 10 × 10 menos un cuadrado de 5 × 5 → área 75, perímetro 40, ángulo reflejo en (5, 5)
const L_SHAPE: Pt[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 10 },
  { x: 0, y: 10 },
];
const reversed = (p: Pt[]) => [...p].reverse();

describe("polygonDims · rectángulo 8 × 6", () => {
  const d = polygonDims(RECT)!;
  it("lados, nombres y etiquetas", () => {
    expect(d.sides.map((s) => s.length)).toEqual([8, 6, 8, 6]);
    expect(d.sides.map((s) => s.name)).toEqual(["AB", "BC", "CD", "DA"]);
    expect(d.sides.map((s) => s.label)).toEqual(["8.00 m", "6.00 m", "8.00 m", "6.00 m"]);
    expect(d.sides[0].mid).toEqual({ x: 4, y: 0 });
  });
  it("cuatro ángulos de 90° con su etiqueta", () => {
    expect(d.vertices.map((v) => v.name)).toEqual(["A", "B", "C", "D"]);
    for (const v of d.vertices) {
      expect(v.interior).toBeCloseTo(90, 9);
      expect(v.label).toBe("90°");
      expect(v.reflex).toBe(false);
    }
  });
  it("perímetro, área y sentido", () => {
    expect(d.perimeter).toBe(28);
    expect(d.area).toBe(48);
    expect(d.orientation).toBe(1);
  });
  it("las direcciones hacia afuera salen del contorno, en los lados y en las esquinas", () => {
    const expected = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    d.sides.forEach((s, i) => {
      expect(s.outward.x).toBeCloseTo(expected[i].x, 9);
      expect(s.outward.y).toBeCloseTo(expected[i].y, 9);
    });
    const a = d.vertices[0].outward;
    expect(a.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(a.y).toBeCloseTo(-Math.SQRT1_2, 9);
  });
  it("recorrido en sentido horario da los mismos lados, ángulos y direcciones hacia afuera", () => {
    const cw = polygonDims(reversed(RECT))!;
    expect(cw.orientation).toBe(-1);
    expect(cw.sides.map((s) => s.length).sort()).toEqual([6, 6, 8, 8]);
    for (const v of cw.vertices) expect(v.interior).toBeCloseTo(90, 9);
    // el punto medio más la dirección hacia afuera queda fuera del rectángulo
    for (const s of cw.sides) {
      const q = { x: s.mid.x + s.outward.x * 0.1, y: s.mid.y + s.outward.y * 0.1 };
      expect(q.x < 0 || q.x > 8 || q.y < 0 || q.y > 6).toBe(true);
    }
  });
});

describe("polygonDims · L cóncava de 75 m²", () => {
  const d = polygonDims(L_SHAPE)!;
  it("área 75, perímetro 40 y seis lados", () => {
    expect(d.area).toBe(75);
    expect(d.perimeter).toBe(40);
    expect(d.sides.map((s) => s.label)).toEqual([
      "10.00 m",
      "5.00 m",
      "5.00 m",
      "5.00 m",
      "5.00 m",
      "10.00 m",
    ]);
  });
  it("tiene un ángulo reflejo de 270° en (5, 5) y los demás de 90°", () => {
    expect(d.vertices.map((v) => Math.round(v.interior))).toEqual([90, 90, 90, 270, 90, 90]);
    expect(d.vertices.map((v) => v.reflex)).toEqual([false, false, false, true, false, false]);
    expect(d.vertices[3].label).toBe("270°");
    expect(d.vertices[3].name).toBe("D");
  });
  it("los ángulos interiores suman (n − 2) × 180°", () => {
    expect(d.vertices.reduce((s, v) => s + v.interior, 0)).toBeCloseTo(720, 6);
  });
  it("en la esquina reflejo la dirección hacia afuera apunta hacia el hueco de la L", () => {
    const o = d.vertices[3].outward;
    expect(o.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(o.y).toBeCloseTo(Math.SQRT1_2, 9);
  });
  it("el mismo resultado recorrido al revés", () => {
    const cw = polygonDims(reversed(L_SHAPE))!;
    expect(cw.vertices.map((v) => Math.round(v.interior)).sort((a, b) => a - b)).toEqual([
      90, 90, 90, 90, 90, 270,
    ]);
    expect(cw.area).toBe(75);
  });
});

describe("polygonDims · otros casos", () => {
  it("polígono cóncavo (punta de flecha): los ángulos suman 360° y uno es reflejo", () => {
    const arrow: Pt[] = [
      { x: 0, y: 0 },
      { x: 6, y: 2 },
      { x: 0, y: 4 },
      { x: 2, y: 2 },
    ];
    const d = polygonDims(arrow)!;
    expect(d.vertices.reduce((s, v) => s + v.interior, 0)).toBeCloseTo(360, 6);
    expect(d.vertices.filter((v) => v.reflex)).toHaveLength(1);
  });
  it("triángulo 3-4-5: 90°, 36.9° y 53.1° con un decimal cuando no son enteros", () => {
    const d = polygonDims([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ])!;
    expect(d.vertices.map((v) => v.label).sort()).toEqual(["36.9°", "53.1°", "90°"]);
    expect(d.sides.map((s) => s.length).sort()).toEqual([3, 4, 5]);
  });
  it("ignora el cierre repetido y los puntos repetidos seguidos", () => {
    const d = polygonDims([...RECT, { x: 0, y: 0 }, { x: 0, y: 0 }])!;
    expect(d.vertices).toHaveLength(4);
    expect(cleanRing([...RECT, RECT[0]])).toEqual(RECT);
  });
  it("menos de 3 puntos distintos, puntos en línea o sin área → null", () => {
    expect(polygonDims([])).toBeNull();
    expect(
      polygonDims([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull();
    expect(
      polygonDims([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBeNull();
    expect(
      polygonDims([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull();
  });
  it("un vértice llano (180°) usa la dirección del lado", () => {
    const d = polygonDims([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
      { x: 0, y: 6 },
    ])!;
    expect(d.vertices[1].interior).toBeCloseTo(180, 6);
    expect(d.vertices[1].outward.y).toBeCloseTo(-1, 6);
  });
});

describe("textos", () => {
  it("nombres de vértice: A…Z, AA, AB… ZZ, AAA", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(vertexName)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });
  it("longitud con punto decimal es-PE y ángulos sin decimales si son enteros", () => {
    expect(lengthLabel(8)).toBe("8.00 m");
    expect(lengthLabel(1234.5)).toBe("1,234.50 m");
    expect(angleLabel(90)).toBe("90°");
    expect(angleLabel(89.98)).toBe("90°");
    expect(angleLabel(87.34)).toBe("87.3°");
  });
  it("la diferencia lleva su signo", () => {
    expect(diffLabel(0.123)).toBe("+0.12 m");
    expect(diffLabel(-0.5)).toBe("−0.50 m");
    expect(diffLabel(0)).toBe("0.00 m");
  });
});

describe("sideDiffs · plano frente a lo medido", () => {
  it("diferencia por lado, medido menos plano", () => {
    const measured: Pt[] = [
      { x: 0, y: 0 },
      { x: 8.12, y: 0 },
      { x: 8.12, y: 5.94 },
      { x: 0, y: 5.94 },
    ];
    const d = sideDiffs(RECT, measured)!;
    expect(d.map((x) => x.name)).toEqual(["AB", "BC", "CD", "DA"]);
    expect(d[0].diff).toBeCloseTo(0.12, 9);
    expect(d[1].diff).toBeCloseTo(-0.06, 9);
    expect(d[0].pct).toBeCloseTo(1.5, 9);
  });
  it("con distinto número de vértices no se compara", () => {
    expect(sideDiffs(RECT, L_SHAPE)).toBeNull();
    expect(sideDiffs(RECT, [{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("chainSides · lados de un recorrido abierto", () => {
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
  ];
  it("usa lo caminado cuando se da y la línea recta cuando no", () => {
    expect(chainSides(corners, [8.2, 6.1]).map((s) => s.label)).toEqual(["8.20 m", "6.10 m"]);
    expect(chainSides(corners).map((s) => s.label)).toEqual(["8.00 m", "6.00 m"]);
  });
  it("la dirección hacia afuera se aleja del centro del recorrido", () => {
    const [a, b] = chainSides(corners);
    expect(a.outward.y).toBeLessThan(0); // lado inferior: afuera es hacia abajo
    expect(b.outward.x).toBeGreaterThan(0); // lado derecho: afuera es hacia la derecha
  });
  it("menos de dos esquinas o esquinas repetidas no dan lados", () => {
    expect(chainSides([])).toEqual([]);
    expect(chainSides([{ x: 0, y: 0 }])).toEqual([]);
    expect(
      chainSides([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([]);
  });
});

describe("placeLabels", () => {
  const W = 300;
  const H = 260;
  // rectángulo 8 × 6 dibujado en el lienzo: x 70–230, y 70–190
  const box = { x0: 70, x1: 230, y0: 70, y1: 190 };
  const req = (
    id: string,
    x: number,
    y: number,
    dx: number,
    dy: number,
    w = 56,
    h = 19,
  ): LabelRequest => ({ id, x, y, w, h, dx, dy });
  const sides: LabelRequest[] = [
    req("AB", 150, 190, 0, 1),
    req("BC", 230, 130, 1, 0),
    req("CD", 150, 70, 0, -1),
    req("DA", 70, 130, -1, 0),
  ];
  const corners: LabelRequest[] = [
    req("A", 70, 190, -0.7, 0.7, 52, 19),
    req("B", 230, 190, 0.7, 0.7, 52, 19),
    req("C", 230, 70, 0.7, -0.7, 52, 19),
    req("D", 70, 70, -0.7, -0.7, 52, 19),
  ];
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

  it("coloca las ocho etiquetas del rectángulo sin que se pisen y dentro del lienzo", () => {
    const out = placeLabels([...sides, ...corners], W, H);
    expect(out).toHaveLength(8);
    out.forEach((p, i) => {
      expect(p.free).toBe(true);
      expect(p.x - p.w / 2).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w / 2).toBeLessThanOrEqual(W);
      expect(p.y - p.h / 2).toBeGreaterThanOrEqual(0);
      expect(p.y + p.h / 2).toBeLessThanOrEqual(H);
      for (const q of out.slice(i + 1)) expect(overlap(p, q), `${p.id} y ${q.id}`).toBe(false);
    });
  });

  it("las etiquetas quedan fuera del rectángulo, hacia afuera", () => {
    const out = placeLabels([...sides, ...corners], W, H);
    for (const p of out) {
      const insideBox = p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1;
      expect(insideBox, p.id).toBe(false);
    }
    const byId = Object.fromEntries(out.map((p) => [p.id, p]));
    expect(byId.AB.y).toBeGreaterThan(190);
    expect(byId.CD.y).toBeLessThan(70);
    expect(byId.BC.x).toBeGreaterThan(230);
    expect(byId.DA.x).toBeLessThan(70);
  });

  it("una etiqueta pegada al borde se recorta para no salirse del lienzo", () => {
    const [p] = placeLabels([req("X", 4, 4, -1, -1)], W, H);
    expect(p.x - p.w / 2).toBeGreaterThanOrEqual(0);
    expect(p.y - p.h / 2).toBeGreaterThanOrEqual(0);
    const [q] = placeLabels([req("Y", W - 2, H - 2, 1, 1)], W, H);
    expect(q.x + q.w / 2).toBeLessThanOrEqual(W);
    expect(q.y + q.h / 2).toBeLessThanOrEqual(H);
  });

  it("si dos etiquetas piden el mismo sitio, la segunda se mueve", () => {
    const [a, b] = placeLabels([req("1", 150, 190, 0, 1), req("2", 150, 190, 0, 1)], W, H);
    expect(overlap(a, b)).toBe(false);
    expect(b.free).toBe(true);
  });

  it("respeta los huecos ocupados (un resumen en una esquina)", () => {
    const taken = [{ x: 40, y: 20, w: 70, h: 19 }];
    const [p] = placeLabels([req("T", 40, 20, 0, 0, 60, 19)], W, H, 2, taken);
    expect(overlap(p, { ...taken[0] })).toBe(false);
  });

  it("aunque no haya hueco para todas, ninguna se sale del lienzo", () => {
    const many = Array.from({ length: 40 }, (_, i) => req(`m${i}`, 150, 130, 0, 1, 80, 19));
    const out = placeLabels(many, W, H);
    expect(out.some((p) => !p.free)).toBe(true);
    for (const p of out) {
      expect(p.x - p.w / 2).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w / 2).toBeLessThanOrEqual(W);
      expect(p.y - p.h / 2).toBeGreaterThanOrEqual(0);
      expect(p.y + p.h / 2).toBeLessThanOrEqual(H);
    }
  });

  it("una etiqueta más grande que el lienzo se centra y no rompe", () => {
    const [p] = placeLabels([req("G", 10, 10, 1, 1, 400, 19)], W, H);
    expect(p.x).toBe(W / 2);
  });
});
