// Controlador del lienzo con el almacén real del editor: dibujo, selección, movimiento, borrado y atajos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackEditorStore, type Tool } from "@/application/state/trackEditorStore";
import { blankTrack } from "@/domain/track/commands";
import { EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { GEOMETRY_ONLY_RULES, analyze } from "@/domain/track/rules";
import type { Track } from "@/domain/track/types";
import type { Scene } from "@/ui/components/track/drawScene";
import { groupBox } from "@/ui/components/track/hitTest";
import {
  TrackCanvasController,
  type MenuRequest,
  type TrackCanvasHost,
} from "@/ui/components/track/TrackCanvasController";
import { worldToScreen } from "@/ui/components/track/viewport";

const square: Track = {
  ...blankTrack(),
  name: "Cuadro",
  closed: true,
  points: [
    { x: 50, y: 50, radius: 0, gap: false },
    { x: 250, y: 50, radius: 0, gap: false },
    { x: 250, y: 200, radius: 0, gap: false },
    { x: 50, y: 200, radius: 0, gap: false },
  ],
};

interface Harness {
  controller: TrackCanvasController;
  store: TrackEditorStore;
  cv: HTMLCanvasElement;
  notes: string[];
  coords: string[];
  /** Cuántas veces se pidió guardar (Ctrl+S). */
  saves: number[];
  /** Menús contextuales pedidos y cierres. */
  menus: MenuRequest[];
  closes: number[];
  frames: FrameRequestCallback[];
  /** Ejecuta los cuadros pendientes. */
  flush: () => void;
  /** Igual que `down/move/up` pero con coordenadas de pantalla (para las asas del grupo). */
  px: (
    type: "pointerdown" | "pointermove" | "pointerup",
    sx: number,
    sy: number,
    init?: MouseEventInit,
  ) => void;
  /** Clic derecho sobre un punto del tablero. */
  right: (x: number, y: number) => void;
  down: (x: number, y: number, init?: MouseEventInit) => void;
  move: (x: number, y: number, init?: MouseEventInit) => void;
  up: (x: number, y: number) => void;
  click: (x: number, y: number, init?: MouseEventInit) => void;
  key: (key: string, init?: KeyboardEventInit, target?: EventTarget) => KeyboardEvent;
  detach: () => void;
  tool: (tool: Tool) => void;
}

let frames: FrameRequestCallback[];
const LEFT = 10;
const TOP = 20;

function harness(
  track: Track | null,
  opts: { nodes?: boolean; tool?: Tool; snap?: boolean; template?: string } = {},
): Harness {
  const store = new TrackEditorStore();
  // Las pruebas de P1 miden coordenadas exactas: la rejilla va apagada salvo que se pida.
  store.setOptions({ snap: !!opts.snap });
  if (track) store.open(track);
  if (opts.nodes) store.setOptions({ nodes: true });
  if (opts.tool) store.setTool(opts.tool, opts.template ?? null);
  const notes: string[] = [];
  const coords: string[] = [];
  const saves: number[] = [];
  const menus: MenuRequest[] = [];
  const closes: number[] = [];
  const host: TrackCanvasHost = {
    getScene: (): Scene | null => {
      const s = store.getState();
      if (!s.track) return null;
      return {
        track: s.track,
        analysis: analyze(s.track, GEOMETRY_ONLY_RULES),
        rules: null,
        issueSel: s.issueSel,
        selection: s.selection,
        tool: s.tool,
        showNodes: s.options.nodes,
      };
    },
    getOptions: () => store.getState().options,
    getTemplate: () => store.getState().template,
    toggleSnap: () => store.setOptions({ snap: !store.getState().options.snap }),
    toggleDims: () => store.setOptions({ dims: !store.getState().options.dims }),
    openMenu: (r) => menus.push(r),
    closeMenu: () => closes.push(1),
    preview: (t) => store.preview(t),
    apply: (t, sel) => store.apply(t, sel),
    commit: (before) => store.commit(before),
    undo: () => store.undo(),
    redo: () => store.redo(),
    save: () => saves.push(1),
    setSelection: (s) => store.setSelection(s),
    setTool: (t) => store.setTool(t),
    toggleNodes: () => store.setOptions({ nodes: !store.getState().options.nodes }),
    notify: (m) => notes.push(m),
    coords: (c) => coords.push(c),
  };
  const controller = new TrackCanvasController(host);
  const cv = document.createElement("canvas");
  cv.getBoundingClientRect = () =>
    ({
      width: 800,
      height: 600,
      left: LEFT,
      top: TOP,
      right: 810,
      bottom: 620,
      x: LEFT,
      y: TOP,
      toJSON: () => ({}),
    }) as DOMRect;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) =>
      prop in target
        ? target[prop]
        : prop === "measureText"
          ? () => ({ width: 20 })
          : () => undefined,
    set: (target, prop: string, value) => {
      target[prop] = value;
      return true;
    },
  });
  cv.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  document.body.appendChild(cv);
  controller.render(cv);
  const detach = controller.attach(cv);
  const at = (x: number, y: number) => {
    const [sx, sy] = worldToScreen(controller.viewport!, x, y);
    return { clientX: LEFT + sx, clientY: TOP + sy };
  };
  const fire = (type: string, x: number, y: number, init: MouseEventInit = {}) =>
    cv.dispatchEvent(new MouseEvent(type, { ...at(x, y), button: 0, bubbles: true, ...init }));
  return {
    controller,
    store,
    cv,
    notes,
    coords,
    saves,
    menus,
    closes,
    frames,
    flush: () => {
      while (frames.length) frames.shift()!(0);
    },
    px: (type, sx, sy, init = {}) =>
      cv.dispatchEvent(
        new MouseEvent(type, {
          clientX: LEFT + sx,
          clientY: TOP + sy,
          button: 0,
          bubbles: true,
          ...init,
        }),
      ),
    right: (x, y) => fire("contextmenu", x, y, { button: 2, cancelable: true }),
    down: (x, y, init) => fire("pointerdown", x, y, init),
    move: (x, y, init) => fire("pointermove", x, y, init),
    up: (x, y) => fire("pointerup", x, y),
    click: (x, y, init) => {
      fire("pointerdown", x, y, init);
      fire("pointerup", x, y, init);
    },
    key: (key, init = {}, target = document.body) => {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(e);
      return e;
    },
    detach,
    tool: (t) => store.setTool(t),
  };
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const pts = (h: Harness) => h.store.getState().track!.points;
const sel = (h: Harness) => h.store.getState().selection;

