// Trazador de pistas: zonas, plantillas, rejilla y ángulo, transformaciones y menú contextual,
// actuando como el piloto (por rol y nombre accesible) sobre un lienzo simulado de 800 × 600.
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
  localStorage.clear();
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
const at = (x: number, y: number) => {
  const [sx, sy] = worldToScreen(fitViewport(BOARD, 800, 600), x, y);
  return { clientX: sx, clientY: sy, button: 0, bubbles: true };
};
const click = (x: number, y: number, init: MouseEventInit = {}) => {
  fireEvent(canvas(), new MouseEvent("pointerdown", { ...at(x, y), ...init }));
  fireEvent(canvas(), new MouseEvent("pointerup", { ...at(x, y), ...init }));
};
const drag = (x0: number, y0: number, x1: number, y1: number) => {
  fireEvent(canvas(), new MouseEvent("pointerdown", at(x0, y0)));
  fireEvent(canvas(), new MouseEvent("pointermove", at((x0 + x1) / 2, (y0 + y1) / 2)));
  fireEvent(canvas(), new MouseEvent("pointermove", at(x1, y1)));
  fireEvent(canvas(), new MouseEvent("pointerup", at(x1, y1)));
};
const rightClick = (x: number, y: number) =>
  fireEvent(canvas(), new MouseEvent("contextmenu", { ...at(x, y), button: 2, cancelable: true }));
const openExample = async (name: string) =>
  fireEvent.click(await screen.findByRole("button", { name }));
const newTrack = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "Nueva pista" }));
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const stat = (label: string) => screen.getByText(label).nextElementSibling!.textContent;
const setField = (name: RegExp | string, value: string) => {
  const input = screen.getByRole("textbox", { name }) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  return input;
};
const squareOnBoard = async () => {
  await newTrack();
  click(60, 60);
  click(240, 60);
  click(240, 190);
  click(60, 190);
  click(60, 60); // cierra
};

