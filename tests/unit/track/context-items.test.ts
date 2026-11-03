import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "@/application/state/trackEditorStore";
import { blankTrack } from "@/domain/track/commands";
import { build } from "@/domain/track/geometry";
import { EMPTY_SELECTION, selectAll, type Selection } from "@/domain/track/selection";
import type { Track } from "@/domain/track/types";
import {
  buildMenu,
  transformItems,
  type MenuContext,
  type MenuItem,
} from "@/ui/components/track/contextItems";
import type { Hit } from "@/ui/components/track/hitTest";

const square: Track = {
  ...blankTrack(),
  closed: true,
  points: [
    { x: 50, y: 50, radius: 0, gap: false },
    { x: 250, y: 50, radius: 0, gap: false },
    { x: 250, y: 200, radius: 0, gap: false },
    { x: 50, y: 200, radius: 0, gap: false },
  ],
  zones: [{ x: 100, y: 90, width: 40, height: 30, name: "poste" }],
};

interface Spy {
  ctx: MenuContext;
  applied: { track: Track; selection?: Selection }[];
  selections: Selection[];
  notes: string[];
  fits: number[];
}

function menu(
  hit: Hit,
  opts: { track?: Track; selection?: Selection; world?: [number, number] } = {},
): Spy & { items: MenuItem[] } {
  const track = opts.track ?? square;
  const spy: Spy = {
    applied: [],
    selections: [],
    notes: [],
    fits: [],
    ctx: undefined as unknown as MenuContext,
  };
  spy.ctx = {
    request: { x: 0, y: 0, hit, world: opts.world ?? [100, 50] },
    track,
    selection: opts.selection ?? EMPTY_SELECTION,
    geometry: build(track),
    options: { ...DEFAULT_OPTIONS },
    apply: (t, s) => spy.applied.push({ track: t, selection: s }),
    setSelection: (s) => spy.selections.push(s),
    fit: () => spy.fits.push(1),
    notify: (m) => spy.notes.push(m),
  };
  return { ...spy, items: buildMenu(spy.ctx) };
}

const labels = (items: MenuItem[]) =>
  items.flatMap((i) =>
    i.kind === "header" || i.kind === "action" || i.kind === "field" || i.kind === "buttons"
      ? [i.label]
      : [],
  );
const action = (items: MenuItem[], label: string) =>
  items.find((i) => i.kind === "action" && i.label === label) as Extract<
    MenuItem,
    { kind: "action" }
  >;
const field = (items: MenuItem[], label: string) =>
  items.find((i) => i.kind === "field" && i.label === label) as Extract<
    MenuItem,
    { kind: "field" }
  >;
const group = (items: MenuItem[], label: string) =>
  items.find((i) => i.kind === "buttons" && i.label === label) as Extract<
    MenuItem,
    { kind: "buttons" }
  >;

describe("menú de un punto", () => {
  it("ofrece radio, radios rápidos, transformar la pista y borrar", () => {
    const m = menu({ type: "v", i: 1 });
    expect(labels(m.items)).toEqual(
      expect.arrayContaining([
        "Punto 2 · giro 90°",
        "Radio",
        "Rápido",
        "Toda la pista",
        "Girar",
        "Escalar",
        "Espejo",
        "Borrar punto",
      ]),
    );
  });

  it("el radio y los radios rápidos aplican un cambio", () => {
    const m = menu({ type: "v", i: 1 });
    field(m.items, "Radio").run(25);
    expect(m.applied.at(-1)!.track.points[1].radius).toBe(25);
    group(m.items, "Rápido")
      .buttons.find((b) => b.text === "R30")!
      .run();
    expect(m.applied.at(-1)!.track.points[1].radius).toBe(30);
    group(m.items, "Rápido")
      .buttons.find((b) => b.text === "Sin curva")!
      .run();
    expect(m.applied.at(-1)!.track.points[1].radius).toBe(0);
  });

  it("borrar quita el punto y limpia la selección", () => {
    const m = menu({ type: "v", i: 1 });
    action(m.items, "Borrar punto").run();
    expect(m.applied.at(-1)!.track.points).toHaveLength(3);
    expect(m.applied.at(-1)!.selection).toEqual(EMPTY_SELECTION);
  });

  it("el último punto de un circuito abierto con 3 o más puntos ofrece cerrarlo", () => {
    const open = { ...square, closed: false };
    const m = menu({ type: "v", i: 3 }, { track: open });
    action(m.items, "Cerrar circuito aquí").run();
    expect(m.applied.at(-1)!.track.closed).toBe(true);
    expect(labels(menu({ type: "v", i: 1 }, { track: open }).items)).not.toContain(
      "Cerrar circuito aquí",
    );
  });

  it("con un grupo elegido, el menú del punto transforma y borra la selección", () => {
    const m = menu({ type: "v", i: 0 }, { selection: selectAll(square) });
    expect(labels(m.items)).toEqual(
      expect.arrayContaining(["Selección · 5 objetos", "Borrar selección"]),
    );
    action(m.items, "Borrar selección").run();
    expect(m.applied.at(-1)!.track.points).toHaveLength(0);
    expect(m.applied.at(-1)!.track.zones).toHaveLength(0);
  });
});