describe("herramienta de dibujo", () => {
  it("cada clic agrega un punto con el radio por defecto, redondeado a 0,1 cm", () => {
    const h = harness(blankTrack(), { tool: "draw" });
    h.click(100.04, 120.06);
    h.click(200, 120);
    h.click(200, 40);
    expect(pts(h)).toHaveLength(3);
    expect(pts(h)[0]).toMatchObject({ radius: 15, gap: false });
    expect(Math.abs(pts(h)[0].x - 100)).toBeLessThan(0.2);
    expect(sel(h).points).toEqual([2]);
  });

  it("un clic en el primer punto con 3 o más puntos cierra el circuito y vuelve a seleccionar", () => {
    const h = harness({ ...square, closed: false }, { tool: "draw" });
    h.click(50, 50);
    expect(h.store.getState().track!.closed).toBe(true);
    expect(h.store.getState().tool).toBe("select");
    expect(h.notes).toContain("Circuito cerrado.");
  });

  it("con menos de 3 puntos, un clic en el primer punto no cierra: lo selecciona", () => {
    const base: Track = { ...square, closed: false, points: square.points.slice(0, 2) };
    const h = harness(base, { tool: "draw" });
    h.click(50, 50);
    expect(h.store.getState().track!.closed).toBe(false);
    expect(sel(h).points).toEqual([0]);
    expect(h.store.getState().tool).toBe("draw");
  });

  it("con el circuito cerrado, clic sobre un tramo inserta un punto que se puede arrastrar", () => {
    const h = harness(square, { tool: "draw" });
    h.down(150, 50);
    expect(pts(h)).toHaveLength(5);
    expect(pts(h)[1]).toMatchObject({ y: 50, radius: 15 });
    h.move(150, 90);
    h.up(150, 90);
    expect(pts(h)[1].y).toBeGreaterThan(80);
    expect(sel(h).points).toEqual([1]);
  });

  it("con el circuito cerrado, clic en el vacío avisa y no agrega nada", () => {
    const h = harness(square, { tool: "draw" });
    h.click(150, 125);
    expect(pts(h)).toHaveLength(4);
    expect(h.notes.at(-1)).toMatch(/ya está cerrado/);
  });

  it("muestra el punto fantasma y las coordenadas al mover el ratón", () => {
    const h = harness(blankTrack(), { tool: "draw" });
    h.move(120, 80);
    expect(h.coords.at(-1)).toBe("x 120 · y 80 cm");
    h.cv.dispatchEvent(new MouseEvent("pointerleave"));
    expect(h.coords.at(-1)).toBe("");
  });
});

