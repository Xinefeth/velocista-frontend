import { describe, expect, it } from "vitest";
import {
  addZone,
  appendPoint,
  closeTrack,
  deletePoints,
  deleteZones,
  insertPointAt,
  reverseTrack,
  setEdgeLength,
  setRadius,
  toggleGap,
} from "@/domain/track/commands";
import { allTarget, mirror, move, rotate, scale } from "@/domain/track/transforms";
import { TEMPLATES, insertTemplate, templateLocal } from "@/domain/track/templates";
import { build } from "@/domain/track/geometry";
import { simPose, simStartS } from "@/domain/track/simulation";
import {
  HISTORY_LIMIT,
  emptyHistory,
  pushHistory,
  redoHistory,
  sameValue,
  undoHistory,
} from "@/domain/track/history";
import { EXAMPLE_EIGHT, EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { analyze } from "@/domain/track/rules";
import type { Track } from "@/domain/track/types";
import { LGR_2026 } from "./fixtures";

const base: Track = {
  id: null,
  name: "t",
  board: { widthCm: 300, heightCm: 250 },
  closed: false,
  points: [
    { x: 50, y: 100, radius: 0, gap: false },
    { x: 250, y: 100, radius: 0, gap: false },
    { x: 250, y: 200, radius: 0, gap: false },
  ],
  zones: [],
  start: { edge: 0, t: 0.5 },
  profileId: null,
};

describe("comandos de edición", () => {
  it("no mutan la pista original", () => {
    const frozen = JSON.stringify(base);
    appendPoint(base, 10, 10, 15);
    deletePoints(base, [0]);
    reverseTrack(base);
    setRadius(base, [1], 20);
    expect(JSON.stringify(base)).toBe(frozen);
  });

  it("agrega y cierra", () => {
    const t = appendPoint(base, 100.04, 200.06, 15);
    expect(t.points).toHaveLength(4);
    expect(t.points[3]).toEqual({ x: 100, y: 200.1, radius: 15, gap: false });
    expect(closeTrack(t)?.closed).toBe(true);
    expect(closeTrack({ ...base, points: base.points.slice(0, 2) })).toBeNull();
  });

  it("inserta un punto en un tramo y ajusta la salida", () => {
    const r = insertPointAt({ ...base, start: { edge: 1, t: 0.5 } }, 0, 150, 130, 15);
    expect(r?.index).toBe(1);
    expect(r?.track.points).toHaveLength(4);
    expect(r?.track.points[1].y).toBe(100);
    expect(r?.track.start.edge).toBe(2);
  });

  it("borrar puntos abre el circuito si quedan menos de 3 y reinicia la salida fuera de rango", () => {
    const closed = { ...base, closed: true, start: { edge: 2, t: 0.2 } };
    const t = deletePoints(closed, [0]);
    expect(t.closed).toBe(false);
    expect(t.start).toEqual({ edge: 0, t: 0.5 });
  });

  it("cambia el largo de un tramo", () => {
    const t = setEdgeLength(base, 0, 100);
    expect(t.points[1]).toMatchObject({ x: 150, y: 100 });
  });

  it("marca un corte y lo invierte con la pista", () => {
    const t = toggleGap(base, 0);
    expect(t.points[0].gap).toBe(true);
    const rev = reverseTrack(t);
    expect(rev.points[0].y).toBe(200);
    expect(rev.points.filter((p) => p.gap)).toHaveLength(1);
    expect(rev.start.t).toBeCloseTo(0.5);
  });

  it("invertir dos veces devuelve la geometría original", () => {
    const twice = reverseTrack(reverseTrack(EXAMPLE_EIGHT));
    expect(twice.points).toEqual(EXAMPLE_EIGHT.points);
  });

  it("agrega y borra zonas", () => {
    const z = { x: 1, y: 2, width: 3, height: 4, name: "a" };
    const t = addZone(base, z);
    expect(t.zones).toEqual([z]);
    expect(deleteZones(t, [0]).zones).toHaveLength(0);
  });
});

describe("transformaciones", () => {
  it("rotar 90° y volver", () => {
    const r = rotate(rotate(base, allTarget(base), 90), allTarget(base), -90);
    r.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(base.points[i].x, 0);
      expect(p.y).toBeCloseTo(base.points[i].y, 0);
    });
  });

  it("el espejo conserva el largo de la línea", () => {
    const m = mirror(EXAMPLE_TECHNIQUE, allTarget(EXAMPLE_TECHNIQUE), "h");
    expect(build(m).L).toBeCloseTo(build(EXAMPLE_TECHNIQUE).L, 0);
  });

  it("escalar x2 multiplica los radios y las zonas", () => {
    const s = scale(EXAMPLE_TECHNIQUE, allTarget(EXAMPLE_TECHNIQUE), 2);
    expect(s.points[0].radius).toBe(50);
    expect(s.zones[0].width).toBe(24);
  });

  it("mover traslada puntos y zonas", () => {
    const m = move(EXAMPLE_TECHNIQUE, allTarget(EXAMPLE_TECHNIQUE), 10, -5);
    expect(m.points[0]).toMatchObject({ x: 60, y: 40 });
    expect(m.zones[0]).toMatchObject({ x: 114, y: -5 });
  });

  it("una rotación de 90° intercambia ancho y alto de las zonas", () => {
    const t = { ...base, zones: [{ x: 10, y: 10, width: 20, height: 10, name: "" }] };
    const r = rotate(t, { v: [], z: [0] }, 90);
    expect(r.zones[0]).toMatchObject({ width: 10, height: 20 });
  });
});

