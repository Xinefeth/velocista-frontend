import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetThemeColors, themeColors } from "@/domain/canvas";
import { saveBlob } from "@/infrastructure/download/saveBlob";
import { EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { analyze } from "@/domain/track/rules";
import { TrackCanvasController } from "@/ui/components/track/TrackCanvasController";
import type { Scene } from "@/ui/components/track/drawScene";
import { MAX_ZOOM, MIN_ZOOM, fitViewport, panBy, screenToWorld, worldToScreen, zoomAt } from "@/ui/components/track/viewport";
import { LGR_2026 } from "./fixtures";

describe("vista del lienzo", () => {
  const board = { widthCm: 300, heightCm: 250 };

  it("ajusta el tablero centrado dentro del lienzo", () => {
    const vp = fitViewport(board, 800, 600);
    const [x0, y0] = worldToScreen(vp, 0, 0);
    const [x1, y1] = worldToScreen(vp, 300, 250);
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(800);
    expect(y1).toBeGreaterThanOrEqual(0);
    expect(y0).toBeLessThanOrEqual(600);
    expect((x0 + x1) / 2).toBeCloseTo(400, 3);
    expect((y0 + y1) / 2).toBeCloseTo(300, 3);
  });

  it("de pantalla a tablero y de vuelta", () => {
    const vp = fitViewport(board, 800, 600);
    const [sx, sy] = worldToScreen(vp, 120, 80);
    const [x, y] = screenToWorld(vp, sx, sy);
    expect(x).toBeCloseTo(120, 6);
    expect(y).toBeCloseTo(80, 6);
  });

  it("el zoom mantiene fijo el punto bajo el cursor y respeta los límites", () => {
    const vp = fitViewport(board, 800, 600);
    const before = screenToWorld(vp, 300, 200);
    const z = zoomAt(vp, 2, 300, 200);
    const after = screenToWorld(z, 300, 200);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
    expect(zoomAt(vp, 1e9, 0, 0).z).toBe(MAX_ZOOM);
    expect(zoomAt(vp, 1e-9, 0, 0).z).toBe(MIN_ZOOM);
  });

  it("desplazar mueve la vista sin cambiar el zoom", () => {
    const vp = fitViewport(board, 800, 600);
    const p = panBy(vp, 10, -5);
    expect(p).toMatchObject({ z: vp.z, vx: vp.vx + 10, vy: vp.vy - 5 });
  });
});

describe("colores del tema", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--track-paper");
    resetThemeColors();
  });

  it("incluye los tokens del trazador y se actualiza al reiniciar la caché", () => {
    document.documentElement.style.setProperty("--track-paper", "uno");
    resetThemeColors();
    expect(themeColors()["--track-paper"]).toBe("uno");
    document.documentElement.style.setProperty("--track-paper", "dos");
    expect(themeColors()["--track-paper"]).toBe("uno"); // en caché
    resetThemeColors();
    expect(themeColors()["--track-paper"]).toBe("dos");
    expect(Object.keys(themeColors())).toEqual(expect.arrayContaining(["--panel2", "--line3", "--red-soft", "--yellow-soft", "--track-line", "--track-ink-on-paper"]));
  });
});