describe("herramienta de selección", () => {
  it("clic en un punto lo selecciona y Mayús+clic agrega otro o lo quita", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    expect(sel(h).points).toEqual([0]);
    h.click(250, 50, { shiftKey: true });
    expect(sel(h).points).toEqual([0, 1]);
    h.click(250, 50, { shiftKey: true });
    expect(sel(h).points).toEqual([0]);
  });

  it("clic en un tramo selecciona sus dos puntos y el tramo", () => {
    const h = harness(square, { nodes: true });
    h.click(100, 50);
    expect(sel(h)).toMatchObject({ points: [0, 1], edge: 0 });
  });

  it("clic en el vacío limpia la selección", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    h.click(150, 125);
    expect(sel(h).points).toEqual([]);
  });

  it("arrastrar un punto lo mueve y el resto de la pista no cambia", () => {
    const h = harness(square, { nodes: true });
    h.down(50, 50);
    h.move(60, 70);
    h.move(70, 90);
    h.up(70, 90);
    const p = pts(h);
    expect(p[0].x).toBeCloseTo(70, 0);
    expect(p[0].y).toBeCloseTo(90, 0);
    expect(p.slice(1)).toEqual(square.points.slice(1));
  });

  it("los movimientos del arrastre avisan a React una vez por cuadro", () => {
    const h = harness(square, { nodes: true });
    const calls: number[] = [];
    h.store.subscribe(() => calls.push(1));
    h.down(50, 50);
    h.move(55, 55);
    h.move(60, 60);
    h.move(65, 65);
    expect(calls.length).toBe(1 + 0); // solo el aviso de la selección; los movimientos esperan al cuadro
    h.flush();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    h.up(65, 65);
  });

  it("arrastrar un punto de un grupo mueve todo el grupo", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    h.click(250, 50, { shiftKey: true });
    h.down(250, 50, { shiftKey: false });
    h.move(260, 60);
    h.up(260, 60);
    const p = pts(h);
    expect(p[0].x).toBeCloseTo(60, 0);
    expect(p[1].x).toBeCloseTo(260, 0);
    expect(p[0].y).toBeCloseTo(60, 0);
    expect(p[2]).toEqual(square.points[2]);
  });

  it("arrastrar la bandera cambia el tramo y la posición de la salida", () => {
    const h = harness(square);
    expect(h.store.getState().track!.start).toEqual({ edge: 0, t: 0.5 });
    h.down(150, 50); // la bandera está al 50 % del tramo 0
    h.move(150, 200);
    h.up(150, 200);
    expect(h.store.getState().track!.start.edge).toBe(2);
    expect(sel(h).points).toEqual([]);
  });

  it("un recuadro de arrastre selecciona los puntos de dentro; con Mayús suma a lo elegido", () => {
    const h = harness(square, { nodes: true });
    h.down(150, 125);
    h.move(300, 10);
    h.up(300, 10);
    h.flush();
    expect(sel(h).points.sort()).toEqual([1]);
    h.down(10, 220, { shiftKey: true });
    h.move(100, 150, { shiftKey: true });
    h.up(100, 150);
    expect(sel(h).points.sort()).toEqual([1, 3]);
  });

  it("un recuadro diminuto no selecciona nada", () => {
    const h = harness(square, { nodes: true });
    h.click(150, 125);
    expect(sel(h).points).toEqual([]);
  });

  it("doble clic sobre un tramo inserta un punto", () => {
    const h = harness(square, { nodes: true });
    const [sx, sy] = worldToScreen(h.controller.viewport!, 100, 50);
    h.cv.dispatchEvent(
      new MouseEvent("dblclick", { clientX: LEFT + sx, clientY: TOP + sy, bubbles: true }),
    );
    expect(pts(h)).toHaveLength(5);
    expect(sel(h).points).toEqual([1]);
  });
});

