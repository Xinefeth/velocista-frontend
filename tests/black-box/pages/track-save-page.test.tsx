// Trazador de pistas: deshacer/rehacer, cambios sin guardar, guardar y actualizar, errores por campo,
// perímetro y área. Se actúa como el piloto (por rol y nombre accesible) con la API simulada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TrackTracer } from "@/ui/pages/TrackTracer";
import { fitViewport, worldToScreen } from "@/ui/components/track/viewport";
import type { ProfileApi, TrackApi } from "@/infrastructure/contracts/tracks";
import { EXAMPLE_EIGHT, EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { measures } from "@/domain/track/measures";
import { LGR_2026 } from "../../unit/track/fixtures";
import { stubBrowser } from "./_harness";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const BOARD = { widthCm: 300, heightCm: 250 };
const lgr: ProfileApi = {
  id: "lgr2026",
  competition: "Let's Go Robot 2026",
  label: "LGR 2026",
  category: "Velocista",
  rules: { track: { line_width_mm: 19, gap_length_cm: 2, ...LGR_2026.rules } as never },
};
const savedRow: TrackApi = {
  id: 7,
  name: "Pista guardada",
  board: { width_cm: 300, height_cm: 250 },
  closed: true,
  points: [
    { x: 50, y: 50, radius: 10, gap: false },
    { x: 250, y: 50, radius: 10, gap: false },
    { x: 250, y: 200, radius: 10, gap: false },
    { x: 50, y: 200, radius: 10, gap: false },
  ],
  zones: [],
  start: { edge: 0, t: 0.5 },
  profile_id: "lgr2026",
  length_cm: 700,
  perimeter_cm: 700,
  area_cm2: 28000,
  created_at: "2026-11-03T10:00:00Z",
  updated_at: "2026-11-03T10:00:00Z",
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;
let routes: Record<string, Handler>;
let fetchMock: ReturnType<typeof vi.fn>;
const calls = (key: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${url}` === key,
  );
const bodyOf = (key: string, n = 0) => JSON.parse((calls(key)[n][1] as RequestInit).body as string);

beforeEach(() => {
  stubBrowser();
  routes = {
    "GET /api/profiles": () => json([lgr]),
    "GET /api/tracks?limit=200&offset=0": () =>
      json({ items: [savedRow], total: 1, limit: 200, offset: 0 }),
    "GET /api/tracks/7": () => json(savedRow),
  };
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? "GET"} ${url}`];
    return Promise.resolve(
      handler ? handler(init) : json({ detail: { reason: "track_not_found", detail: "x" } }, 404),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
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
function clickWorld(x: number, y: number) {
  const [sx, sy] = worldToScreen(fitViewport(BOARD, 800, 600), x, y);
  const opts = { clientX: sx, clientY: sy, button: 0, bubbles: true };
  fireEvent(canvas(), new MouseEvent("pointerdown", opts));
  fireEvent(canvas(), new MouseEvent("pointerup", opts));
}
const newTrack = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "Nueva pista" }));
const openExample = async (name: string) =>
  fireEvent.click(await screen.findByRole("button", { name }));
const openSaved = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /Pista guardada/ }));
  await screen.findByRole("img", { name: "Plano de la pista Pista guardada" });
};
const drawSquare = () => {
  clickWorld(60, 60);
  clickWorld(240, 60);
  clickWorld(240, 190);
  clickWorld(60, 190);
  clickWorld(60, 60); // cierra
};
const commitField = (input: HTMLElement, value: string) => {
  act(() => (input as HTMLInputElement).focus());
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
};
const stat = (label: string) => screen.getByText(label).nextElementSibling!.textContent;

