// Trazador de pistas: dibujo, selección e inspector, actuando como el piloto (por rol y nombre accesible).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TrackTracer } from "@/ui/pages/TrackTracer";
import { fitViewport, worldToScreen } from "@/ui/components/track/viewport";
import { stubBrowser } from "./_harness";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const BOARD = { widthCm: 300, heightCm: 250 };

beforeEach(() => {
  stubBrowser();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        url.startsWith("/api/profiles")
          ? json([])
          : json({ items: [], total: 0, limit: 200, offset: 0 }),
      ),
    ),
  );
  // jsdom no tiene diseño ni 2D: se simula un lienzo de 800 × 600 sin desplazamiento.
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800,
    height: 600,
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => (prop in target ? target[prop] : () => undefined),
    set: (target, prop: string, value) => {
      target[prop] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const canvas = () => screen.getByRole("img", { name: /Plano de la pista/ });
/** Clic en un punto del tablero (cm) del lienzo simulado. */
function clickWorld(x: number, y: number, init: MouseEventInit = {}) {
  const [sx, sy] = worldToScreen(fitViewport(BOARD, 800, 600), x, y);
  const opts = { clientX: sx, clientY: sy, button: 0, bubbles: true, ...init };
  fireEvent(canvas(), new MouseEvent("pointerdown", opts));
  fireEvent(canvas(), new MouseEvent("pointerup", opts));
}
const newTrack = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Nueva pista" }));
};
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("Trazador de pistas: herramientas e inspector", () => {
  it("«Nueva pista» abre una pista en blanco con la herramienta de dibujo", async () => {
    render(<TrackTracer />);
    expect(screen.getByRole("button", { name: "Dibujar" }).hasAttribute("disabled")).toBe(true);
    await newTrack();
    expect(screen.getByText("Pista vacía")).toBeTruthy();
    expect(pressed("Dibujar")).toBe("true");
    expect(pressed("Seleccionar")).toBe("false");
    expect(screen.getByRole("textbox", { name: "Nombre de la pista" })).toHaveProperty(
      "value",
      "Pista nueva",
    );
  });

  it("no promete lo que aún no existe: sin Guardar ni Deshacer, y avisa de que no se guarda", async () => {
    render(<TrackTracer />);
    await newTrack();
    expect(screen.queryByRole("button", { name: /guardar|actualizar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /deshacer|rehacer/i })).toBeNull();
    expect(screen.getByText("Sin guardar")).toBeTruthy();
    expect(screen.getByText(/Los cambios todavía no se guardan en la API/)).toBeTruthy();
  });

  it("alterna la herramienta con los botones y con las teclas V y P", async () => {
    render(<TrackTracer />);
    await newTrack();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    expect(pressed("Seleccionar")).toBe("true");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(pressed("Dibujar")).toBe("true");
    fireEvent.keyDown(document.body, { key: "v" });
    expect(pressed("Seleccionar")).toBe("true");
  });

  it("«Puntos» muestra todos los puntos de control", async () => {
    render(<TrackTracer />);
    await newTrack();
    expect(pressed("Puntos")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Puntos" }));
    expect(pressed("Puntos")).toBe("true");
    fireEvent.keyDown(document.body, { key: "n" });
    expect(pressed("Puntos")).toBe("false");
  });

  it("dibuja con el ratón y edita el punto elegido desde el inspector", async () => {
    render(<TrackTracer />);
    await newTrack();
    clickWorld(60, 60);
    clickWorld(240, 60);
    clickWorld(240, 190);
    expect(screen.getByRole("heading", { name: "Punto 3" })).toBeTruthy();
    expect(screen.queryByText("Pista vacía")).toBeNull();

    const radius = screen.getAllByRole("textbox", {
      name: /Radio de la curva/,
    })[0] as HTMLInputElement;
    expect(radius.value).toBe("15");
    fireEvent.focus(radius);
    fireEvent.change(radius, { target: { value: "22,5" } });
    fireEvent.blur(radius);
    expect(
      (screen.getAllByRole("textbox", { name: /Radio de la curva/ })[0] as HTMLInputElement).value,
    ).toBe("22,5");

    fireEvent.click(screen.getByRole("button", { name: "Borrar punto" }));
    expect(screen.queryByRole("heading", { name: "Punto 3" })).toBeNull();
    expect(screen.getByText("Elige un punto o un tramo en el plano para editarlo.")).toBeTruthy();
  });

  it("cierra el circuito con un clic en el primer punto y vuelve a la herramienta de selección", async () => {
    render(<TrackTracer />);
    await newTrack();
    clickWorld(60, 60);
    clickWorld(240, 60);
    clickWorld(240, 190);
    expect(
      (screen.getByRole("button", { name: "Cerrar circuito" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    clickWorld(60, 60);
    expect(screen.getByRole("button", { name: "Abrir circuito" })).toBeTruthy();
    expect(pressed("Seleccionar")).toBe("true");
    expect(screen.getByText("Circuito cerrado.")).toBeTruthy();
  });

  it("no deja cerrar un circuito con menos de 3 puntos", async () => {
    render(<TrackTracer />);
    await newTrack();
    clickWorld(60, 60);
    clickWorld(240, 60);
    const close = screen.getByRole("button", { name: "Cerrar circuito" }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    expect(close.title).toMatch(/al menos 3 puntos/);
  });

  it("Ctrl+A y el botón borran varios puntos; el campo de radio muestra «varios» si difieren", async () => {
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Técnica 3 × 2,5" }));
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    expect(screen.getByRole("heading", { name: "12 puntos seleccionados" })).toBeTruthy();
    const radius = screen.getAllByRole("textbox", {
      name: /Radio de la curva/,
    })[0] as HTMLInputElement;
    expect(radius.placeholder).toBe("varios");
    expect(radius.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Borrar 12 puntos" }));
    expect(screen.getByText("Pista vacía")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar circuito" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("cambiar el radio de un grupo lo aplica a todos", async () => {
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Ocho libre" }));
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    const radius = screen.getAllByRole("textbox", {
      name: /Radio de la curva/,
    })[0] as HTMLInputElement;
    fireEvent.focus(radius);
    fireEvent.change(radius, { target: { value: "12" } });
    fireEvent.blur(radius);
    expect(
      (screen.getAllByRole("textbox", { name: /Radio de la curva/ })[0] as HTMLInputElement).value,
    ).toBe("12");
  });

  it("el nombre se edita y aparece en el encabezado del plano", async () => {
    render(<TrackTracer />);
    await newTrack();
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre de la pista" }), {
      target: { value: "Mi pista" },
    });
    expect(screen.getByText("Mi pista")).toBeTruthy();
    expect(canvas().getAttribute("aria-label")).toBe("Plano de la pista Mi pista");
  });

  it("el tamaño del tablero valida el rango y restaura el valor si no es válido", async () => {
    render(<TrackTracer />);
    await newTrack();
    const width = screen.getByRole("textbox", { name: /Ancho del tablero/ }) as HTMLInputElement;
    fireEvent.focus(width);
    fireEvent.change(width, { target: { value: "10" } });
    fireEvent.blur(width);
    expect(screen.getByRole("alert").textContent).toMatch(/Valor no válido \(50 a 2000 cm\)/);
    expect(width.value).toBe("300");
    fireEvent.focus(width);
    fireEvent.change(width, { target: { value: "420" } });
    fireEvent.blur(width);
    expect(width.value).toBe("420");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Escape cancela la edición de un campo sin aplicar (con el foco real)", async () => {
    render(<TrackTracer />);
    await newTrack();
    const height = screen.getByRole("textbox", { name: /Alto del tablero/ }) as HTMLInputElement;
    act(() => height.focus());
    fireEvent.change(height, { target: { value: "999" } });
    fireEvent.keyDown(height, { key: "Escape" });
    expect(document.activeElement).not.toBe(height);
    expect(height.value).toBe("250");
    // Enter sí aplica.
    act(() => height.focus());
    fireEvent.change(height, { target: { value: "280" } });
    fireEvent.keyDown(height, { key: "Enter" });
    expect(height.value).toBe("280");
  });

  it("invertir el sentido y abrir un circuito son comandos del inspector", async () => {
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Ocho libre" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir circuito" }));
    expect(screen.getByRole("button", { name: "Cerrar circuito" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Invertir sentido" }));
    expect(screen.getByRole("group", { name: "Circuito" })).toBeTruthy();
  });

  it("el corte se activa desde el inspector con el tramo seleccionado", async () => {
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Técnica 3 × 2,5" }));
    clickWorld(100, 45);
    expect(screen.getByRole("heading", { name: "Tramo 1" })).toBeTruthy();
    const gap = screen.getByRole("button", { name: "Corte en este tramo" });
    expect(gap.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(gap);
    expect(
      screen.getByRole("button", { name: "Corte en este tramo" }).getAttribute("aria-pressed"),
    ).toBe("true");
    const length = screen.getByRole("textbox", { name: /Largo del tramo/ }) as HTMLInputElement;
    expect(Number(length.value.replace(",", "."))).toBeGreaterThan(50);
  });

  it("la verificación se recalcula con lo que se edita", async () => {
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Ocho libre" }));
    const before = screen.getByText("Largo").nextElementSibling!.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Abrir circuito" }));
    const after = screen.getByText("Largo").nextElementSibling!.textContent;
    expect(before).not.toBe(after);
    expect(
      within(screen.getByLabelText("Estadísticas de la pista")).getByText("Puntos / cortes"),
    ).toBeTruthy();
  });
});