describe("atajos de teclado", () => {
  it("Supr y Retroceso borran los puntos seleccionados", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    h.click(250, 50, { shiftKey: true });
    const e = h.key("Delete");
    expect(e.defaultPrevented).toBe(true);
    expect(pts(h)).toHaveLength(2);
    expect(sel(h).points).toEqual([]);
    h.click(50, 200);
    h.key("Backspace");
    expect(pts(h).length).toBeLessThan(4);
  });

  it("borrar sin selección no consume la tecla", () => {
    const h = harness(square, { nodes: true });
    expect(h.key("Delete").defaultPrevented).toBe(false);
    expect(pts(h)).toHaveLength(4);
  });

  it("borrar hasta quedar con menos de 3 puntos abre el circuito", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    h.key("Delete");
    expect(pts(h)).toHaveLength(3);
    h.store.setSelection({ points: [0, 1], edge: null, zones: [] });
    h.key("Delete");
    expect(h.store.getState().track!.closed).toBe(false);
  });

  it("V, P y D cambian de herramienta; Enter y Esc vuelven a seleccionar", () => {
    const h = harness(square);
    h.key("p");
    expect(h.store.getState().tool).toBe("draw");
    h.key("Enter");
    expect(h.store.getState().tool).toBe("select");
    h.key("d");
    expect(h.store.getState().tool).toBe("draw");
    h.key("Escape");
    expect(h.store.getState().tool).toBe("select");
    h.key("p");
    h.key("v");
    expect(h.store.getState().tool).toBe("select");
  });

  it("Esc con la herramienta de selección limpia la selección", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    h.key("Escape");
    expect(sel(h).points).toEqual([]);
  });

  it("Ctrl+A selecciona todos los puntos", () => {
    const h = harness(square);
    const e = h.key("a", { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(sel(h).points).toEqual([0, 1, 2, 3]);
  });

  it("las flechas mueven la selección 1 cm (10 con Mayús); sin selección desplazan la vista", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    h.key("ArrowRight");
    h.key("ArrowUp", { shiftKey: true });
    expect(pts(h)[0]).toMatchObject({ x: 51, y: 60 });
    h.key("Escape");
    const vx = h.controller.viewport!.vx;
    h.key("ArrowLeft");
    expect(h.controller.viewport!.vx).toBeGreaterThan(vx);
  });

  it("N alterna los puntos; 0, + y − ajustan la vista", () => {
    const h = harness(square);
    h.key("n");
    expect(h.store.getState().options.nodes).toBe(true);
    const z0 = h.controller.viewport!.z;
    h.key("+");
    expect(h.controller.viewport!.z).toBeGreaterThan(z0);
    h.key("-");
    h.key("0");
    expect(h.controller.viewport!.z).toBeCloseTo(z0, 6);
  });

  it("no actúan con el foco en un campo de texto", () => {
    const h = harness(square, { nodes: true });
    const input = document.createElement("input");
    document.body.appendChild(input);
    h.click(50, 50);
    expect(h.key("Delete", {}, input).defaultPrevented).toBe(false);
    expect(h.key("p", {}, input).defaultPrevented).toBe(false);
    expect(pts(h)).toHaveLength(4);
    expect(h.store.getState().tool).toBe("select");
    const select = document.createElement("select");
    document.body.appendChild(select);
    h.key("p", {}, select);
    expect(h.store.getState().tool).toBe("select");
  });

  it("dejan de actuar al desmontar el lienzo", () => {
    const h = harness(square);
    h.detach();
    h.key("p");
    expect(h.store.getState().tool).toBe("select");
  });

  it("las teclas sin función no se consumen", () => {
    const h = harness(square);
    expect(h.key("q").defaultPrevented).toBe(false);
    expect(h.key("q", { ctrlKey: true }).defaultPrevented).toBe(false);
  });
});

describe("vista", () => {
  it("la rueda acerca y el botón central o Espacio+arrastre desplazan", () => {
    const h = harness(square);
    const z0 = h.controller.viewport!.z;
    h.cv.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -200, clientX: 200, clientY: 200, cancelable: true }),
    );
    expect(h.controller.viewport!.z).toBeGreaterThan(z0);

    const vx = h.controller.viewport!.vx;
    h.down(150, 125, { button: 1 });
    h.move(170, 125, { button: 1 });
    h.up(170, 125);
    expect(h.controller.viewport!.vx).not.toBe(vx);
    expect(sel(h).points).toEqual([]);

    const vx2 = h.controller.viewport!.vx;
    h.key(" ");
    h.down(150, 125);
    h.move(100, 125);
    h.up(100, 125);
    expect(h.controller.viewport!.vx).toBeLessThan(vx2);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
  });

  it("sin escena limpia el lienzo y no dibuja", () => {
    const h = harness(null);
    expect(h.controller.viewport).toBeNull();
    h.cv.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100 }));
    expect(h.store.getState().selection.points).toEqual([]);
  });

  it("reencuadra al abrir una pista con otro tablero", () => {
    const h = harness(EXAMPLE_TECHNIQUE);
    h.controller.zoomBy(2);
    const z = h.controller.viewport!.z;
    h.store.open({ ...EXAMPLE_TECHNIQUE, id: 9, board: { widthCm: 600, heightCm: 500 } });
    h.controller.render(h.cv);
    expect(h.controller.viewport!.z).toBeLessThan(z);
  });
});

