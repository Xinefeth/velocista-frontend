// Esquinas reales de un contorno con cientos de puntos (recorrido GPS): pocas esquinas, cierre y sentido
// conservados, y las esquinas marcadas por el usuario o un contorno pequeño se respetan.
import { describe, expect, it } from "vitest";
import { estimateNoise, polygonDims, realCorners } from "@/domain/measurement/dimensions";
import type { Pt } from "@/domain/measurement/plot";
import { area, gpsWalk, perim, realWalk } from "./_gps";

const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** Esquinas verdaderas de gpsWalk(w, h, deg). */
const trueCorners = (w: number, h: number, deg: number): Pt[] => {
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

describe("recorrido GPS sintético (rectángulo girado, ~470 puntos, ruido de 1 m)", () => {
  it.each([
    [78, 55, 35],
    [98, 91, 20],
    [60, 40, 0],
    [120, 30, 80],
  ])("%i × %i m girado %i°: da entre 4 y 8 esquinas, cerca de las verdaderas", (w, h, deg) => {
    const walk = gpsWalk(w, h, deg);
    expect(walk).toHaveLength(470);
    const r = realCorners(walk);
    expect(r.source).toBe("simplified");
    expect(r.points.length).toBeGreaterThanOrEqual(4);
    expect(r.points.length).toBeLessThanOrEqual(8);
    for (const c of trueCorners(w, h, deg))
      expect(Math.min(...r.points.map((p) => near(p, c))), `esquina ${c.x},${c.y}`).toBeLessThan(4);
    // perímetro y área del contorno simplificado, cerca de los del rectángulo
    const d = polygonDims(r.points)!;
    expect(Math.abs(d.perimeter - 2 * (w + h)) / (2 * (w + h))).toBeLessThan(0.04);
    expect(Math.abs(d.area - w * h) / (w * h)).toBeLessThan(0.06);
  });

  it("con otras semillas de ruido sigue dando pocas esquinas (≤ 8)", () => {
    for (const seed of [1, 2, 3, 4, 5, 11, 99])
      expect(
        realCorners(gpsWalk(98, 91, 25, 470, 1, seed)).points.length,
        `semilla ${seed}`,
      ).toBeLessThanOrEqual(8);
  });

  it("los ángulos de las esquinas halladas son casi rectos", () => {
    const d = polygonDims(realCorners(gpsWalk(78, 55, 35)).points)!;
    for (const v of d.vertices) expect(Math.abs(v.interior - 90)).toBeLessThan(12);
  });

  it("conserva el sentido del recorrido (antihorario u horario)", () => {
    const walk = gpsWalk(78, 55, 35);
    const ccw = polygonDims(realCorners(walk).points)!;
    const cw = polygonDims(realCorners([...walk].reverse()).points)!;
    expect(ccw.orientation).toBe(polygonDims(walk)!.orientation);
    expect(cw.orientation).toBe(-ccw.orientation);
  });
});

describe("recorrido GPS real (473 vértices, 98 × 91 m en caja envolvente)", () => {
  const real = realWalk().CONTORNO;
  it("tiene 473 vértices y se reduce a 4 esquinas de unos 90°", () => {
    expect(real).toHaveLength(473);
    const r = realCorners(real);
    expect(r.source).toBe("simplified");
    expect(r.points).toHaveLength(4);
    const d = polygonDims(r.points)!;
    for (const v of d.vertices) expect(Math.abs(v.interior - 90)).toBeLessThan(5);
    // lados de unos 78 × 55 m (el rectángulo va girado)
    expect(d.sides.map((s) => Math.round(s.length)).sort((a, b) => a - b)).toEqual([
      55, 58, 78, 79,
    ]);
  });
  it("el perímetro y el área simplificados quedan cerca de los del contorno completo", () => {
    const d = polygonDims(realCorners(real).points)!;
    expect(Math.abs(d.perimeter - perim(real)) / perim(real)).toBeLessThan(0.03);
    expect(Math.abs(d.area - area(real)) / area(real)).toBeLessThan(0.06);
  });
  it("la tolerancia es proporcional al tamaño: ~2.7 m para este terreno", () => {
    const r = realCorners(real);
    expect(r.tolerance).toBeGreaterThan(2);
    expect(r.tolerance).toBeLessThan(3.01);
  });
});

describe("contornos que ya son de esquinas", () => {
  const RECT: Pt[] = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ];
  it("un contorno pequeño (un rectángulo caminado por pasos) se toma tal cual", () => {
    const r = realCorners(RECT);
    expect(r.source).toBe("original");
    expect(r.points).toEqual(RECT);
  });
  it("hasta 24 vértices se respetan, aunque haya ángulos llanos; con 25 ya se simplifica", () => {
    const ring = (n: number): Pt[] =>
      Array.from({ length: n }, (_, i) => ({
        x: Math.cos((2 * Math.PI * i) / n) * 30,
        y: Math.sin((2 * Math.PI * i) / n) * 30,
      }));
    expect(realCorners(ring(24)).source).toBe("original");
    expect(realCorners(ring(24)).points).toHaveLength(24);
    expect(realCorners(ring(25)).source).toBe("simplified");
  });
  it("las esquinas marcadas por el usuario son las esquinas, aunque el contorno tenga cientos de puntos", () => {
    const marked: Pt[] = [
      { x: 0, y: 0 },
      { x: 78, y: 0 },
      { x: 78, y: 55 },
      { x: 40, y: 70 },
      { x: 0, y: 55 },
    ];
    const r = realCorners(gpsWalk(78, 55, 0), { marked });
    expect(r.source).toBe("marked");
    expect(r.points).toEqual(marked);
    expect(r.tolerance).toBe(0);
  });
  it("menos de 3 esquinas marcadas no sirven y se simplifica el contorno", () => {
    const r = realCorners(gpsWalk(78, 55, 0), {
      marked: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(r.source).toBe("simplified");
  });
});

describe("otras formas", () => {
  /** Reparte puntos por un polígono cerrado y les añade ruido. */
  function walkAlong(poly: Pt[], n: number, noise: number): Pt[] {
    const lens = poly.map((p, i) => near(p, poly[(i + 1) % poly.length]));
    const total = lens.reduce((s, l) => s + l, 0);
    let seed = 3;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
    return Array.from({ length: n }, (_, i) => {
      let d = (i / n) * total;
      let k = 0;
      while (d > lens[k]) d -= lens[k++];
      const a = poly[k];
      const b = poly[(k + 1) % poly.length];
      const t = d / lens[k];
      return {
        x: a.x + (b.x - a.x) * t + rand() * noise,
        y: a.y + (b.y - a.y) * t + rand() * noise,
      };
    });
  }

  it("una L caminada con GPS da 6 esquinas y un ángulo reflejo de unos 270°", () => {
    const L: Pt[] = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 25 },
      { x: 25, y: 25 },
      { x: 25, y: 60 },
      { x: 0, y: 60 },
    ];
    const r = realCorners(walkAlong(L, 420, 0.6));
    expect(r.points).toHaveLength(6);
    const reflex = polygonDims(r.points)!.vertices.filter((v) => v.reflex);
    expect(reflex).toHaveLength(1);
    expect(Math.abs(reflex[0].interior - 270)).toBeLessThan(12);
  });

  it("un terreno pequeño de 8 × 6 m con ruido de 3 cm da 4 esquinas (la tolerancia baja con el tamaño)", () => {
    const rect: Pt[] = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
      { x: 0, y: 6 },
    ];
    expect(realCorners(walkAlong(rect, 120, 0.06)).points).toHaveLength(4);
  });

  it("un contorno redondo no se llena de esquinas: respeta el tope y nunca baja de 3", () => {
    const circle = Array.from({ length: 400 }, (_, i) => ({
      x: Math.cos((2 * Math.PI * i) / 400) * 50,
      y: Math.sin((2 * Math.PI * i) / 400) * 50,
    }));
    const few = realCorners(circle, { maxCorners: 5 });
    expect(few.points.length).toBeGreaterThanOrEqual(3);
    expect(few.points.length).toBeLessThanOrEqual(5);
    expect(realCorners(circle).points.length).toBeLessThanOrEqual(60);
  });

  it("el resultado siempre es un contorno válido (≥ 3 puntos con área)", () => {
    for (const seed of [1, 2, 3, 4])
      expect(
        polygonDims(realCorners(gpsWalk(30, 20, seed * 40, 300, 1.5, seed)).points),
      ).not.toBeNull();
  });
});

describe("estimateNoise", () => {
  it("un recorrido limpio da casi 0 y uno con ruido de ±1 m da cerca de 0.5 m", () => {
    expect(estimateNoise(gpsWalk(78, 55, 35, 470, 0))).toBeLessThan(0.05);
    expect(estimateNoise(realWalk().CONTORNO)).toBeLessThan(0.1); // el recorrido real ya viene suavizado
    const noisy = estimateNoise(gpsWalk(78, 55, 35, 470, 1));
    expect(noisy).toBeGreaterThan(0.3);
    expect(noisy).toBeLessThan(0.7);
  });
  it("con muy pocos puntos no estima nada", () => {
    expect(
      estimateNoise([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(0);
  });
  it("sube la tolerancia con el ruido: más ruido, esquinas igual de pocas", () => {
    for (const noise of [0.5, 1, 1.5])
      expect(
        realCorners(gpsWalk(78, 55, 35, 470, noise)).points.length,
        `ruido ${noise}`,
      ).toBeLessThanOrEqual(8);
  });
});
