import { afterEach, describe, expect, it, vi } from "vitest";
import { resetThemeColors, themeColors } from "@/domain/canvas";
import { saveBlob } from "@/infrastructure/download/saveBlob";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitViewport,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "@/ui/components/track/viewport";

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
    expect(Object.keys(themeColors())).toEqual(
      expect.arrayContaining([
        "--panel2",
        "--line3",
        "--red-soft",
        "--yellow-soft",
        "--track-line",
        "--track-ink-on-paper",
      ]),
    );
  });
});

describe("descarga con Blob", () => {
  it("crea un enlace temporal con el nombre del archivo y libera la URL", () => {
    vi.useFakeTimers();
    const names: string[] = [];
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
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