describe("historial y guardado desde el teclado", () => {
  const steps = (h: Harness) => h.store.getState().history.past.length;

  it("arrastrar un punto es UN paso de historial, aunque haya muchos movimientos", () => {
    const h = harness(square, { nodes: true });
    h.down(50, 50);
    h.move(60, 60);
    h.move(70, 80);
    h.move(80, 100);
    h.up(80, 100);
    expect(steps(h)).toBe(1);
    expect(h.store.getState().dirty).toBe(true);
    h.key("z", { ctrlKey: true });
    expect(pts(h)).toEqual(square.points);
    expect(h.store.getState().dirty).toBe(false);
    h.key("y", { ctrlKey: true });
    expect(pts(h)[0].x).toBeCloseTo(80, 0);
  });

  it("Ctrl+Mayús+Z también rehace", () => {
    const h = harness(square, { nodes: true });
    h.down(50, 50);
    h.move(90, 90);
    h.up(90, 90);
    h.key("z", { ctrlKey: true });
    h.key("z", { ctrlKey: true, shiftKey: true });
    expect(pts(h)[0].x).toBeGreaterThan(80);
  });

  it("un clic sin mover no deja pasos ni cambios pendientes", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    expect(steps(h)).toBe(0);
    expect(h.store.getState().dirty).toBe(false);
  });

  it("arrastrar y volver al mismo sitio no deja cambios pendientes", () => {
    const h = harness(square, { nodes: true });
    h.down(50, 50);
    h.move(90, 90);
    h.move(50, 50);
    h.up(50, 50);
    expect(steps(h)).toBe(0);
    expect(h.store.getState().dirty).toBe(false);
  });

  it("insertar un punto sobre un tramo y arrastrarlo es un solo paso", () => {
    const h = harness(square, { tool: "draw" });
    h.down(150, 50);
    h.move(150, 90);
    h.up(150, 90);
    expect(pts(h)).toHaveLength(5);
    expect(steps(h)).toBe(1);
    h.key("z", { ctrlKey: true });
    expect(pts(h)).toHaveLength(4);
  });

  it("cada punto dibujado es un paso y deshacer quita el último", () => {
    const h = harness(blankTrack(), { tool: "draw" });
    h.click(60, 60);
    h.click(200, 60);
    h.click(200, 160);
    expect(steps(h)).toBe(3);
    h.key("z", { ctrlKey: true });
    expect(pts(h)).toHaveLength(2);
    h.key("z", { ctrlKey: true });
    h.key("z", { ctrlKey: true });
    h.key("z", { ctrlKey: true }); // sin más pasos: no pasa nada
    expect(pts(h)).toHaveLength(0);
  });

  it("mover la bandera y borrar puntos son pasos que se deshacen", () => {
    const h = harness(square, { nodes: true });
    h.down(150, 50);
    h.move(150, 200);
    h.up(150, 200);
    expect(steps(h)).toBe(1);
    h.click(50, 50);
    h.key("Delete");
    expect(steps(h)).toBe(2);
    h.key("z", { ctrlKey: true });
    h.key("z", { ctrlKey: true });
    expect(h.store.getState().track).toEqual(square);
  });

  it("Ctrl+S pide guardar y no deja que el navegador guarde la página", () => {
    const h = harness(square);
    const e = h.key("s", { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(h.saves).toHaveLength(1);
  });

  it("Ctrl+Z, Ctrl+Y y Ctrl+S dentro de un campo de texto no se tocan", () => {
    const h = harness(square, { nodes: true });
    h.down(50, 50);
    h.move(90, 90);
    h.up(90, 90);
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(h.key("z", { ctrlKey: true }, input).defaultPrevented).toBe(false);
    expect(h.key("s", { ctrlKey: true }, input).defaultPrevented).toBe(false);
    expect(steps(h)).toBe(1);
    expect(h.saves).toHaveLength(0);
  });
});

describe("ajuste a rejilla y ángulo", () => {
  it("dibujar ajusta a la rejilla; Alt la desactiva", () => {
    const h = harness(blankTrack(), { tool: "draw", snap: true });
    h.click(101.9, 63.2);
    h.click(150.7, 80.4, { altKey: true });
    expect(pts(h)[0]).toMatchObject({ x: 100, y: 65 });
    expect(Math.abs(pts(h)[1].x - 150.7)).toBeLessThan(0.3);
    expect(Math.abs(pts(h)[1].y - 80.4)).toBeLessThan(0.3);
  });

  it("Mayús al dibujar ajusta el ángulo respecto al último punto", () => {
    const h = harness(blankTrack(), { tool: "draw", snap: true });
    h.click(60, 60);
    h.click(150, 80, { shiftKey: true });
    const [a, b] = pts(h);
    expect(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)).toBeCloseTo(15, 0);
  });

  it("al arrastrar, el punto de referencia se ajusta a la rejilla", () => {
    const h = harness(square, { nodes: true, snap: true });
    h.down(50, 50);
    h.move(63, 62);
    h.up(63, 62);
    expect(pts(h)[0]).toMatchObject({ x: 65, y: 60 });
  });

  it("las flechas mueven el paso de la rejilla (1 cm si está apagada) y G la alterna", () => {
    const h = harness(square, { nodes: true, snap: true });
    h.click(50, 50);
    h.key("ArrowRight");
    expect(pts(h)[0].x).toBe(55);
    h.key("g");
    expect(h.store.getState().options.snap).toBe(false);
    h.key("ArrowRight");
    expect(pts(h)[0].x).toBe(56);
  });
});

