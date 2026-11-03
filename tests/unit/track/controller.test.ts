// Controlador del lienzo con el almacén real del editor: dibujo, selección, movimiento, borrado y atajos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackEditorStore, type Tool } from "@/application/state/trackEditorStore";
import { blankTrack } from "@/domain/track/commands";
import { EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { GEOMETRY_ONLY_RULES, analyze } from "@/domain/track/rules";
import type { Track } from "@/domain/track/types";
import type { Scene } from "@/ui/components/track/drawScene";
import {
  TrackCanvasController,
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
  frames: FrameRequestCallback[];
  /** Ejecuta los cuadros pendientes. */
  flush: () => void;
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

function harness(track: Track | null, opts: { nodes?: boolean; tool?: Tool } = {}): Harness {
  const store = new TrackEditorStore();
  if (track) store.open(track);
  if (opts.nodes) store.setOptions({ nodes: true });
  if (opts.tool) store.setTool(opts.tool);
  const notes: string[] = [];
  const coords: string[] = [];
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
    getRadius: () => store.getState().options.radius,
    preview: (t) => store.preview(t),
    apply: (t, sel) => store.apply(t, sel),
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
    get: (target, prop: string) => (prop in target ? target[prop] : () => undefined),
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
    frames,
    flush: () => {
      while (frames.length) frames.shift()!(0);
    },
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
    expect(h.key("z", { ctrlKey: true }).defaultPrevented).toBe(false);
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
