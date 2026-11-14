// Recorrido guiado por plano: escala, esquina interior, alineación rígida y avisos (L de 12 × 4 + 4 × 6).
import { describe, expect, it } from "vitest";
import {
  alignByStart,
  alignResult,
  applyAlign,
  applyAlignAll,
  comparePlan,
  concaveIndices,
  expectedMarks,
  guideStep,
  guideText,
  missingMarksWarning,
  planCm,
  scalePlan,
  scaleSentence,
  walkedSentence,
  unmatchedVertices,
  unmatchedWarning,
  walkingIndices,
  walkingRing,
  type GuidedPlan,
} from "@/domain/measurement/guidedPlan";

// L: 12 m × 4 m en la base y 4 m × 6 m hacia arriba; la esquina interior es (4, 4) = D
const L = [
  { x: 0, y: 0 },
  { x: 12, y: 0 },
  { x: 12, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 10 },
  { x: 0, y: 10 },
];
const plan = (over: Partial<GuidedPlan> = {}): GuidedPlan => ({
  name: "L",
  points: L,
  scaleN: 100,
  startIndex: 0,
  direction: "ccw",
  ...over,
});
const rot = (p: { x: number; y: number }, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
};

describe("escala visible", () => {
  it("a 1:100, 10 m del terreno son 10 cm del plano", () => {
    expect(planCm(10, 100)).toBe(10);
    expect(scaleSentence(100)).toMatch(/1:100, 10 m en el terreno = 10[.,]0 cm en el plano/);
    expect(walkedSentence(12.3, 100)).toMatch(
      /12[.,]3 m recorridos = 12[.,]3 cm en el plano \(1:100\)/,
    );
  });
  it("a 1:50, 10 m son 20 cm", () => expect(planCm(10, 50)).toBe(20));
  it("lleva el dibujo a tamaño real multiplicando por N", () => {
    expect(scalePlan([{ x: 0.12, y: 0.04 }], 100)).toEqual([{ x: 12, y: 4 }]);
  });
});

describe("esquina interior", () => {
  it("solo el vértice (4, 4) de la L es cóncavo", () => expect(concaveIndices(L)).toEqual([3]));
  it("da igual el sentido en que venga el plano", () =>
    expect(concaveIndices([...L].reverse())).toEqual([2]));
  it("un rectángulo no tiene esquinas interiores", () =>
    expect(
      concaveIndices([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ]),
    ).toEqual([]));
  it("el recorrido avisa de la esquina interior cuando le toca y de las que faltan", () => {
    expect(expectedMarks(plan())).toBe(5);
    expect(guideStep(plan(), 0).nextLetter).toBe("B");
    const s = guideStep(plan(), 2); // marcadas B y C: sigue D, la interior
    expect(s.nextLetter).toBe("D");
    expect(s.nextIsInterior).toBe(true);
    expect(guideText(s)).toMatch(/esquina interior \(D\): márcala/);
    expect(guideStep(plan(), 5).nextIndex).toBeNull();
  });
  it("al terminar sin la interior avisa cuál falta", () => {
    expect(missingMarksWarning(plan(), 5)).toBeNull();
    const w = missingMarksWarning(plan(), 2)!; // faltan D, E, F
    expect(w).toMatch(/Marcaste 2 de 5/);
    expect(w).toMatch(/esquina interior \(D\)/);
    expect(missingMarksWarning(plan(), 4)).not.toMatch(/interior/); // solo faltaría F
  });
});

describe("orden y sentido", () => {
  it("antihorario desde A recorre A B C D E F; horario, A F E D C B", () => {
    expect(walkingIndices(L, 0, "ccw")).toEqual([0, 1, 2, 3, 4, 5]);
    expect(walkingIndices(L, 0, "cw")).toEqual([0, 5, 4, 3, 2, 1]);
    expect(walkingRing(L, 2, "ccw")[0]).toEqual(L[2]);
  });
  it("si el plano viene horario, «antihorario» lo recorre al revés", () => {
    const cw = [...L].reverse();
    expect(walkingIndices(cw, 0, "ccw")).toEqual([0, 5, 4, 3, 2, 1]);
  });
});