describe("zonas", () => {
  const withZone: Track = {
    ...square,
    zones: [{ x: 100, y: 90, width: 40, height: 30, name: "poste" }],
  };

  it("la herramienta de zona dibuja un rectángulo con nombre y lo selecciona", () => {
    const h = harness(square, { tool: "zone" });
    h.down(100, 100);
    h.move(140, 130);
    h.up(140, 130);
    h.flush();
    const t = h.store.getState().track!;
    expect(t.zones).toEqual([{ x: 100, y: 100, width: 40, height: 30, name: "zona 1" }]);
    expect(sel(h).zones).toEqual([0]);
    expect(h.store.getState().history.past).toHaveLength(1);
  });

  it("un arrastre diminuto no crea zona", () => {
    const h = harness(square, { tool: "zone" });
    h.down(100, 100);
    h.move(101, 101);
    h.up(101, 101);
    expect(h.store.getState().track!.zones).toHaveLength(0);
  });

  it("no pasa de 100 zonas", () => {
    const full: Track = {
      ...square,
      zones: Array.from({ length: 100 }, (_, i) => ({
        x: 5 + i,
        y: 5,
        width: 3,
        height: 3,
        name: "z" + i,
      })),
    };
    const h = harness(full, { tool: "zone" });
    h.down(150, 120);
    h.move(180, 150);
    h.up(180, 150);
    expect(h.store.getState().track!.zones).toHaveLength(100);
    expect(h.notes.at(-1)).toMatch(/Máximo 100 zonas/);
  });

  it("con la rejilla, la zona nueva queda en múltiplos del paso", () => {
    const h = harness(square, { tool: "zone", snap: true });
    h.down(101, 103);
    h.move(139, 128);
    h.up(139, 128);
    expect(h.store.getState().track!.zones[0]).toMatchObject({
      x: 100,
      y: 105,
      width: 40,
      height: 25,
    });
  });

  it("en selección, clic dentro de una zona la elige y arrastrarla la mueve (un solo paso)", () => {
    const h = harness(withZone);
    h.down(120, 105);
    expect(sel(h).zones).toEqual([0]);
    h.move(140, 115);
    h.move(150, 125);
    h.up(150, 125);
    expect(h.store.getState().track!.zones[0]).toMatchObject({ x: 130, y: 110 });
    expect(h.store.getState().history.past).toHaveLength(1);
  });

  it("la esquina inferior derecha de la zona elegida la redimensiona", () => {
    const h = harness(withZone);
    h.click(120, 105);
    h.down(140, 90); // asa: (x + ancho, y)
    h.move(170, 80);
    h.up(170, 80);
    expect(h.store.getState().track!.zones[0]).toMatchObject({
      x: 100,
      y: 80,
      width: 70,
      height: 40,
    });
  });

  it("Mayús+clic suma zonas a la selección y un recuadro solo toma las que caben enteras", () => {
    const two: Track = {
      ...withZone,
      zones: [...withZone.zones, { x: 180, y: 90, width: 30, height: 30, name: "logo" }],
    };
    const h = harness(two);
    h.click(120, 105);
    h.click(195, 105, { shiftKey: true });
    expect(sel(h).zones).toEqual([0, 1]);
    h.key("Escape");
    h.down(95, 130);
    h.move(150, 85); // cubre entera la primera zona y solo parte de la segunda
    h.up(150, 85);
    expect(sel(h).zones).toEqual([0]);
  });

  it("Supr borra las zonas elegidas y Z cambia a la herramienta de zona", () => {
    const h = harness(withZone);
    h.click(120, 105);
    h.key("Delete");
    expect(h.store.getState().track!.zones).toHaveLength(0);
    h.key("z");
    expect(h.store.getState().tool).toBe("zone");
  });

  it("un punto y una zona elegidos se mueven juntos", () => {
    const h = harness(withZone, { nodes: true });
    h.click(50, 50);
    h.click(120, 105, { shiftKey: true });
    expect(sel(h)).toMatchObject({ points: [0], zones: [0] });
    h.down(50, 50);
    h.move(60, 60);
    h.up(60, 60);
    expect(pts(h)[0]).toMatchObject({ x: 60, y: 60 });
    expect(h.store.getState().track!.zones[0]).toMatchObject({ x: 110, y: 100 });
  });
});