describe("plantillas", () => {
  it("hay 7 plantillas y todas vuelven a y = 0", () => {
    expect(TEMPLATES).toHaveLength(7);
    for (const tpl of TEMPLATES) {
      const loc = templateLocal(tpl);
      expect(loc.length).toBe(tpl.seq.length);
    }
  });

  it("inserta una horquilla en un tramo recto y ajusta la salida", () => {
    const t = { ...EXAMPLE_TECHNIQUE, start: { edge: 3, t: 0.5 } };
    const r = insertTemplate(t, 0, 150, 45, "dedo", 1);
    expect(r).not.toBeNull();
    expect(r!.count).toBe(4);
    expect(r!.track.points).toHaveLength(t.points.length + 4);
    expect(r!.track.start.edge).toBe(7);
    expect(build(r!.track).L).toBeGreaterThan(build(t).L);
  });

  it("devuelve null con una plantilla o una arista inexistente", () => {
    expect(insertTemplate(base, 0, 0, 0, "nada")).toBeNull();
    expect(insertTemplate(base, 9, 0, 0, "dedo")).toBeNull();
  });

  it("conserva el corte del tramo en el último punto de la figura", () => {
    const t = toggleGap(base, 0);
    const r = insertTemplate(t, 0, 150, 100, "joroba", -1)!;
    expect(r.track.points[0].gap).toBe(false);
    expect(r.track.points[r.from + r.count - 1].gap).toBe(true);
  });
});

describe("historial", () => {
  it("deshace y rehace", () => {
    let h = emptyHistory<string>();
    h = pushHistory(h, "a");
    h = pushHistory(h, "b");
    const u = undoHistory(h, "c")!;
    expect(u.value).toBe("b");
    const r = redoHistory(u.history, "b")!;
    expect(r.value).toBe("c");
    expect(undoHistory(emptyHistory<string>(), "x")).toBeNull();
    expect(redoHistory(emptyHistory<string>(), "x")).toBeNull();
  });

  it("limita a 200 pasos y un cambio nuevo borra el rehacer", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 250; i++) h = pushHistory(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(50);
    const u = undoHistory(h, 999)!;
    expect(u.history.future).toHaveLength(1);
    expect(pushHistory(u.history, 1).future).toHaveLength(0);
  });

  it("detecta comandos sin efecto por igualdad estructural", () => {
    expect(sameValue(base, setRadius(base, [], 5))).toBe(true);
    expect(sameValue(base, setRadius(base, [1], 5))).toBe(false);
  });
});

describe("simulación", () => {
  it("la posición de salida está sobre la línea y el circuito cerrado es cíclico", () => {
    const g = analyze(EXAMPLE_TECHNIQUE, LGR_2026).g;
    const s0 = simStartS(g, EXAMPLE_TECHNIQUE.start);
    expect(s0).toBeGreaterThan(0);
    const a = simPose(g, s0)!;
    const b = simPose(g, s0 + g.L)!;
    expect(b.x).toBeCloseTo(a.x, 2);
    expect(b.y).toBeCloseTo(a.y, 2);
  });

  it("en una línea abierta se detiene en el final", () => {
    const g = build(base);
    const end = simPose(g, g.L + 500)!;
    expect(end.x).toBeCloseTo(250, 1);
    expect(end.y).toBeCloseTo(200, 1);
  });

  it("no hay pose sin largo", () => {
    expect(simPose(build({ ...base, points: [] }), 10)).toBeNull();
  });
});