describe("controlador del lienzo (solo vista)", () => {
  let frames: FrameRequestCallback[];
  let calls: string[];
  const scene = (): Scene => ({
    track: EXAMPLE_TECHNIQUE,
    analysis: analyze(EXAMPLE_TECHNIQUE, LGR_2026),
    rules: LGR_2026,
    issueSel: -1,
  });

  const makeCanvas = () => {
    const cv = document.createElement("canvas");
    cv.getBoundingClientRect = () => ({ width: 800, height: 600, left: 10, top: 20, right: 810, bottom: 620, x: 10, y: 20, toJSON: () => ({}) });
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, prop: string) => {
        if (prop in target) return target[prop];
        return (...args: unknown[]) => {
          calls.push(prop);
          return args;
        };
      },
      set: (target, prop: string, value) => {
        target[prop] = value;
        return true;
      },
    });
    cv.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
    document.body.appendChild(cv);
    return cv;
  };

  beforeEach(() => {
    frames = [];
    calls = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("dibuja la escena y encuadra la primera vez", () => {
    const controller = new TrackCanvasController({ getScene: scene });
    const cv = makeCanvas();
    controller.render(cv);
    expect(controller.viewport).not.toBeNull();
    expect(calls).toContain("fillRect");
    expect(calls).toContain("stroke");
  });

  it("sin escena limpia el lienzo y no dibuja nada", () => {
    const controller = new TrackCanvasController({ getScene: () => null });
    controller.render(makeCanvas());
    expect(controller.viewport).toBeNull();
    expect(calls).toContain("clearRect");
    expect(calls).not.toContain("fillRect");
    expect(calls).not.toContain("stroke");
  });

  it("la rueda acerca y el arrastre desplaza, redibujando por cuadros (no por cada movimiento)", () => {
    const controller = new TrackCanvasController({ getScene: scene });
    const cv = makeCanvas();
    controller.render(cv);
    const detach = controller.attach(cv);
    const z0 = controller.viewport!.z;
    cv.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, clientX: 200, clientY: 200, cancelable: true }));
    expect(controller.viewport!.z).toBeGreaterThan(z0);
    const vx = controller.viewport!.vx;
    cv.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100 }));
    cv.dispatchEvent(new MouseEvent("pointermove", { clientX: 130, clientY: 90 }));
    cv.dispatchEvent(new MouseEvent("pointermove", { clientX: 160, clientY: 80 }));
    expect(controller.viewport!.vx).toBeCloseTo(vx + 60, 6);
    expect(frames).toHaveLength(1); // un solo cuadro pendiente aunque hubo 3 eventos
    frames.shift()!(0);
    cv.dispatchEvent(new MouseEvent("pointerup", { clientX: 160, clientY: 80 }));
    cv.dispatchEvent(new MouseEvent("pointermove", { clientX: 300, clientY: 300 }));
    expect(controller.viewport!.vx).toBeCloseTo(vx + 60, 6); // ya no arrastra
    detach();
  });

  it("los atajos solo actúan con el evento en el lienzo y no secuestran teclas del documento", () => {
    const controller = new TrackCanvasController({ getScene: scene });
    const cv = makeCanvas();
    controller.render(cv);
    const detach = controller.attach(cv);
    const z0 = controller.viewport!.z;
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
    expect(controller.viewport!.z).toBe(z0);
    const plus = new KeyboardEvent("keydown", { key: "+", cancelable: true });
    cv.dispatchEvent(plus);
    expect(controller.viewport!.z).toBeGreaterThan(z0);
    expect(plus.defaultPrevented).toBe(true);
    cv.dispatchEvent(new KeyboardEvent("keydown", { key: "0" }));
    expect(controller.viewport!.z).toBeCloseTo(z0, 6);
    const other = new KeyboardEvent("keydown", { key: "z", cancelable: true });
    cv.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    detach();
    cv.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    expect(controller.viewport!.z).toBeCloseTo(z0, 6);
  });

  it("reencuadra al cambiar de pista", () => {
    let current = scene();
    const controller = new TrackCanvasController({ getScene: () => current });
    const cv = makeCanvas();
    controller.render(cv);
    controller.zoomBy(2);
    const zoomed = controller.viewport!.z;
    controller.render(cv);
    expect(controller.viewport!.z).toBe(zoomed); // misma pista: no reencuadra
    current = { ...current, track: { ...EXAMPLE_TECHNIQUE, id: 9, board: { widthCm: 600, heightCm: 500 } } };
    controller.render(cv);
    expect(controller.viewport!.z).toBeLessThan(zoomed);
  });
});

describe("descarga con Blob", () => {
  it("crea un enlace temporal con el nombre del archivo y libera la URL", () => {
    vi.useFakeTimers();
    const names: string[] = [];
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    saveBlob("pista.svg", "<svg/>", "image/svg+xml");
    expect(names).toEqual(["pista.svg"]);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    click.mockRestore();
    vi.useRealTimers();
  });
});