describe("edición de grupo y transformaciones", () => {
  const box = (h: Harness) =>
    groupBox({
      track: h.store.getState().track!,
      selection: h.store.getState().selection,
      vp: h.controller.viewport!,
    })!;

  it("con 2 o más objetos aparece el recuadro y se puede mover arrastrando por dentro", () => {
    const h = harness(square, { nodes: true });
    h.key("a", { ctrlKey: true });
    const b = box(h);
    expect(b).not.toBeNull();
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    h.px("pointerdown", cx, cy);
    h.px("pointermove", cx + 20, cy);
    h.px("pointerup", cx + 20, cy);
    expect(pts(h)[0].x).toBeGreaterThan(50);
    expect(pts(h)[0].y).toBeCloseTo(50, 0);
    expect(h.store.getState().history.past).toHaveLength(1);
  });

  it("arrastrar el asa de giro gira el grupo en pasos del ángulo y es un solo paso", () => {
    const h = harness(square, { nodes: true });
    h.key("a", { ctrlKey: true });
    const b = box(h);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    h.px("pointerdown", b.rx, b.ry); // asa encima del centro
    h.px("pointermove", cx + 100, cy); // a la derecha: -90°
    h.px("pointerup", cx + 100, cy);
    expect(h.store.getState().history.past).toHaveLength(1);
    // Un cuadrado de 200 × 150 girado 90° ocupa 150 de ancho, centrado en x = 150.
    const xs = pts(h)
      .map((p) => p.x)
      .sort((a, c) => a - c);
    expect(xs[0]).toBeCloseTo(75, 0);
    expect(xs[3]).toBeCloseTo(225, 0);
  });

  it("Alt desactiva el paso de ángulo al girar", () => {
    const h = harness(square, { nodes: true });
    h.key("a", { ctrlKey: true });
    const b = box(h);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    h.px("pointerdown", b.rx, b.ry);
    h.px("pointermove", cx + 100, cy - 20, { altKey: true });
    h.px("pointerup", cx + 100, cy - 20);
    const a = pts(h)[0];
    const orig = square.points[0];
    const angle = Math.atan2(a.y - 125, a.x - 150) - Math.atan2(orig.y - 125, orig.x - 150);
    expect(Math.abs(((angle * 180) / Math.PI) % 15)).toBeGreaterThan(0.5);
  });

  it("arrastrar una esquina escala el grupo (radios incluidos)", () => {
    const rounded: Track = { ...square, points: square.points.map((p) => ({ ...p, radius: 10 })) };
    const h = harness(rounded, { nodes: true });
    h.key("a", { ctrlKey: true });
    const b = box(h);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const [px, py] = b.corners[1];
    h.px("pointerdown", px, py);
    h.px("pointermove", cx + (px - cx) * 2, cy + (py - cy) * 2);
    h.px("pointerup", px, py);
    expect(pts(h)[0].radius).toBe(20);
    expect(pts(h)[1].x - pts(h)[0].x).toBeCloseTo(400, 0);
  });

  it("R gira la selección, Mayús+R al otro lado, M y Mayús+M reflejan", () => {
    const h = harness(square, { nodes: true });
    h.key("a", { ctrlKey: true });
    h.key("r");
    expect(pts(h)[0].x).not.toBe(50);
    h.key("r", { shiftKey: true });
    expect(pts(h)[0]).toMatchObject({ x: 50, y: 50 });
    h.key("m");
    expect(pts(h)[0].x).toBe(250);
    h.key("m", { shiftKey: true });
    expect(pts(h)[0]).toMatchObject({ x: 250, y: 200 });
  });

  it("R y M con un solo objeto avisan en vez de actuar", () => {
    const h = harness(square, { nodes: true });
    h.click(50, 50);
    h.key("r");
    expect(h.notes.at(-1)).toMatch(/varios objetos para girar/);
    h.key("m");
    expect(h.notes.at(-1)).toMatch(/varios objetos para reflejar/);
    expect(pts(h)).toEqual(square.points);
  });
});

