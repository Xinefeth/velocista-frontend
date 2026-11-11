// Esquinas, lados y ángulos del trazo en vivo: el camino crece punto a punto (1 punto por segundo) y las
// esquinas deben confirmarse sin parpadeo, sin moverse y sin salir con poco camino o con el GPS parado.
import { describe, expect, it } from "vitest";
import {
  closeRadius,
  detectOpenCorners,
  LIVE_MAX_DRIFT_M,
  LIVE_MIN_NEXT_SIDE_M,
  LIVE_RECOMPUTE_MS,
  liveView,
  newLiveState,
  openNoise,
  stepLive,
  type LiveState,
} from "@/domain/measurement/liveCorners";
import type { Pt } from "@/domain/measurement/plot";
import { gpsWalk } from "./_gps";

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Camina un polígono cerrado a `stepM` metros por punto, con ruido uniforme de ±`noise` m. */
function walkPolygon(poly: Pt[], stepM: number, noise: number, seed = 5): Pt[] {
  let s = seed >>> 0;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const out: Pt[] = [];
  const total = poly.reduce((t, p, i) => t + dist(p, poly[(i + 1) % poly.length]), 0);
  const n = Math.round(total / stepM);
  for (let i = 0; i <= n; i++) {
    let d = (i / n) * total;
    let k = 0;
    while (k < poly.length - 1 && d > dist(poly[k], poly[(k + 1) % poly.length])) {
      d -= dist(poly[k], poly[(k + 1) % poly.length]);
      k++;
    }
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const t = d / dist(a, b);
    out.push({
      x: a.x + (b.x - a.x) * t + (i ? rand() * noise : 0),
      y: a.y + (b.y - a.y) * t + (i ? rand() * noise : 0),
    });
  }
  return out;
}

interface Step {
  i: number;
  state: LiveState;
}

/** Alimenta el seguimiento punto a punto, un punto por segundo, y guarda el estado de cada paso. */
function feed(path: Pt[]): Step[] {
  let state = newLiveState();
  const steps: Step[] = [];
  for (let i = 1; i <= path.length; i++) {
    state = stepLive(state, path.slice(0, i), i * 1000);
    steps.push({ i, state });
  }
  return steps;
}

const RECT = (w: number, h: number): Pt[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];
const L_SHAPE: Pt[] = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 25 },
  { x: 25, y: 25 },
  { x: 25, y: 60 },
  { x: 0, y: 60 },
];

describe("rectángulo caminado con ruido de ±1 m, un punto por segundo", () => {
  const poly = RECT(78, 55);
  const path = walkPolygon(poly, 1.3, 1);
  const steps = feed(path);
  const final = steps.at(-1)!.state;

  it("tras caminar el primer lado y empezar el segundo hay 1 esquina de unos 90°", () => {
    // 78 m + 12 m del segundo lado ≈ 69 puntos
    const at = steps[Math.round((78 + 12) / 1.3)].state;
    expect(at.corners).toHaveLength(1);
    expect(dist(at.corners[0].p, { x: 78, y: 0 })).toBeLessThan(5);
    const v = liveView(path[0], [at.corners[0].p], path[Math.round((78 + 12) / 1.3)]);
    expect(v.angles).toHaveLength(1);
    expect(Math.abs(v.angles[0].deg - 90)).toBeLessThan(15);
    expect(v.sides).toHaveLength(1);
    expect(v.sides[0].length).toBeGreaterThan(70);
  });

  it("no se muestra nada hasta tener camino: con menos de 10 m no hay esquinas", () => {
    for (const s of steps.slice(0, 7)) expect(s.state.corners).toHaveLength(0);
  });

  it("al terminar el rectángulo hay 4 lados y 4 ángulos de unos 90°", () => {
    expect(final.corners).toHaveLength(3);
    const here = path.at(-1)!;
    const v = liveView(
      path[0],
      final.corners.map((c) => c.p),
      here,
      {
        closeWithin: closeRadius(final.tol),
      },
    );
    expect(v.closed).toBe(true);
    expect(v.sides).toHaveLength(4);
    expect(v.current).toBeNull();
    expect(v.angles).toHaveLength(4);
    for (const a of v.angles) expect(Math.abs(a.deg - 90)).toBeLessThan(15);
    expect(v.angles.map((a) => a.name)).toEqual(["A", "B", "C", "D"]);
  });

  it("el número de esquinas confirmadas nunca baja al añadir puntos (sin parpadeo)", () => {
    for (let k = 1; k < steps.length; k++)
      expect(steps[k].state.corners.length, `punto ${steps[k].i}`).toBeGreaterThanOrEqual(
        steps[k - 1].state.corners.length,
      );
  });

  it("una esquina confirmada no se mueve más de 1 m, en ningún paso", () => {
    const first = new Map<number, Pt>();
    for (const s of steps)
      s.state.corners.forEach((c, j) => {
        if (!first.has(j)) first.set(j, c.p);
        expect(dist(c.p, first.get(j)!), `esquina ${j + 1} en el punto ${s.i}`).toBeLessThanOrEqual(
          LIVE_MAX_DRIFT_M + 1e-9,
        );
        expect(dist(c.p, c.p0)).toBeLessThanOrEqual(LIVE_MAX_DRIFT_M + 1e-9);
      });
  });

  it("las esquinas aparecen de una en una y en el orden del camino", () => {
    let last = -1;
    for (const s of steps) {
      const idx = s.state.corners.map((c) => c.idx);
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      expect(idx.length - last).toBeLessThanOrEqual(1);
      last = idx.length;
    }
  });

  it("con otras semillas de ruido y en sentido horario también da 3 esquinas y 4 lados", () => {
    for (const seed of [1, 2, 3, 9]) {
      for (const poly2 of [poly, [...poly].reverse()]) {
        const p = walkPolygon(poly2, 1.3, 1, seed);
        const st = feed(p).at(-1)!.state;
        expect(st.corners, `semilla ${seed}`).toHaveLength(3);
        const v = liveView(
          p[0],
          st.corners.map((c) => c.p),
          p.at(-1)!,
          {
            closeWithin: closeRadius(st.tol),
          },
        );
        expect(v.sides).toHaveLength(4);
      }
    }
  });
});

