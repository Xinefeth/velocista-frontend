// Lienzo falso para las pruebas: jsdom no dibuja, así que se registra lo que se pintaría
// (textos y rectángulos de fondo) para comprobar qué etiquetas salen y dónde.
import { vi } from "vitest";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasLog {
  texts: string[];
  /** Rectángulos de fondo de las etiquetas, en píxeles del lienzo. */
  rects: Rect[];
  width: number;
  height: number;
  reset: () => void;
}

/** Instala un `getContext` que registra `fillText` y `fillRect`, y un tamaño visible del lienzo. */
export function stubCanvas(width = 700, height = 280): CanvasLog {
  const log: CanvasLog = {
    texts: [],
    rects: [],
    width,
    height,
    reset() {
      log.texts.length = 0;
      log.rects.length = 0;
    },
  };
  const ctx = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === "measureText") return (text: string) => ({ width: text.length * 6.6 });
        if (key === "fillText") return (text: string) => void log.texts.push(text);
        if (key === "fillRect")
          return (x: number, y: number, w: number, h: number) =>
            void log.rects.push({ x, y, w, h });
        return () => undefined;
      },
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
    configurable: true,
    get: () => height,
  });
  return log;
}

/** ¿Se pisan dos rectángulos? */
export const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Los rectángulos pintados quedan dentro del lienzo y no se pisan entre sí. */
export function expectClean(log: CanvasLog) {
  if (!log.rects.length) throw new Error("no se dibujó ninguna etiqueta");
  log.rects.forEach((r, i) => {
    if (r.x < -0.01 || r.y < -0.01 || r.x + r.w > log.width + 0.01 || r.y + r.h > log.height + 0.01)
      throw new Error(
        `etiqueta fuera del lienzo: ${JSON.stringify(r)} (${log.width} × ${log.height})`,
      );
    for (const q of log.rects.slice(i + 1))
      if (overlap(r, q))
        throw new Error(`etiquetas que se pisan: ${JSON.stringify(r)} y ${JSON.stringify(q)}`);
  });
}
