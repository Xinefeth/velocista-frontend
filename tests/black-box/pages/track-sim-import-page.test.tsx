// Trazador de pistas, punto 4: cotas, simulación de vuelta, PNG, importación de JSON y la corrección
// de un clic del aviso de radio. Se actúa como el piloto (por rol y nombre accesible).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TrackTracer } from "@/ui/pages/TrackTracer";
import type { ProfileApi } from "@/infrastructure/contracts/tracks";
import { EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { LGR_2026 } from "../../unit/track/fixtures";
import { stubBrowser } from "./_harness";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const lgr: ProfileApi = {
  id: "lgr2026",
  competition: "Let's Go Robot 2026",
  label: "LGR 2026",
  category: "Velocista",
  rules: { track: { line_width_mm: 19, gap_length_cm: 2, ...LGR_2026.rules } as never },
};

/** Pista de la API (plana) con un radio que no entra entre sus vecinos. */
const tightWire = {
  name: "Pista apretada",
  board: { width_cm: 300, height_cm: 250 },
  closed: true,
  points: [
    { x: 100, y: 100, radius: 15, gap: false },
    { x: 200, y: 100, radius: 15, gap: false },
    { x: 200, y: 120, radius: 15, gap: false },
    { x: 100, y: 120, radius: 15, gap: false },
  ],
  zones: [],
  start: { edge: 0, t: 0.5 },
  profile_id: "lgr2026",
};

/** Sobre v2 del prototipo para el ejemplo de técnica. */
const v2 = {
  app: "trazador-de-pistas",
  v: 2,
  pista: {
    name: "Del prototipo",
    board: { w: 300, h: 250 },
    closed: true,
    pts: EXAMPLE_TECHNIQUE.points.map((p) => ({ x: p.x, y: p.y, r: p.radius, g: p.gap })),
    zones: [],
    start: { e: 0, t: 0.5 },
  },
  perfil: { id: "lgr2026", name: "x", rules: {} },
};

beforeEach(() => {
  stubBrowser();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        url.startsWith("/api/profiles")
          ? json([lgr])
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

const openExample = async (name: string) =>
  fireEvent.click(await screen.findByRole("button", { name }));
const newTrack = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "Nueva pista" }));
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const fileInput = () => screen.getByLabelText("Archivo de pista (JSON)") as HTMLInputElement;
const importText = (text: string, name = "pista.json") =>
  fireEvent.change(fileInput(), {
    target: { files: [new File([text], name, { type: "application/json" })] },
  });

describe("cotas", () => {
  it("están activas por defecto y el chip y la tecla C las alternan", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    expect(pressed("Cotas")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Cotas" }));
    expect(pressed("Cotas")).toBe("false");
    fireEvent.keyDown(document.body, { key: "c" });
    expect(pressed("Cotas")).toBe("true");
  });

  it("sin pista abierta el chip está desactivado", async () => {
    render(<TrackTracer />);
    expect((await screen.findByRole("button", { name: "Cotas" })).hasAttribute("disabled")).toBe(
      true,
    );
  });
});

describe("simulación", () => {
  it("abre la barra, reproduce y pausa, mueve la posición y se cierra", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));
    const play = screen.getByRole("button", { name: "Reproducir" });
    expect(play.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(play);
    expect(screen.getByRole("button", { name: "Pausar" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    const slider = screen.getByRole("slider", {
      name: "Posición en la vuelta",
    }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "500" } });
    expect(slider.value).toBe("500");
    expect(slider.getAttribute("aria-valuetext")).toMatch(/de .* segundos/);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar simulación" }));
    expect(screen.getByRole("button", { name: "Simular" })).toBeTruthy();
  });

  it("la velocidad y el tamaño del robot aceptan valores válidos y rechazan los inválidos", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));
    const speed = screen.getByRole("textbox", { name: "Velocidad (m/s)" }) as HTMLInputElement;
    expect(speed.value).toBe("1");
    fireEvent.change(speed, { target: { value: "2,5" } });
    expect(speed.value).toBe("2,5");
    fireEvent.blur(speed);
    expect(speed.value).toBe("2,5");
    fireEvent.change(speed, { target: { value: "99" } });
    fireEvent.blur(speed);
    expect(speed.value).toBe("2,5"); // fuera de rango: se conserva el valor vigente
    const width = screen.getByRole("textbox", { name: "Ancho del robot (cm)" }) as HTMLInputElement;
    expect(width.value).toBe("15");
  });

  it("sin pista dibujada avisa y no abre la barra", async () => {
    render(<TrackTracer />);
    await newTrack();
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));
    expect(screen.getByText("Dibuja una pista antes de simular.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reproducir" })).toBeNull();
  });

  it("cambiar de pista cierra la simulación", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));
    expect(screen.getByRole("button", { name: "Reproducir" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Ocho libre" }));
    expect(screen.getByRole("button", { name: "Simular" })).toBeTruthy();
  });
});