describe("rectángulo girado de ~98 × 91 m de caja, con GPS sintético", () => {
  it("da 3 esquinas estables caminando punto a punto", () => {
    const path = gpsWalk(78, 55, 35, 205, 1);
    const steps = feed(path);
    expect(steps.at(-1)!.state.corners).toHaveLength(3);
    for (let k = 1; k < steps.length; k++)
      expect(steps[k].state.corners.length).toBeGreaterThanOrEqual(
        steps[k - 1].state.corners.length,
      );
  });
});

describe("L cóncava caminada", () => {
  const path = walkPolygon(L_SHAPE, 1.3, 0.6);
  const final = feed(path).at(-1)!.state;
  it("5 esquinas y, al cerrarse, 6 ángulos interiores con un reflejo de ~270°", () => {
    expect(final.corners).toHaveLength(5);
    const v = liveView(
      path[0],
      final.corners.map((c) => c.p),
      path.at(-1)!,
      {
        closeWithin: closeRadius(final.tol),
      },
    );
    expect(v.closed).toBe(true);
    expect(v.sides).toHaveLength(6);
    expect(v.angles).toHaveLength(6);
    const reflex = v.angles.filter((a) => a.deg > 180);
    expect(reflex).toHaveLength(1);
    expect(Math.abs(reflex[0].deg - 270)).toBeLessThan(15);
    // los ángulos interiores de un hexágono suman 720°
    expect(Math.abs(v.angles.reduce((s, a) => s + a.deg, 0) - 720)).toBeLessThan(12);
  });
  it("en el camino abierto los ángulos son el menor entre dos lados (0 a 180°)", () => {
    const mid = feed(path.slice(0, Math.round(150 / 1.3))).at(-1)!.state;
    const v = liveView(
      path[0],
      mid.corners.map((c) => c.p),
      path[Math.round(150 / 1.3) - 1],
    );
    expect(v.closed).toBe(false);
    for (const a of v.angles) {
      expect(a.deg).toBeGreaterThan(0);
      expect(a.deg).toBeLessThanOrEqual(180);
      expect(Number.isInteger(a.deg)).toBe(true);
    }
  });
});

describe("poco camino o GPS parado: no se muestra nada", () => {
  it("un camino recto de menos de 10 m no da esquinas", () => {
    const path = Array.from({ length: 8 }, (_, i) => ({ x: i * 1.2, y: 0 }));
    expect(detectOpenCorners(path).corners).toHaveLength(0);
    expect(feed(path).every((s) => s.state.corners.length === 0)).toBe(true);
  });
  it("una L pequeña de menos de 10 m de avance tampoco", () => {
    const path = [
      ...walkPolygon(
        [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 3 },
          { x: 0, y: 3 },
        ],
        0.7,
        0,
      ),
    ];
    expect(feed(path).at(-1)!.state.corners).toHaveLength(0);
  });
  it("con el GPS parado (puntos casi iguales) no hay nada, aunque el camino acumule metros de ruido", () => {
    let s = 3;
    const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
    const still = Array.from({ length: 400 }, (_, i) => ({
      x: i ? rand() * 0.4 : 0,
      y: i ? rand() * 0.4 : 0,
    }));
    expect(feed(still).every((st) => st.state.corners.length === 0)).toBe(true);
    const v = liveView(still[0], [], still.at(-1)!);
    expect(v.sides).toHaveLength(0);
    expect(v.angles).toHaveLength(0);
  });
});

