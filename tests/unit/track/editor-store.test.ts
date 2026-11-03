import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackEditorStore } from "@/application/state/trackEditorStore";
import {
  blankTrack,
  moveStartTo,
  setBoard,
  setClosed,
  setName,
  setProfile,
} from "@/domain/track/commands";
import { EXAMPLE_EIGHT, EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import {
  EMPTY_SELECTION,
  edgeSelection,
  groupSize,
  isEmptySelection,
  pointSelection,
  sameSelection,
  sanitizeSelection,
  selectAll,
  selectionTarget,
  toggleIndex,
} from "@/domain/track/selection";
import { deletePoints } from "@/domain/track/commands";

describe("selección", () => {
  it("elige un punto, un tramo o todo", () => {
    expect(pointSelection(2)).toEqual({ points: [2], edge: null, zones: [] });
    expect(edgeSelection(EXAMPLE_EIGHT, 1)).toEqual({ points: [1, 2], edge: 1, zones: [] });
    expect(edgeSelection(EXAMPLE_EIGHT, 99)).toEqual(EMPTY_SELECTION);
    expect(selectAll(EXAMPLE_TECHNIQUE).points).toHaveLength(12);
    expect(selectAll(EXAMPLE_TECHNIQUE).zones).toEqual([0]);
  });

  it("el último tramo de un circuito cerrado une el último punto con el primero", () => {
    expect(edgeSelection(EXAMPLE_EIGHT, 5)).toEqual({ points: [5, 0], edge: 5, zones: [] });
  });

  it("agrega y quita índices sin duplicar", () => {
    expect(toggleIndex([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleIndex([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("cuenta objetos, detecta vacío y compara", () => {
    expect(groupSize({ points: [0, 1], edge: null, zones: [3] })).toBe(3);
    expect(isEmptySelection(EMPTY_SELECTION)).toBe(true);
    expect(sameSelection(pointSelection(1), pointSelection(1))).toBe(true);
    expect(sameSelection(pointSelection(1), pointSelection(2))).toBe(false);
    expect(selectionTarget({ points: [1], edge: null, zones: [0] })).toEqual({ v: [1], z: [0] });
  });

  it("quita lo que ya no existe tras borrar puntos", () => {
    const after = deletePoints(EXAMPLE_EIGHT, [4, 5]);
    expect(sanitizeSelection({ points: [1, 4, 5], edge: null, zones: [] }, after).points).toEqual([
      1,
    ]);
    const open = deletePoints(EXAMPLE_EIGHT, [0, 1, 2, 3]);
    expect(sanitizeSelection({ points: [0, 1], edge: 1, zones: [] }, open).edge).toBeNull();
    const same = pointSelection(1);
    expect(sanitizeSelection(same, EXAMPLE_EIGHT)).toBe(same);
  });
});

describe("comandos del editor", () => {
  it("una pista en blanco es abierta, sin puntos ni zonas", () => {
    const t = blankTrack();
    expect(t).toMatchObject({ id: null, closed: false, points: [], zones: [], profileId: null });
    expect(t.board).toEqual({ widthCm: 300, heightCm: 250 });
  });

  it("cambia nombre, tablero y perfil sin mutar", () => {
    const t = blankTrack();
    expect(setName(t, "Otra").name).toBe("Otra");
    expect(setBoard(t, 400, 300).board).toEqual({ widthCm: 400, heightCm: 300 });
    expect(setProfile(t, "lgr2026").profileId).toBe("lgr2026");
    expect(t.name).toBe("Pista nueva");
  });

  it("cerrar necesita 3 puntos; abrir siempre se puede", () => {
    expect(
      setClosed(
        { ...EXAMPLE_EIGHT, closed: false, points: EXAMPLE_EIGHT.points.slice(0, 2) },
        true,
      ),
    ).toBeNull();
    expect(setClosed({ ...EXAMPLE_EIGHT, closed: false }, true)?.closed).toBe(true);
    expect(setClosed(EXAMPLE_EIGHT, false)?.closed).toBe(false);
    expect(setClosed(EXAMPLE_EIGHT, true)).toBe(EXAMPLE_EIGHT);
  });

  it("mueve la salida al tramo recto más cercano", () => {
    const t = moveStartTo(EXAMPLE_TECHNIQUE, 140, 120);
    expect(t.start.edge).not.toBe(EXAMPLE_TECHNIQUE.start.edge);
    expect(t.start.t).toBeGreaterThanOrEqual(0);
    expect(t.start.t).toBeLessThanOrEqual(1);
    expect(moveStartTo(blankTrack(), 10, 10).start).toEqual({ edge: 0, t: 0.5 });
  });
});

describe("almacén del editor", () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("empieza vacío con la herramienta de selección", () => {
    const s = new TrackEditorStore().getState();
    expect(s.track).toBeNull();
    expect(s.tool).toBe("select");
    expect(s.selection).toEqual(EMPTY_SELECTION);
    expect(s.options).toEqual({ radius: 15, nodes: false });
  });

  it("abre una pista y una pista nueva (con la herramienta de dibujo)", () => {
    const store = new TrackEditorStore();
    store.open(EXAMPLE_EIGHT);
    expect(store.getState().track).toBe(EXAMPLE_EIGHT);
    expect(store.getState().tool).toBe("select");
    store.newTrack();
    expect(store.getState().track).toMatchObject({ name: "Pista nueva", points: [] });
    expect(store.getState().tool).toBe("draw");
    store.close();
    expect(store.getState().track).toBeNull();
  });

  it("`apply` reemplaza la pista, ajusta la selección y avisa a los suscriptores", () => {
    const store = new TrackEditorStore();
    store.open(EXAMPLE_EIGHT);
    store.selectIssue(3);
    const seen: number[] = [];
    store.subscribe(() => seen.push(1));
    store.apply(deletePoints(EXAMPLE_EIGHT, [5]), { points: [1, 5], edge: null, zones: [] });
    expect(store.getState().track!.points).toHaveLength(5);
    expect(store.getState().selection.points).toEqual([1]);
    expect(store.getState().issueSel).toBe(-1);
    expect(seen).toHaveLength(1);
  });

  it("`apply` sin cambios no avisa, pero sí actualiza la selección", () => {
    const store = new TrackEditorStore();
    store.open(EXAMPLE_EIGHT);
    let n = 0;
    store.subscribe(() => n++);
    store.apply({ ...EXAMPLE_EIGHT });
    expect(n).toBe(0);
    store.apply({ ...EXAMPLE_EIGHT }, pointSelection(2));
    expect(store.getState().selection.points).toEqual([2]);
    expect(n).toBe(1);
  });

  it("`apply` y `preview` no hacen nada sin pista abierta", () => {
    const store = new TrackEditorStore();
    store.apply(EXAMPLE_EIGHT);
    store.preview(EXAMPLE_EIGHT);
    expect(store.getState().track).toBeNull();
  });

  it("`preview` guarda al instante pero avisa una sola vez por cuadro", () => {
    const store = new TrackEditorStore();
    store.open(EXAMPLE_EIGHT);
    let n = 0;
    store.subscribe(() => n++);
    store.preview({ ...EXAMPLE_EIGHT, name: "a" });
    store.preview({ ...EXAMPLE_EIGHT, name: "b" });
    expect(store.getState().track!.name).toBe("b");
    expect(n).toBe(0);
    frames.shift()!(0);
    expect(n).toBe(1);
    expect(frames).toHaveLength(0);
  });

  it("sin requestAnimationFrame avisa de inmediato", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("requestAnimationFrame", undefined);
    const store = new TrackEditorStore();
    store.open(EXAMPLE_EIGHT);
    let n = 0;
    store.subscribe(() => n++);
    store.preview({ ...EXAMPLE_EIGHT, name: "z" });
    expect(n).toBe(1);
  });

  it("cambia herramienta, opciones y selección; se puede dejar de escuchar", () => {
    const store = new TrackEditorStore();
    store.open(EXAMPLE_EIGHT);
    store.setTool("draw");
    expect(store.getState().tool).toBe("draw");
    store.setOptions({ radius: 20 });
    store.setOptions({ nodes: true });
    expect(store.getState().options).toEqual({ radius: 20, nodes: true });
    store.setSelection(pointSelection(9)); // fuera de rango: se descarta
    expect(store.getState().selection.points).toEqual([]);
    let n = 0;
    const off = store.subscribe(() => n++);
    store.setSelection(pointSelection(1));
    off();
    store.setSelection(pointSelection(2));
    expect(n).toBe(1);
  });

  it("al cerrar conserva las opciones del piloto", () => {
    const store = new TrackEditorStore();
    store.open(EXAMPLE_EIGHT);
    store.setOptions({ radius: 33 });
    store.close();
    expect(store.getState().options.radius).toBe(33);
  });
});