describe("plantillas", () => {
  it("un clic sobre un tramo inserta la figura y deja sus puntos elegidos", () => {
    const h = harness(square, { tool: "tpl", template: "dedo" });
    h.click(100, 50);
    expect(pts(h)).toHaveLength(8);
    expect(sel(h).points).toHaveLength(4);
    expect(h.notes.at(-1)).toMatch(/Horquilla insertada/);
    expect(h.store.getState().history.past).toHaveLength(1);
  });

  it("el lado depende de dónde se hace el clic respecto al tramo", () => {
    const up = harness(square, { tool: "tpl", template: "joroba" });
    up.click(100, 53);
    const down = harness(square, { tool: "tpl", template: "joroba" });
    down.click(100, 47);
    const yUp = Math.max(...pts(up).map((p) => p.y));
    const yDown = Math.min(...pts(down).map((p) => p.y));
    expect(yUp).toBeGreaterThan(50);
    expect(yDown).toBeLessThan(50);
  });

  it("fuera de un tramo, o sin plantilla, avisa y no inserta", () => {
    const h = harness(square, { tool: "tpl", template: "dedo" });
    h.click(150, 125);
    expect(h.notes.at(-1)).toMatch(/tramo recto/);
    const none = harness(square, { tool: "tpl" });
    none.click(100, 50);
    expect(pts(none)).toHaveLength(4);
  });
});

describe("menú contextual", () => {
  it("clic derecho sobre un punto lo elige y pide el menú", () => {
    const h = harness(square, { nodes: true });
    h.right(50, 50);
    expect(h.menus).toHaveLength(1);
    expect(h.menus[0].hit).toMatchObject({ type: "v", i: 0 });
    expect(sel(h).points).toEqual([0]);
  });

  it("sobre un tramo elige el tramo; sobre una zona, la zona; en el vacío no cambia la selección", () => {
    const zoned: Track = {
      ...square,
      zones: [{ x: 100, y: 90, width: 40, height: 30, name: "poste" }],
    };
    const h = harness(zoned, { nodes: true });
    h.right(200, 50);
    expect(sel(h)).toMatchObject({ edge: 0, points: [0, 1] });
    h.right(120, 105);
    expect(sel(h).zones).toEqual([0]);
    expect(h.menus.at(-1)!.hit.type).toBe("z");
    h.key("a", { ctrlKey: true });
    h.right(280, 230); // fuera de la pista
    expect(sel(h).points.length).toBe(4);
    expect(h.menus.at(-1)!.hit.type).toBe("none");
  });

  it("el menú del navegador se bloquea y el punto del tablero viaja en la petición", () => {
    const h = harness(square);
    const e = new MouseEvent("contextmenu", {
      clientX: 300,
      clientY: 300,
      cancelable: true,
      bubbles: true,
    });
    h.cv.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(h.menus[0].world).toHaveLength(2);
  });

  it("Esc, la rueda y un nuevo clic cierran el menú", () => {
    const h = harness(square);
    h.key("Escape");
    expect(h.closes.length).toBe(1);
    h.cv.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, cancelable: true }));
    expect(h.closes.length).toBe(2);
    h.click(150, 125);
    expect(h.closes.length).toBeGreaterThanOrEqual(3);
  });
});