describe("recalcular: como máximo una vez por segundo y solo con un punto nuevo", () => {
  const path = walkPolygon(RECT(78, 55), 1.3, 1);
  it("sin punto nuevo devuelve el mismo estado", () => {
    const st = stepLive(newLiveState(), path.slice(0, 90), 100_000);
    expect(stepLive(st, path.slice(0, 90), 200_000)).toBe(st);
  });
  it("con un punto nuevo pero antes de LIVE_RECOMPUTE_MS devuelve el mismo estado", () => {
    const st = stepLive(newLiveState(), path.slice(0, 90), 100_000);
    expect(stepLive(st, path.slice(0, 91), 100_000 + LIVE_RECOMPUTE_MS - 1)).toBe(st);
    expect(stepLive(st, path.slice(0, 91), 100_000 + LIVE_RECOMPUTE_MS)).not.toBe(st);
  });
  it("con 1500 puntos sigue siendo rápido (< 150 ms por cálculo)", () => {
    const big = gpsWalk(300, 250, 20, 1500, 1);
    const t0 = performance.now();
    stepLive(newLiveState(), big, 1000);
    expect(performance.now() - t0).toBeLessThan(150);
  });
});

describe("esquinas marcadas por el usuario (por pasos)", () => {
  const start: Pt = { x: 0, y: 0 };
  const marked: Pt[] = [
    { x: 9.5, y: 0 },
    { x: 9.5, y: 5 },
    { x: 0.6, y: 5.2 },
  ];
  const walked = [9.51, 5.07, 8.87];

  it("tres esquinas marcadas y recorrido casi cerrado: lados con lo caminado y ángulos", () => {
    const v = liveView(
      start,
      marked,
      { x: 0.3, y: 1.2 },
      { walked, currentWalked: 4, closeWithin: 3 },
    );
    expect(v.closed).toBe(true);
    expect(v.sides.slice(0, 3).map((s) => s.length)).toEqual(walked);
    expect(v.angles).toHaveLength(4); // inicio incluido
    for (const a of v.angles) expect(Math.abs(a.deg - 90)).toBeLessThan(10);
  });

  it("con el recorrido abierto, el ángulo de una esquina sale en cuanto el lado siguiente mide 2 m o más", () => {
    // última esquina marcada en (9.5, 5): el tramo actual aún mide menos de 2 m
    const short = liveView(
      start,
      marked.slice(0, 2),
      { x: 8.0, y: 5.1 },
      { walked: walked.slice(0, 2) },
    );
    expect(dist(marked[1], { x: 8, y: 5.1 })).toBeLessThan(LIVE_MIN_NEXT_SIDE_M);
    expect(short.angles.map((a) => a.name)).toEqual(["B"]); // la esquina B ya tiene su lado siguiente (5 m)
    // la tercera esquina (D) no tiene ángulo todavía: su lado siguiente mide 1.3 m
    const none = liveView(start, marked, { x: 0.6, y: 3.9 }, { walked });
    expect(none.angles.map((a) => a.name)).toEqual(["B", "C"]);
    const tooShort = liveView(start, marked, { x: 0.7, y: 4.4 }, { walked });
    expect(dist(marked[2], { x: 0.7, y: 4.4 })).toBeLessThan(LIVE_MIN_NEXT_SIDE_M);
    expect(tooShort.angles.map((a) => a.name)).toEqual(["B", "C"]); // D espera a que el tramo mida 2 m
    const enough = liveView(start, marked, { x: 0.7, y: 2.9 }, { walked });
    expect(dist(marked[2], { x: 0.7, y: 2.9 })).toBeGreaterThanOrEqual(LIVE_MIN_NEXT_SIDE_M);
    expect(enough.angles.map((a) => a.name)).toEqual(["B", "C", "D"]);
  });

  it("no hay ángulo mientras el tramo siguiente mide menos de 2 m, y aparece al pasar de 2 m sin saltar", () => {
    const c: Pt[] = [{ x: 10, y: 0 }];
    const at = (y: number) => liveView(start, c, { x: 10, y }, { walked: [10] }).angles;
    expect(at(0.5)).toHaveLength(0);
    expect(at(1.9)).toHaveLength(0);
    expect(at(2.0)).toHaveLength(1);
    expect(at(2.0)[0].deg).toBe(90);
    expect(at(6)[0].deg).toBe(90);
  });

  it("con más de 12 lados solo se rotulan longitudes, sin ángulos", () => {
    const many: Pt[] = Array.from({ length: 14 }, (_, i) => ({ x: 5 * (i + 1), y: (i % 2) * 5 }));
    const v = liveView(start, many, { x: 80, y: 0 });
    expect(v.sides.length).toBeGreaterThan(12);
    expect(v.angles).toHaveLength(0);
  });
});

describe("utilidades", () => {
  it("el radio de cierre sube con el ruido, entre 3 y 8 m", () => {
    expect(closeRadius(0.3)).toBe(3);
    expect(closeRadius(3)).toBeCloseTo(4.5, 9);
    expect(closeRadius(20)).toBe(8);
  });
  it("openNoise: casi 0 sin ruido y cerca de 0.5 con ±1 m", () => {
    expect(openNoise(walkPolygon(RECT(78, 55), 1.3, 0))).toBeLessThan(0.1);
    const n = openNoise(walkPolygon(RECT(78, 55), 1.3, 1));
    expect(n).toBeGreaterThan(0.2);
    expect(n).toBeLessThan(0.9);
    expect(openNoise([{ x: 0, y: 0 }])).toBe(0);
  });
});
