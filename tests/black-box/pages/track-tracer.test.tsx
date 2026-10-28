import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TrackTracer } from "@/ui/pages/TrackTracer";
import type { ProfileApi, TrackApi } from "@/infrastructure/contracts/tracks";
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
const club: ProfileApi = { id: "club", competition: "Club", label: "Pruebas del club", category: "Robot", rules: {} };

const saved: TrackApi = {
  id: 7,
  name: "Pista guardada",
  board: { width_cm: 300, height_cm: 250 },
  closed: false,
  points: [
    { x: 50, y: 100, radius: 0, gap: false },
    { x: 250, y: 100, radius: 0, gap: false },
  ],
  zones: [],
  start: { edge: 0, t: 0.5 },
  profile_id: "lgr2026",
  length_cm: 200,
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T10:00:00Z",
};

type Handler = () => Response;
let routes: Record<string, Handler>;
let fetchMock: ReturnType<typeof vi.fn>;
const downloads: { name: string; type: string }[] = [];

beforeEach(() => {
  stubBrowser();
  downloads.length = 0;
  routes = {
    "GET /api/profiles": () => json([lgr, club]),
    "GET /api/tracks?limit=200&offset=0": () => json({ items: [saved], total: 1, limit: 200, offset: 0 }),
    "GET /api/tracks/7": () => json(saved),
  };
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? "GET"} ${url}`];
    return Promise.resolve(handler ? handler() : json({ detail: { reason: "track_not_found", detail: "x" } }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:prueba");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, type: "" });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const openExample = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("Trazador de pistas: lista y apertura", () => {
  it("lista las pistas guardadas con su largo en metros", async () => {
    render(<TrackTracer />);
    const list = await screen.findByRole("list", { name: "Pistas guardadas" });
    expect(within(list).getByText("Pista guardada")).toBeTruthy();
    expect(within(list).getByText("2 m")).toBeTruthy();
    expect(screen.getByText(/1 guardadas/)).toBeTruthy();
  });

  it("muestra el estado vacío y los ejemplos del prototipo", async () => {
    routes["GET /api/tracks?limit=200&offset=0"] = () => json({ items: [], total: 0, limit: 200, offset: 0 });
    render(<TrackTracer />);
    expect(await screen.findByText("Todavía no hay pistas guardadas.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Técnica 3 × 2,5" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ocho libre" })).toBeTruthy();
  });

  it("abre una pista guardada leyéndola de la API", async () => {
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: /Pista guardada/ }));
    expect(await screen.findByRole("img", { name: "Plano de la pista Pista guardada" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/tracks/7", expect.anything());
    await waitFor(() => expect((screen.getByLabelText("Perfil de reglamento") as HTMLSelectElement).value).toBe("lgr2026"));
  });

  it("muestra el error de carga con reintento", async () => {
    routes["GET /api/tracks?limit=200&offset=0"] = () => json({ detail: "boom" }, 500);
    render(<TrackTracer />);
    const alert = await screen.findByText(/No se pudieron cargar las pistas/);
    expect(alert).toBeTruthy();
    routes["GET /api/tracks?limit=200&offset=0"] = () => json({ items: [saved], total: 1, limit: 200, offset: 0 });
    fireEvent.click(within(alert.closest("p") as HTMLElement).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Pista guardada")).toBeTruthy();
  });

  it("borra solo después de confirmar en la página", async () => {
    let deleted = false;
    routes["DELETE /api/tracks/7"] = () => {
      deleted = true;
      return new Response(null, { status: 204 });
    };
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Borrar" }));
    expect(deleted).toBe(false);
    expect(screen.getByText(/¿Borrar «Pista guardada»\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(deleted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, borrar" }));
    await waitFor(() => expect(deleted).toBe(true));
  });
});

describe("Trazador de pistas: perfil y verificación", () => {
  it("«Técnica» cumple el perfil Let's Go", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: "LGR 2026" });
    openExample("Técnica 3 × 2,5");
    fireEvent.change(screen.getByLabelText("Perfil de reglamento"), { target: { value: "lgr2026" } });
    expect(screen.getByText("Cumple")).toBeTruthy();
    expect(screen.getByText("8,3 m")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Incidencias" })).toBeNull();
  });

  it("«Ocho libre» bajo Let's Go muestra 2 problemas con etiqueta de error y se pueden ubicar", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: "LGR 2026" });
    openExample("Ocho libre");
    fireEvent.change(screen.getByLabelText("Perfil de reglamento"), { target: { value: "lgr2026" } });
    expect(screen.getByText("2 problemas")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Incidencias" });
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Error")).toBeTruthy();
    expect(within(rows[0]).getByText("La línea se cruza (no permitido)")).toBeTruthy();
    expect(within(rows[1]).getByText("Corte en la línea (no permitido)")).toBeTruthy();
    fireEvent.click(rows[0]);
    expect(rows[0].getAttribute("aria-current")).toBe("true");
    fireEvent.click(rows[0]);
    expect(rows[0].getAttribute("aria-current")).toBeNull();
  });

  it("un perfil sin reglas de pista avisa y no verifica", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: /Pruebas del club — sin reglas de pista/ });
    openExample("Ocho libre");
    fireEvent.change(screen.getByLabelText("Perfil de reglamento"), { target: { value: "club" } });
    expect(screen.getByText("Este perfil no tiene reglas de pista: no se verifica la pista contra él.")).toBeTruthy();
    expect(screen.getByText("Sin reglas de pista")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Incidencias" })).toBeNull();
    // La geometría sigue disponible.
    expect(screen.getByText("7,2 m")).toBeTruthy();
  });

  it("sin perfil elegido indica que hay que elegir uno", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: "LGR 2026" });
    openExample("Ocho libre");
    fireEvent.change(screen.getByLabelText("Perfil de reglamento"), { target: { value: "" } });
    expect(screen.getByText("Elige un perfil para verificar la pista contra sus reglas.")).toBeTruthy();
  });

  it("resume las reglas activas del perfil en metros y centímetros", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: "LGR 2026" });
    openExample("Técnica 3 × 2,5");
    fireEvent.change(screen.getByLabelText("Perfil de reglamento"), { target: { value: "lgr2026" } });
    const note = screen.getByText(/Reglas activas \(8\)/);
    expect(note.textContent).toContain("Radio mínimo de curva: 15 cm");
    expect(note.textContent).toContain("Máximo de cruces: 0 cruces");
  });

  it("si los perfiles no cargan, se puede seguir y reintentar", async () => {
    routes["GET /api/profiles"] = () => json({ detail: "boom" }, 500);
    render(<TrackTracer />);
    const alert = await screen.findByText(/No se pudieron cargar los perfiles/);
    openExample("Ocho libre");
    expect(screen.getByRole("img", { name: "Plano de la pista Ocho libre" })).toBeTruthy();
    routes["GET /api/profiles"] = () => json([lgr, club]);
    fireEvent.click(within(alert.closest("p") as HTMLElement).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("option", { name: "LGR 2026" })).toBeTruthy();
  });
});

describe("Trazador de pistas: exportación", () => {
  it("no exporta sin pista abierta", async () => {
    render(<TrackTracer />);
    await screen.findByText("Pista guardada");
    expect((screen.getByRole("button", { name: "SVG 1:1" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("descarga el SVG 1:1, el SVG con zonas y el JSON con nombres derivados del título", async () => {
    render(<TrackTracer />);
    await screen.findByRole("option", { name: "LGR 2026" });
    openExample("Técnica 3 × 2,5");
    fireEvent.change(screen.getByLabelText("Perfil de reglamento"), { target: { value: "lgr2026" } });
    fireEvent.click(screen.getByRole("button", { name: "SVG 1:1" }));
    await waitFor(() => expect(downloads.map((d) => d.name)).toContain("tecnica-3-2-5-1a1.svg"));
    fireEvent.click(screen.getByRole("button", { name: "SVG con zonas" }));
    await waitFor(() => expect(downloads.map((d) => d.name)).toContain("tecnica-3-2-5-1a1-zonas.svg"));
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    await waitFor(() => expect(downloads.map((d) => d.name)).toContain("tecnica-3-2-5.json"));
    expect(screen.getByText("Guardado: tecnica-3-2-5.json (pista sin guardar en la API)")).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  });

  it("el JSON de una pista guardada viene de GET /tracks/{id}/export", async () => {
    routes["GET /api/tracks/7/export"] = () =>
      new Response('{"id":7}', { status: 200, headers: { "Content-Disposition": 'attachment; filename="pista-guardada.json"' } });
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: /Pista guardada/ }));
    await screen.findByRole("img", { name: "Plano de la pista Pista guardada" });
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    await waitFor(() => expect(downloads.map((d) => d.name)).toContain("pista-guardada.json"));
    expect(fetchMock).toHaveBeenCalledWith("/api/tracks/7/export", expect.anything());
  });

  it("un fallo de exportación se explica al piloto", async () => {
    routes["GET /api/tracks/7/export"] = () => json({ detail: { reason: "track_not_found", detail: "x" } }, 404);
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: /Pista guardada/ }));
    await screen.findByRole("img", { name: "Plano de la pista Pista guardada" });
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(await screen.findByText(/No se pudo exportar: La pista ya no existe/)).toBeTruthy();
    expect(downloads).toHaveLength(0);
  });
});
