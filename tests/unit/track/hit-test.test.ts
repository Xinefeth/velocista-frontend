import { describe, expect, it } from "vitest";
import { blankTrack } from "@/domain/track/commands";
import { EXAMPLE_EIGHT } from "@/domain/track/examples";
import { build } from "@/domain/track/geometry";
import { EMPTY_SELECTION, pointSelection } from "@/domain/track/selection";
import type { Track } from "@/domain/track/types";
import { hitTest, startScreen, visibleNodes, type HitContext } from "@/ui/components/track/hitTest";
import { fitViewport, worldToScreen } from "@/ui/components/track/viewport";

const square: Track = {
  ...blankTrack(),
  closed: true,
  points: [
    { x: 50, y: 50, radius: 0, gap: false },
    { x: 250, y: 50, radius: 0, gap: false },
    { x: 250, y: 200, radius: 0, gap: false },
    { x: 50, y: 200, radius: 0, gap: false },
  ],
};

function ctxFor(track: Track, patch: Partial<HitContext> = {}): HitContext {
  return {
    track,
    geometry: build(track),
    vp: fitViewport(track.board, 800, 600),
    selection: EMPTY_SELECTION,
    tool: "select",
    showNodes: false,
    hover: null,
    issueVertex: null,
    ...patch,
  };
}
const at = (ctx: HitContext, x: number, y: number) => worldToScreen(ctx.vp, x, y);

describe("hitTest", () => {
  it("un punto visible gana a la línea y se elige dentro de 10 px", () => {
    const ctx = ctxFor(square, { showNodes: true });
    const [sx, sy] = at(ctx, 50, 50);
    expect(hitTest(sx + 6, sy - 4, ctx)).toEqual({ type: "v", i: 0 });
    expect(hitTest(sx + 14, sy, ctx).type).not.toBe("v");
  });

  it("sobre un tramo devuelve el tramo y el punto más cercano de la línea", () => {
    const ctx = ctxFor(square);
    const [sx, sy] = at(ctx, 100, 50);
    expect(hitTest(sx, sy + 5, ctx)).toMatchObject({ type: "e", i: 0 });
  });

  it("sobre una curva devuelve el arco", () => {
    const round: Track = { ...square, points: square.points.map((p) => ({ ...p, radius: 30 })) };
    const ctx = ctxFor(round);
    const g = ctx.geometry;
    const arc = g.pts.find((q) => q.src === "v1")!;
    const [sx, sy] = at(ctx, arc.x, arc.y);
    expect(hitTest(sx, sy, ctx)).toMatchObject({ type: "arc", i: 1 });
  });

  it("en el vacío no hay nada", () => {
    const ctx = ctxFor(square);
    const [sx, sy] = at(ctx, 150, 125);
    expect(hitTest(sx, sy, ctx)).toEqual({ type: "none" });
  });

  it("un punto oculto en una esquina viva se alcanza solo si no hay línea debajo", () => {
    const ctx = ctxFor(square);
    const [sx, sy] = at(ctx, 50, 50);
    // La esquina es parte de la línea: se elige el tramo, no el punto oculto.
    expect(["e", "arc"]).toContain(hitTest(sx, sy, ctx).type);
    const lone = ctxFor({ ...square, points: [square.points[0]], closed: false });
    expect(hitTest(...at(lone, 50, 50), lone)).toEqual({ type: "v", i: 0 });
  });

  it("la bandera de salida se alcanza con la herramienta de selección, no con la de dibujo", () => {
    const ctx = ctxFor(EXAMPLE_EIGHT);
    const st = startScreen(ctx.geometry, EXAMPLE_EIGHT, ctx.vp)!;
    expect(hitTest(st[0] + 3, st[1] - 3, ctx)).toEqual({ type: "start" });
    expect(hitTest(st[0], st[1], { ...ctx, tool: "draw" }).type).not.toBe("start");
  });

  it("con dos puntos casi iguales, un clic sobre el elegido toma el otro", () => {
    const twin: Track = {
      ...square,
      start: { edge: 1, t: 0.5 }, // la bandera lejos de los dos puntos
      points: [
        { x: 50, y: 50, radius: 0, gap: false },
        { x: 50.5, y: 50, radius: 0, gap: false },
        { x: 250, y: 200, radius: 0, gap: false },
      ],
    };
    const ctx = ctxFor(twin, { showNodes: true, selection: pointSelection(0) });
    const [sx, sy] = at(ctx, 50, 50);
    expect(hitTest(sx, sy, ctx, false)).toEqual({ type: "v", i: 0 });
    expect(hitTest(sx, sy, ctx, true)).toEqual({ type: "v", i: 1 });
  });
});

describe("visibleNodes", () => {
  it("con la herramienta de dibujo o la opción «puntos» se muestran todos", () => {
    expect(visibleNodes({ ...ctxFor(square), tool: "draw" }).size).toBe(4);
    expect(visibleNodes({ ...ctxFor(square), showNodes: true }).size).toBe(4);
  });

  it("si no, solo los cercanos a lo seleccionado, al puntero o a la incidencia", () => {
    const base = ctxFor(square);
    expect([...visibleNodes(base)]).toEqual([]);
    expect([...visibleNodes({ ...base, selection: pointSelection(0) })].sort()).toEqual([0, 1, 3]);
    expect([...visibleNodes({ ...base, hover: { type: "e", i: 1, wx: 0, wy: 0 } })].sort()).toEqual(
      [1, 2],
    );
    expect([...visibleNodes({ ...base, hover: { type: "v", i: 2 } })].sort()).toEqual([1, 2, 3]);
    expect([...visibleNodes({ ...base, issueVertex: 3 })].sort()).toEqual([0, 2, 3]);
  });

  it("en una línea abierta los extremos no tienen vecino al otro lado", () => {
    const open: Track = { ...square, closed: false };
    expect([...visibleNodes({ ...ctxFor(open), selection: pointSelection(0) })].sort()).toEqual([
      0, 1,
    ]);
  });

  it("con más de 6 puntos seleccionados no se muestran los vecinos", () => {
    const many: Track = {
      ...square,
      closed: false,
      points: Array.from({ length: 12 }, (_, i) => ({ x: i * 10, y: 10, radius: 0, gap: false })),
    };
    const sel = { points: [0, 2, 4, 6, 8, 10, 11], edge: null, zones: [] };
    expect([...visibleNodes({ ...ctxFor(many), selection: sel })].sort((a, b) => a - b)).toEqual(
      sel.points,
    );
  });
});