describe("menú de un tramo", () => {
  const edge: Hit = { type: "e", i: 0, wx: 100, wy: 50 };

  it("muestra el largo y ofrece punto, largo, corte, salida, plantillas e invertir", () => {
    const m = menu(edge);
    expect(labels(m.items)).toEqual(
      expect.arrayContaining([
        "Tramo 1 · 200 cm entre puntos",
        "Agregar punto aquí",
        "Largo",
        "Poner un corte en este tramo",
        "Poner la salida aquí",
        "Plantillas",
        "Invertir el sentido",
      ]),
    );
  });

  it("agregar punto inserta uno en el tramo y lo elige", () => {
    const m = menu(edge);
    action(m.items, "Agregar punto aquí").run();
    const last = m.applied.at(-1)!;
    expect(last.track.points).toHaveLength(5);
    expect(last.selection).toMatchObject({ points: [1] });
  });

  it("cambiar el largo mueve el punto final; un largo no positivo no hace nada", () => {
    const m = menu(edge);
    field(m.items, "Largo").run(100);
    expect(m.applied.at(-1)!.track.points[1].x).toBe(150);
    const n = m.applied.length;
    field(m.items, "Largo").run(0);
    expect(m.applied).toHaveLength(n);
  });

  it("el corte se alterna y cambia su texto", () => {
    const m = menu(edge);
    action(m.items, "Poner un corte en este tramo").run();
    expect(m.applied.at(-1)!.track.points[0].gap).toBe(true);
    const gapped: Track = {
      ...square,
      points: square.points.map((p, i) => (i === 0 ? { ...p, gap: true } : p)),
    };
    expect(labels(menu(edge, { track: gapped }).items)).toContain("Quitar el corte");
  });

  it("poner la salida aquí usa el punto del clic", () => {
    const m = menu(edge, { world: [200, 50] });
    action(m.items, "Poner la salida aquí").run();
    expect(m.applied.at(-1)!.track.start).toMatchObject({ edge: 0 });
    expect(m.applied.at(-1)!.track.start.t).toBeCloseTo(0.75, 2);
  });

  it("las 7 plantillas insertan figura hacia el lado del clic y avisan", () => {
    const m = menu(edge, { world: [100, 53] });
    const row = group(m.items, "Plantillas");
    expect(row.buttons).toHaveLength(7);
    row.buttons.find((b) => b.text === "Horquilla")!.run();
    const last = m.applied.at(-1)!;
    expect(last.track.points).toHaveLength(8);
    expect(last.selection!.points).toHaveLength(4);
    expect(m.notes.at(-1)).toMatch(/Horquilla insertada/);
  });

  it("invertir el sentido deja la pista invertida y sin selección", () => {
    const m = menu(edge);
    action(m.items, "Invertir el sentido").run();
    expect(m.applied.at(-1)!.track.points[0]).toMatchObject({ x: 50, y: 200 });
    expect(m.applied.at(-1)!.selection).toEqual(EMPTY_SELECTION);
  });
});

describe("menú de una zona", () => {
  it("duplica y borra", () => {
    const m = menu({ type: "z", i: 0 });
    expect(labels(m.items)).toEqual(["poste", "Duplicar zona", "Borrar zona"]);
    action(m.items, "Duplicar zona").run();
    expect(m.applied.at(-1)!.track.zones).toHaveLength(2);
    expect(m.applied.at(-1)!.selection).toMatchObject({ zones: [1] });
    action(m.items, "Borrar zona").run();
    expect(m.applied.at(-1)!.track.zones).toHaveLength(0);
  });

  it("duplicar con 100 zonas avisa", () => {
    const full: Track = {
      ...square,
      zones: Array.from({ length: 100 }, () => ({ x: 0, y: 0, width: 5, height: 5, name: "z" })),
    };
    const m = menu({ type: "z", i: 0 }, { track: full });
    action(m.items, "Duplicar zona").run();
    expect(m.notes.at(-1)).toMatch(/Máximo 100 zonas/);
    expect(m.applied).toHaveLength(0);
  });
});