describe("exportar PNG", () => {
  it("descarga el PNG del plano con el sufijo -plano", async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return "blob:png";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) =>
      cb(new Blob(["png"], { type: "image/png" })),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.click(screen.getByRole("button", { name: "PNG" }));
    expect(await screen.findByText("Guardado: tecnica-3-2-5-plano.png")).toBeTruthy();
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe("image/png");
  });

  it("si el navegador no puede crear la imagen, lo dice", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(null));
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.click(screen.getByRole("button", { name: "PNG" }));
    expect(await screen.findByText(/No se pudo crear el PNG/)).toBeTruthy();
  });

  it("no existe «SVG con cotas» (decisión pendiente del PO)", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    expect(screen.queryByRole("button", { name: /SVG con cotas/ })).toBeNull();
    expect(screen.getByRole("button", { name: "SVG con zonas" })).toBeTruthy();
  });
});

describe("importar JSON", () => {
  it("abre un archivo del prototipo (v2) como pista sin guardar y asigna el perfil conocido", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: /LGR 2026/ });
    importText(JSON.stringify(v2));
    expect(
      await screen.findByText(/Pista importada: guárdala para crearla en la API/),
    ).toBeTruthy();
    expect(screen.getByText("Del prototipo")).toBeTruthy();
    expect(screen.getByText("Sin guardar en la API")).toBeTruthy();
    const picker = screen.getByLabelText("Perfil de reglamento") as HTMLSelectElement;
    expect(picker.value).toBe("lgr2026");
    expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(false);
  });

  it("abre un archivo de la API (objeto plano)", async () => {
    render(<TrackTracer />);
    importText(JSON.stringify({ ...tightWire, profile_id: null }));
    expect(await screen.findByText(/Pista importada/)).toBeTruthy();
    expect(screen.getByText("Pista apretada")).toBeTruthy();
  });

  it("un perfil desconocido se avisa", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: /LGR 2026/ });
    importText(JSON.stringify({ ...tightWire, profile_id: "inventado" }));
    expect(await screen.findByText(/El perfil «inventado» no existe en la API/)).toBeTruthy();
  });

  it("un archivo inválido explica el motivo y no cambia la pista", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    importText("{esto no es json");
    expect(
      await screen.findByText("No se pudo importar: El archivo no es un JSON válido."),
    ).toBeTruthy();
    importText(JSON.stringify({ ...tightWire, board: { width_cm: 5, height_cm: 5 } }));
    expect(await screen.findByText(/La pista no cumple los límites/)).toBeTruthy();
    expect(screen.getAllByText("Técnica 3 × 2,5").length).toBeGreaterThan(0);
  });

  it("con cambios sin guardar pide confirmar antes de reemplazar la pista", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre/ }), {
      target: { value: "Editada" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: /Nombre/ }));
    importText(JSON.stringify(v2));
    const dialog = await screen.findByRole("alertdialog", { name: "Cambios sin guardar" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Del prototipo")).toBeNull();
    importText(JSON.stringify(v2));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Descartar y continuar",
      }),
    );
    expect(await screen.findByText("Del prototipo")).toBeTruthy();
  });
});

describe("aviso de radio que no entra", () => {
  it("lista el aviso con el botón y un clic lo corrige y deja la pista con cambios", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: /LGR 2026/ });
    importText(JSON.stringify(tightWire));
    const issues = await screen.findByRole("list", { name: "Incidencias" });
    expect(within(issues).getAllByText(/Pediste R 15 pero solo entra/).length).toBeGreaterThan(0);
    const fix = within(issues).getAllByRole("button", { name: /Usar el radio que entra/ })[0];
    fireEvent.click(fix);
    await waitFor(() => expect(screen.queryByText(/Pediste R 15 pero solo entra/)).toBeNull());
    expect(screen.queryByRole("button", { name: /Usar el radio que entra/ })).toBeNull();
    // se puede deshacer
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect((await screen.findAllByText(/Pediste R 15 pero solo entra/)).length).toBeGreaterThan(0);
  });
});

describe("accesibilidad de la barra de herramientas", () => {
  it("las barras tienen rol y nombre, y el recuento de incidencias se anuncia", async () => {
    render(<TrackTracer />);
    await openExample("Técnica 3 × 2,5");
    expect(screen.getByRole("toolbar", { name: "Herramientas del plano" })).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Plantillas de figuras" })).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Historial y guardado" })).toBeTruthy();
    expect(
      screen
        .getAllByRole("status")
        .some((s) => /problema|aviso|Sin verificación/.test(s.textContent ?? "")),
    ).toBe(true);
  });
});