describe("deshacer y rehacer", () => {
  it("deshace y rehace un cambio del inspector con los botones", async () => {
    render(<TrackTracer />);
    await openExample("Ocho libre");
    fireEvent.click(screen.getByRole("button", { name: "Abrir circuito" }));
    expect(screen.getByRole("button", { name: "Cerrar circuito" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.getByRole("button", { name: "Abrir circuito" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deshacer" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(screen.getByRole("button", { name: "Cerrar circuito" })).toBeTruthy();
  });

  it("Ctrl+Z y Ctrl+Y funcionan mientras la vista está montada", async () => {
    render(<TrackTracer />);
    await newTrack();
    clickWorld(60, 60);
    clickWorld(240, 60);
    expect(screen.getByRole("heading", { name: "Punto 2" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(screen.queryByRole("heading", { name: "Punto 2" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Punto 2" })).toBeNull(); // deshacer limpió la selección
    expect(screen.getByRole("button", { name: "Deshacer" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("indicador de cambios sin guardar", () => {
  it("una pista guardada está «Guardada»; al editarla pasa a «Cambios sin guardar» y vuelve al deshacer", async () => {
    render(<TrackTracer />);
    await openSaved();
    expect(screen.getByText("Guardada")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Actualizar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    commitField(screen.getByRole("textbox", { name: "Nombre de la pista" }), "Otra");
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Actualizar" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.getByText("Guardada")).toBeTruthy();
  });

  it("cambiar el perfil es un cambio guardable", async () => {
    render(<TrackTracer />);
    await openSaved();
    await screen.findByRole("option", { name: "LGR 2026" });
    fireEvent.change(screen.getByLabelText("Perfil de reglamento"), { target: { value: "" } });
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });

  it("avisa al cerrar o recargar solo si hay cambios sin guardar", async () => {
    render(<TrackTracer />);
    await openSaved();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    commitField(screen.getByRole("textbox", { name: "Nombre de la pista" }), "Otra");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("pide confirmar antes de reemplazar una pista con cambios: cancelar la conserva, descartar abre la otra", async () => {
    render(<TrackTracer />);
    await openSaved();
    commitField(screen.getByRole("textbox", { name: "Nombre de la pista" }), "Mi edición");
    fireEvent.click(screen.getByRole("button", { name: "Ocho libre" }));
    const dialog = screen.getByRole("alertdialog", { name: "Cambios sin guardar" });
    expect(within(dialog).getByText("Hay cambios sin guardar. ¿Descartarlos?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(canvas().getAttribute("aria-label")).toBe("Plano de la pista Mi edición");
    fireEvent.click(screen.getByRole("button", { name: "Ocho libre" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar y continuar" }));
    expect(canvas().getAttribute("aria-label")).toBe("Plano de la pista Ocho libre");
  });

  it("«Nueva pista» también pide confirmar cuando hay cambios, y no cuando no los hay", async () => {
    render(<TrackTracer />);
    await openSaved();
    fireEvent.click(screen.getByRole("button", { name: "Nueva pista" })); // sin cambios: directo
    expect(screen.getByText("Pista vacía")).toBeTruthy();
    clickWorld(60, 60); // dibujar en la pista nueva son cambios que se perderían
    fireEvent.click(screen.getByRole("button", { name: "Nueva pista" }));
    expect(screen.getByRole("alertdialog", { name: "Cambios sin guardar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartar y continuar" }));
    expect(screen.getByText("Pista vacía")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("guardar y actualizar", () => {
  it("guarda una pista nueva con POST, incluye largo, perímetro y área, y recarga la lista", async () => {
    routes["POST /api/tracks"] = () => json({ ...savedRow, id: 8, name: "Pista nueva" }, 201);
    render(<TrackTracer />);
    await newTrack();
    drawSquare();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Pista guardada en la API.");
    const body = bodyOf("POST /api/tracks");
    expect(body.name).toBe("Pista nueva");
    expect(body.closed).toBe(true);
    expect(body.points).toHaveLength(4);
    expect(body).not.toHaveProperty("id");
    expect(body.length_cm).toBeGreaterThan(0);
    expect(body.perimeter_cm).toBe(body.length_cm);
    expect(body.area_cm2).toBeGreaterThan(0);
    expect(screen.getByText("Guardada")).toBeTruthy();
    expect(calls("GET /api/tracks?limit=200&offset=0").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeTruthy();
  });

  it("una pista abierta se actualiza con PUT sobre su id", async () => {
    routes["PUT /api/tracks/7"] = () =>
      json({ ...savedRow, name: "Pista guardada v2", updated_at: "2026-11-03T12:00:00Z" });
    render(<TrackTracer />);
    await openSaved();
    commitField(screen.getByRole("textbox", { name: "Nombre de la pista" }), "Pista guardada v2");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await screen.findByText("Pista guardada en la API.");
    expect(calls("PUT /api/tracks/7")).toHaveLength(1);
    expect(calls("POST /api/tracks")).toHaveLength(0);
    expect(bodyOf("PUT /api/tracks/7").name).toBe("Pista guardada v2");
    expect(screen.getByText("Guardada")).toBeTruthy();
  });

  it("ejemplo del prototipo: se guarda con POST y queda ligado a su perfil", async () => {
    routes["POST /api/tracks"] = () => json({ ...savedRow, id: 9, name: "Técnica 3 × 2,5" }, 201);
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Pista guardada en la API.");
    const body = bodyOf("POST /api/tracks");
    expect(body.profile_id).toBe("lgr2026");
    const m = measures(EXAMPLE_TECHNIQUE);
    expect(body.length_cm).toBe(m.lengthCm);
    expect(body.area_cm2).toBe(m.areaCm2);
  });

  it("Ctrl+S guarda", async () => {
    routes["POST /api/tracks"] = () => json({ ...savedRow, id: 10 }, 201);
    render(<TrackTracer />);
    await openExample("Ocho libre");
    fireEvent.keyDown(document.body, { key: "s", ctrlKey: true });
    await screen.findByText("Pista guardada en la API.");
    expect(calls("POST /api/tracks")).toHaveLength(1);
    // «Ocho libre» se cruza: el área se envía como null, no como 0.
    expect(bodyOf("POST /api/tracks").area_cm2).toBeNull();
    expect(bodyOf("POST /api/tracks").perimeter_cm).toBeGreaterThan(0);
  });

  it("una pista abierta se guarda con perímetro y área null", async () => {
    routes["POST /api/tracks"] = () => json({ ...savedRow, id: 11 }, 201);
    render(<TrackTracer />);
    await newTrack();
    clickWorld(60, 60);
    clickWorld(240, 60);
    clickWorld(240, 190);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Pista guardada en la API.");
    const body = bodyOf("POST /api/tracks");
    expect(body.closed).toBe(false);
    expect(body.perimeter_cm).toBeNull();
    expect(body.area_cm2).toBeNull();
  });

  it("si se sigue editando mientras se guarda, no se pierde lo escrito", async () => {
    let release!: (r: Response) => void;
    routes["PUT /api/tracks/7"] = () => new Promise<Response>((resolve) => (release = resolve));
    render(<TrackTracer />);
    await openSaved();
    commitField(screen.getByRole("textbox", { name: "Nombre de la pista" }), "A");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeTruthy();
    commitField(screen.getByRole("textbox", { name: "Nombre de la pista" }), "B");
    await act(async () => release(json({ ...savedRow, name: "A" })));
    await screen.findByText("Pista guardada en la API.");
    expect(canvas().getAttribute("aria-label")).toBe("Plano de la pista B");
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });
});

describe("errores al guardar", () => {
  it("la validación local bloquea el envío y lista cada campo con su nombre", async () => {
    render(<TrackTracer />);
    await newTrack();
    clickWorld(60, 60); // un solo punto: faltan puntos
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const alert = await screen.findByText("Corrige los datos antes de guardar.");
    expect(alert).toBeTruthy();
    const list = screen.getByRole("list", { name: "Errores al guardar" });
    expect(within(list).getByText(/Puntos: La pista necesita entre 2 y 500 puntos/)).toBeTruthy();
    expect(calls("POST /api/tracks")).toHaveLength(0);
    expect(screen.getByText("Sin guardar en la API")).toBeTruthy();
  });

  it("un nombre vacío se marca en su campo", async () => {
    render(<TrackTracer />);
    await newTrack();
    clickWorld(60, 60);
    clickWorld(240, 60);
    commitField(screen.getByRole("textbox", { name: "Nombre de la pista" }), "   ");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Corrige los datos antes de guardar.");
    const name = screen.getByRole("textbox", { name: "Nombre de la pista" });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getAllByText(/El nombre debe tener entre 1 y 80 caracteres/).length,
    ).toBeGreaterThan(0);
  });

  it("422 forma A (lista): cada campo llega con su ruta y el del tablero se marca en su campo", async () => {
    routes["POST /api/tracks"] = () =>
      json(
        {
          detail: [
            {
              type: "less_than_equal",
              loc: ["body", "points", 0, "radius"],
              msg: "x",
              input: 250,
              ctx: { le: 200 },
            },
            {
              type: "greater_than_equal",
              loc: ["body", "board", "width_cm"],
              msg: "x",
              input: 10,
              ctx: { ge: 50 },
            },
          ],
        },
        422,
      );
    render(<TrackTracer />);
    await openExample("Ocho libre");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText(/No se pudo guardar: Hay datos inválidos en la solicitud/);
    const list = screen.getByRole("list", { name: "Errores al guardar" });
    expect(within(list).getByText("Punto 1 · radio: Debe ser como máximo 200")).toBeTruthy();
    expect(within(list).getByText("Ancho del tablero: Debe ser como mínimo 50")).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: /Ancho del tablero/ }).getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("422 forma B: perfil inexistente, métricas inválidas y circuito con pocos puntos", async () => {
    for (const reason of [
      "track_profile_unknown",
      "track_metrics_invalid",
      "track_closed_needs_three_points",
    ]) {
      cleanup();
      routes["POST /api/tracks"] = () => json({ detail: { reason, detail: "English" } }, 422);
      render(<TrackTracer />);
      await openExample("Ocho libre");
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      const msg = await screen.findByText(/No se pudo guardar:/);
      expect(msg.textContent).not.toMatch(/English/);
      if (reason === "track_profile_unknown")
        expect(msg.textContent).toMatch(/perfil elegido no existe/);
      if (reason === "track_metrics_invalid")
        expect(msg.textContent).toMatch(/perímetro o el área/);
      if (reason === "track_closed_needs_three_points")
        expect(msg.textContent).toMatch(/al menos 3 puntos/);
      expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy(); // sigue sin guardar
    }
  });

  it("404 al actualizar (la pista ya no existe): avisa y conserva el trabajo", async () => {
    routes["PUT /api/tracks/7"] = () =>
      json({ detail: { reason: "track_not_found", detail: "x" } }, 404);
    render(<TrackTracer />);
    await openSaved();
    commitField(screen.getByRole("textbox", { name: "Nombre de la pista" }), "Sigo aquí");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await screen.findByText(/La pista ya no existe/);
    expect(canvas().getAttribute("aria-label")).toBe("Plano de la pista Sigo aquí");
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });

  it("sin conexión: avisa y deja reintentar", async () => {
    routes["POST /api/tracks"] = () =>
      Promise.reject(new TypeError("Failed to fetch")) as unknown as Response;
    render(<TrackTracer />);
    await openExample("Ocho libre");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("No se pudo guardar: sin conexión con la API.");
    routes["POST /api/tracks"] = () => json({ ...savedRow, id: 12 }, 201);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Pista guardada en la API.");
  });

  it("un circuito «cerrado» con menos de 3 puntos se abre solo y se avisa al guardar", async () => {
    routes["POST /api/tracks"] = () => json({ ...savedRow, id: 13 }, 201);
    render(<TrackTracer />);
    await newTrack();
    clickWorld(60, 60);
    clickWorld(240, 60);
    clickWorld(240, 190);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar circuito" }));
    fireEvent.keyDown(document.body, { key: "Delete" }); // borra el punto 3 elegido: quedan 2 y se abre
    expect(screen.getByRole("button", { name: "Cerrar circuito" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(calls("POST /api/tracks")).toHaveLength(1));
    expect(bodyOf("POST /api/tracks").closed).toBe(false);
  });
});

describe("largo, perímetro y área en la verificación", () => {
  it("una pista cerrada y sin cruces muestra perímetro y área en m y m²", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    const m = measures(EXAMPLE_TECHNIQUE);
    expect(stat("Largo")).toBe("8,3 m");
    expect(stat("Perímetro")).toBe("8,3 m");
    expect(stat("Área")).toBe(
      `${(Math.round((m.areaCm2! / 10000) * 100) / 100).toString().replace(".", ",")} m²`,
    );
  });

  it("con un cruce, el área es «—» y se explica por qué", async () => {
    render(<TrackTracer />);
    await openExample("Ocho libre");
    expect(stat("Perímetro")).toBe("7,2 m");
    expect(stat("Área")).toBe("—");
    expect(screen.getByText(/La línea se cruza: el área neta de un ocho engaña/)).toBeTruthy();
    expect(measures(EXAMPLE_EIGHT).areaCm2).toBeNull();
  });

  it("al abrir el circuito, perímetro y área pasan a «—» (y vuelven al cerrarlo)", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.click(screen.getByRole("button", { name: "Abrir circuito" }));
    expect(stat("Perímetro")).toBe("—");
    expect(stat("Área")).toBe("—");
    expect(screen.getByText(/La pista está abierta/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar circuito" }));
    expect(stat("Perímetro")).toBe("8,3 m");
  });

  it("se actualizan mientras se dibuja", async () => {
    render(<TrackTracer />);
    await newTrack();
    drawSquare();
    expect(stat("Perímetro")).not.toBe("—");
    expect(stat("Área")).toMatch(/m²$/);
  });
});

describe("aviso de «gana la última versión guardada»", () => {
  it("solo aparece con una pista que ya está en la API", async () => {
    render(<TrackTracer />);
    await openExample("Ocho libre");
    expect(screen.queryByText(/gana la que se guarde al final/)).toBeNull();
    await openSaved();
    expect(screen.getByText(/gana la que se guarde al final/)).toBeTruthy();
  });
});