describe("menú en el vacío", () => {
  const none: Hit = { type: "none" };

  it("ofrece seleccionar todo, nueva zona aquí, ajustar vista y transformar la pista", () => {
    const m = menu(none, { world: [150, 125] });
    expect(labels(m.items)).toEqual(
      expect.arrayContaining([
        "Seleccionar todo",
        "Nueva zona prohibida aquí",
        "Ajustar vista",
        "Toda la pista",
      ]),
    );
    action(m.items, "Seleccionar todo").run();
    expect(m.selections.at(-1)!.points).toEqual([0, 1, 2, 3]);
    action(m.items, "Ajustar vista").run();
    expect(m.fits).toHaveLength(1);
  });

  it("la zona nueva queda de 20 × 20 centrada en el clic y ajustada a la rejilla", () => {
    const m = menu(none, { world: [152, 127] });
    action(m.items, "Nueva zona prohibida aquí").run();
    const z = m.applied.at(-1)!.track.zones.at(-1)!;
    expect(z).toMatchObject({ x: 140, y: 115, width: 20, height: 20 });
  });

  it("fuera del tablero no ofrece la zona nueva", () => {
    expect(labels(menu(none, { world: [-20, 10] }).items)).not.toContain(
      "Nueva zona prohibida aquí",
    );
  });

  it("cerrar circuito solo aparece en una pista abierta con 3 o más puntos", () => {
    expect(labels(menu(none, { track: { ...square, closed: false } }).items)).toContain(
      "Cerrar circuito",
    );
    expect(labels(menu(none).items)).not.toContain("Cerrar circuito");
  });

  it("con un grupo elegido, transforma y borra la selección", () => {
    const m = menu(none, { selection: selectAll(square) });
    expect(labels(m.items)).toEqual(
      expect.arrayContaining(["Selección · 5 objetos", "Borrar selección"]),
    );
    expect(labels(m.items)).not.toContain("Toda la pista");
  });

  it("una pista vacía solo ofrece ajustar la vista", () => {
    const m = menu(none, { track: blankTrack() });
    expect(labels(m.items)).toEqual(["Nueva zona prohibida aquí", "Ajustar vista"]);
  });
});

describe("transformaciones del menú", () => {
  it("girar, escalar y reflejar aplican un paso cada uno", () => {
    const m = menu({ type: "none" });
    const items = transformItems(m.ctx, { v: [0, 1, 2, 3], z: [0] }, false);
    const spin = field(items, "Girar");
    expect(spin.value).toBe(15);
    spin.buttons!.find((b) => b.text === "↺")!.run(90);
    expect(m.applied.at(-1)!.track.points[0].x).not.toBe(50);
    spin.buttons!.find((b) => b.text === "↻")!.run(90);
    const scaleItem = field(items, "Escalar");
    scaleItem.run(200);
    expect(m.applied.at(-1)!.track.points[1].x - m.applied.at(-1)!.track.points[0].x).toBeCloseTo(
      400,
      0,
    );
    const n = m.applied.length;
    scaleItem.run(-5);
    expect(m.applied).toHaveLength(n);
    group(items, "Espejo")
      .buttons.find((b) => b.text === "↔")!
      .run();
    expect(m.applied.at(-1)!.track.points[0].x).toBe(250);
    field(items, "Radio de todos").run(12);
    expect(m.applied.at(-1)!.track.points.every((p) => p.radius === 12)).toBe(true);
  });

  it("sin puntos en el objetivo no ofrece el radio de todos", () => {
    const m = menu({ type: "none" });
    const items = transformItems(m.ctx, { v: [], z: [0] }, false);
    expect(items.some((i) => i.kind === "field" && i.label === "Radio de todos")).toBe(false);
  });

  it("usa el paso de ángulo de las opciones", () => {
    const m = menu({ type: "none" });
    m.ctx.options = { ...m.ctx.options, angStep: 45 };
    expect(field(transformItems(m.ctx, { v: [0], z: [] }, true), "Girar").value).toBe(45);
  });
});