describe("alineación rígida", () => {
  it("el inicio medido cae en el vértice y el primer lado apunta al siguiente vértice", () => {
    // recorrido real girado 37° y desplazado: sale de (5, 2) hacia la primera esquina
    const walk = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 4 },
    ].map((p) => rot(p, 37));
    const ring = walkingRing(L, 0, "ccw");
    const a = alignByStart(walk[0], walk[1], ring)!;
    const out = applyAlignAll(a, walk);
    expect(out[0].x).toBeCloseTo(0, 6);
    expect(out[0].y).toBeCloseTo(0, 6);
    expect(out[1].x).toBeCloseTo(12, 6);
    expect(out[1].y).toBeCloseTo(0, 6);
    expect(out[2].x).toBeCloseTo(12, 6);
    expect(out[2].y).toBeCloseTo(4, 6);
  });
  it("no deforma: conserva las distancias", () => {
    const walk = [
      { x: 1, y: 1 },
      { x: 8, y: 3 },
      { x: 9, y: 9 },
    ];
    const a = alignByStart(walk[0], walk[1], walkingRing(L, 1, "ccw"))!;
    const out = applyAlignAll(a, walk);
    const d = (p: typeof walk, i: number, j: number) =>
      Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
    expect(d(out, 0, 1)).toBeCloseTo(d(walk, 0, 1), 9);
    expect(d(out, 1, 2)).toBeCloseTo(d(walk, 1, 2), 9);
    expect(applyAlign(a, walk[0])).toEqual({ x: L[1].x, y: L[1].y });
  });
  it("sin movimiento todavía no hay alineación", () => {
    expect(alignByStart({ x: 1, y: 1 }, { x: 1, y: 1 }, L)).toBeNull();
  });
  it("resultado con inicio y sentido guardados", () => {
    const measured = [...L].map((p) => rot(p, 120));
    const a = alignResult(measured, L, { startIndex: 0, direction: "ccw" })!;
    const out = applyAlignAll(a, measured);
    L.forEach((p, i) => {
      expect(out[i].x).toBeCloseTo(p.x, 6);
      expect(out[i].y).toBeCloseTo(p.y, 6);
    });
  });
  it("sin guardado y con los mismos vértices encuentra el mejor ajuste", () => {
    const measured = [...L].map((p) => rot({ x: p.x + 0.2, y: p.y - 0.1 }, -75));
    const a = alignResult(measured, L)!;
    const out = applyAlignAll(a, measured);
    L.forEach((p, i) => {
      expect(out[i].x).toBeCloseTo(p.x, 0);
      expect(out[i].y).toBeCloseTo(p.y, 0);
    });
  });
  it("con una esquina de menos no revienta", () => {
    const five = L.filter((_, i) => i !== 3);
    expect(alignResult(five, L)).not.toBeNull();
  });
});

describe("comparación con el plano", () => {
  it("la L es 44 m y 72 m²", () => {
    const c = comparePlan(L, L)!;
    expect(c.planPerimeter).toBeCloseTo(44, 9);
    expect(c.planArea).toBeCloseTo(72, 9);
    expect(c.perimeterPct).toBeCloseTo(0, 9);
  });
  it("el error en % es medido contra el plano", () => {
    const c = comparePlan(
      L.map((p) => ({ x: p.x * 1.1, y: p.y * 1.1 })),
      L,
    )!;
    expect(c.perimeterPct).toBeCloseTo(10, 6);
    expect(c.areaPct).toBeCloseTo(21, 6);
  });
  it("sin polígono no compara", () => expect(comparePlan([], L)).toBeNull());
});

describe("esquinas sin marcar (por posición, no por cuenta)", () => {
  const marksOf = (idx: number[]) => idx.map((i) => ({ x: L[i].x + 0.3, y: L[i].y - 0.2 }));
  it("con todas las esquinas no avisa", () => {
    expect(unmatchedWarning(plan(), marksOf([1, 2, 3, 4, 5]))).toBeNull();
  });
  it("omitir la interior avisa de la interior aunque haya otras marcas", () => {
    const w = unmatchedWarning(plan(), marksOf([1, 2, 4, 5]))!;
    expect(w).toMatch(/Falta 1 esquina del plano sin marcar \(D\)/);
    expect(w).toMatch(/esquina interior \(D\)/);
  });
  it("omitir una exterior no habla de esquina interior", () => {
    const w = unmatchedWarning(plan(), marksOf([1, 3, 4, 5]))!;
    expect(w).toMatch(/\(C\)/);
    expect(w).not.toMatch(/interior/);
  });
  it("la esquina de partida no cuenta", () => {
    expect(unmatchedVertices(plan({ startIndex: 3 }), marksOf([4, 5, 0, 1, 2]))).toEqual([]);
  });
});