describe("zonas", () => {
  it("el botón «Zona» y la tecla Z activan la herramienta", async () => {
    render(<TrackTracer />);
    await newTrack();
    fireEvent.click(screen.getByRole("button", { name: "Zona" }));
    expect(pressed("Zona")).toBe("true");
    expect(screen.getByText(/Arrastra para dibujar una zona/)).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "v" });
    expect(pressed("Seleccionar")).toBe("true");
    fireEvent.keyDown(document.body, { key: "z" });
    expect(pressed("Zona")).toBe("true");
  });

  it("dibujar una zona la deja elegida y el inspector permite editarla, duplicarla y borrarla", async () => {
    render(<TrackTracer />);
    await squareOnBoard();
    fireEvent.click(screen.getByRole("button", { name: "Zona" }));
    drag(100, 100, 140, 130);
    expect(screen.getByRole("heading", { name: "Zona 1" })).toBeTruthy();
    const name = screen.getByRole("textbox", { name: "Nombre de la zona" }) as HTMLInputElement;
    expect(name.value).toBe("zona 1");

    act(() => name.focus());
    fireEvent.change(name, { target: { value: "poste del cronómetro" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(
      (screen.getByRole("textbox", { name: "Nombre de la zona" }) as HTMLInputElement).value,
    ).toBe("poste del cronómetro");

    const width = screen.getByRole("textbox", { name: /^Ancho \(cm\)/ }) as HTMLInputElement;
    expect(width.value).toBe("40");
    act(() => width.focus());
    fireEvent.change(width, { target: { value: "60" } });
    fireEvent.keyDown(width, { key: "Enter" });
    expect((screen.getByRole("textbox", { name: /^Ancho \(cm\)/ }) as HTMLInputElement).value).toBe(
      "60",
    );

    fireEvent.click(screen.getByRole("button", { name: "Duplicar zona" }));
    expect(screen.getByRole("heading", { name: "Zona 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Borrar zona" }));
    expect(screen.queryByRole("heading", { name: /Zona \d/ })).toBeNull();
  });

  it("el ancho de una zona fuera de rango se rechaza", async () => {
    render(<TrackTracer />);
    await squareOnBoard();
    fireEvent.click(screen.getByRole("button", { name: "Zona" }));
    drag(100, 100, 140, 130);
    const width = screen.getByRole("textbox", { name: /^Ancho \(cm\)/ }) as HTMLInputElement;
    act(() => width.focus());
    fireEvent.change(width, { target: { value: "5000" } });
    fireEvent.keyDown(width, { key: "Enter" });
    expect(
      screen.getAllByRole("alert").some((a) => /Valor no válido/.test(a.textContent ?? "")),
    ).toBe(true);
    expect((screen.getByRole("textbox", { name: /^Ancho \(cm\)/ }) as HTMLInputElement).value).toBe(
      "40",
    );
  });

  it("Ctrl+A elige también las zonas y se pueden borrar junto con los puntos", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    expect(screen.getByRole("heading", { name: "12 puntos seleccionados" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Borrar 13 objetos" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(screen.getByText("Pista vacía")).toBeTruthy();
  });
});

describe("plantillas", () => {
  it("elegir una plantilla activa la herramienta y un clic sobre un tramo la inserta", async () => {
    render(<TrackTracer />);
    await squareOnBoard();
    const row = screen.getByRole("group", { name: "Plantillas" });
    expect(within(row).getAllByRole("button")).toHaveLength(7);
    fireEvent.click(within(row).getByRole("button", { name: "Horquilla" }));
    expect(
      within(row).getByRole("button", { name: "Horquilla" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(stat("Puntos / cortes")).toBe("4 / 0");
    click(150, 60);
    expect(stat("Puntos / cortes")).toBe("8 / 0");
    expect(screen.getByText(/Horquilla insertada/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "4 puntos seleccionados" })).toBeTruthy();
  });

  it("la ayuda explica cómo usar la plantilla elegida", async () => {
    render(<TrackTracer />);
    await newTrack();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Plantillas" })).getByRole("button", {
        name: "Joroba",
      }),
    );
    expect(screen.getByText(/Clic sobre un tramo recto para insertar la figura/)).toBeTruthy();
  });

  it("elegir otra plantilla cambia la elegida y Esc vuelve a seleccionar", async () => {
    render(<TrackTracer />);
    await squareOnBoard();
    const row = screen.getByRole("group", { name: "Plantillas" });
    fireEvent.click(within(row).getByRole("button", { name: "Omega Ω" }));
    fireEvent.click(within(row).getByRole("button", { name: "Zigzag" }));
    expect(within(row).getByRole("button", { name: "Omega Ω" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(within(row).getByRole("button", { name: "Zigzag" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(pressed("Seleccionar")).toBe("true");
    expect(within(row).getByRole("button", { name: "Zigzag" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("sin pista abierta las plantillas están desactivadas", async () => {
    render(<TrackTracer />);
    await screen.findByRole("button", { name: "Nueva pista" });
    const row = screen.getByRole("group", { name: "Plantillas" });
    for (const b of within(row).getAllByRole("button"))
      expect(b.hasAttribute("disabled")).toBe(true);
  });
});

describe("rejilla y ángulo", () => {
  it("«Rejilla» se activa por defecto (5 cm) y el paso solo se puede cambiar con ella encendida", async () => {
    render(<TrackTracer />);
    await newTrack();
    expect(pressed("Rejilla")).toBe("true");
    const step = screen.getByLabelText("Paso") as HTMLSelectElement;
    expect(step.value).toBe("5");
    fireEvent.change(step, { target: { value: "10" } });
    expect((screen.getByLabelText("Paso") as HTMLSelectElement).value).toBe("10");
    fireEvent.click(screen.getByRole("button", { name: "Rejilla" }));
    expect(pressed("Rejilla")).toBe("false");
    expect(screen.getByLabelText("Paso").hasAttribute("disabled")).toBe(true);
  });

  it("al dibujar con la rejilla los puntos caen en múltiplos del paso", async () => {
    render(<TrackTracer />);
    await newTrack();
    click(61.9, 63.2);
    expect((screen.getByRole("textbox", { name: /^X \(cm\)/ }) as HTMLInputElement).value).toBe(
      "60",
    );
    expect((screen.getByRole("textbox", { name: /^Y \(cm\)/ }) as HTMLInputElement).value).toBe(
      "65",
    );
  });

  it("G alterna la rejilla y el paso de ángulo se puede elegir", async () => {
    render(<TrackTracer />);
    await newTrack();
    fireEvent.keyDown(document.body, { key: "g" });
    expect(pressed("Rejilla")).toBe("false");
    const angle = screen.getByLabelText("Ángulo") as HTMLSelectElement;
    expect(angle.value).toBe("15");
    fireEvent.change(angle, { target: { value: "45" } });
    expect((screen.getByLabelText("Ángulo") as HTMLSelectElement).value).toBe("45");
  });
});

describe("transformaciones", () => {
  it("sin selección actúa sobre toda la pista; con 2 o más objetos, sobre la selección", async () => {
    render(<TrackTracer />);
    await openExample("Ocho libre");
    expect(screen.getByRole("group", { name: "Transformar toda la pista" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    expect(
      screen.getByRole("group", { name: "Transformar la selección (6 objetos)" }),
    ).toBeTruthy();
  });

  it("mover desplaza toda la pista (cambia la distancia al borde) y es un paso que se deshace", async () => {
    render(<TrackTracer />);
    await openExample("Ocho libre");
    const before = stat("Distancia al borde");
    setField(/^Mover X/, "20");
    setField(/^Mover Y/, "0");
    fireEvent.click(screen.getByRole("button", { name: "Mover" }));
    expect(stat("Distancia al borde")).not.toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(stat("Distancia al borde")).toBe(before);
  });

  it("escalar al 200 % duplica el largo; al 50 % lo reduce", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    expect(stat("Largo")).toBe("8,3 m");
    setField(/^Escalar/, "200");
    fireEvent.click(screen.getByRole("button", { name: "Escalar" }));
    expect(stat("Largo")).toBe("16,7 m");
    setField(/^Escalar/, "50");
    fireEvent.click(screen.getByRole("button", { name: "Escalar" }));
    expect(stat("Largo")).toBe("8,3 m");
  });

  it("girar o reflejar toda la pista conserva su largo", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    setField(/^Girar/, "90");
    fireEvent.click(screen.getByRole("button", { name: "Girar a la izquierda" }));
    expect(stat("Largo")).toBe("8,3 m");
    fireEvent.click(screen.getByRole("button", { name: "Girar a la derecha" }));
    fireEvent.click(screen.getByRole("button", { name: "Espejo horizontal" }));
    fireEvent.click(screen.getByRole("button", { name: "Espejo vertical" }));
    expect(stat("Largo")).toBe("8,3 m");
    expect(screen.getByRole("button", { name: "Deshacer" }).hasAttribute("disabled")).toBe(false);
  });

  it("un valor no numérico o un porcentaje no positivo desactiva el botón", async () => {
    render(<TrackTracer />);
    await openExample("Ocho libre");
    setField(/^Girar/, "abc");
    expect(
      screen.getByRole("button", { name: "Girar a la izquierda" }).hasAttribute("disabled"),
    ).toBe(true);
    setField(/^Escalar/, "0");
    expect(screen.getByRole("button", { name: "Escalar" }).hasAttribute("disabled")).toBe(true);
    setField(/^Mover X/, "");
    expect(screen.getByRole("button", { name: "Mover" }).hasAttribute("disabled")).toBe(true);
  });

  it("R y M del teclado transforman la selección", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "r" });
    fireEvent.keyDown(document.body, { key: "m" });
    expect(screen.getByRole("button", { name: "Deshacer" }).hasAttribute("disabled")).toBe(false);
    expect(stat("Largo")).toBe("8,3 m");
  });

  it("no aparece sin pista ni con una pista vacía", async () => {
    render(<TrackTracer />);
    expect(screen.queryByRole("group", { name: /Transformar/ })).toBeNull();
    await newTrack();
    expect(screen.queryByRole("group", { name: /Transformar/ })).toBeNull();
  });
});

describe("menú contextual", () => {
  it("clic derecho sobre un punto abre su menú; «Borrar punto» lo quita", async () => {
    render(<TrackTracer />);
    await newTrack();
    click(60, 60);
    click(240, 60);
    click(240, 190);
    expect(stat("Puntos / cortes")).toBe("3 / 0");
    rightClick(240, 60);
    const menu = screen.getByRole("menu", { name: "Menú del plano" });
    expect(within(menu).getByText(/^Punto 2/)).toBeTruthy();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Borrar punto/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(stat("Puntos / cortes")).toBe("2 / 0");
  });

  it("en un tramo ofrece las plantillas, el corte y la salida", async () => {
    render(<TrackTracer />);
    await squareOnBoard();
    rightClick(100, 60);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText(/^Tramo 1/)).toBeTruthy();
    const templates = within(menu).getByRole("group", { name: "Plantillas" });
    expect(within(templates).getAllByRole("button")).toHaveLength(7);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Poner un corte en este tramo" }));
    expect(stat("Puntos / cortes")).toBe("4 / 1");
  });

  it("en el vacío ofrece seleccionar todo y crear una zona; Esc cierra el menú", async () => {
    render(<TrackTracer />);
    await squareOnBoard();
    rightClick(150, 125);
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Nueva zona prohibida aquí/ }));
    expect(screen.getByRole("heading", { name: "Zona 1" })).toBeTruthy();
    rightClick(150, 125);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("un clic fuera del menú lo cierra", async () => {
    render(<TrackTracer />);
    await squareOnBoard();
    rightClick(150, 125);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("el menú del navegador no aparece sobre el plano", async () => {
    render(<TrackTracer />);
    await squareOnBoard();
    const e = new MouseEvent("contextmenu", { ...at(100, 60), cancelable: true });
    fireEvent(canvas(), e);
    expect(e.defaultPrevented).toBe(true);
  });
});
