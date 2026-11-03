// Trazador de pistas: borrador local con clave por pista. Que un 401, una recarga o el cierre de la pestaña
// no pierdan el trabajo sin guardar, y que dos pistas (o dos pestañas) no se pisen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TrackTracer } from "@/ui/pages/TrackTracer";
import { AuthGate } from "@/ui/components/AuthGate";
import { AUTH_EVENT, setAccessToken } from "@/infrastructure/config";
import {
  DRAFT_PREFIX,
  draftKey,
  listDrafts,
  loadDraft,
  saveDraft,
} from "@/infrastructure/persistence/trackDraft";
import { DRAFT_DELAY_MS } from "@/application/hooks/useTrackDraft";
import { EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import type { TrackApi } from "@/infrastructure/contracts/tracks";
import { stubBrowser } from "./_harness";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const row = (id: number, name: string): TrackApi => ({
  id,
  name,
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
  profile_id: null,
  length_cm: 700,
  perimeter_cm: 700,
  area_cm2: 28000,
  created_at: "2026-11-03T10:00:00Z",
  updated_at: "2026-11-03T10:00:00Z",
});

type Handler = (init?: RequestInit) => Response | Promise<Response>;
let routes: Record<string, Handler>;

beforeEach(() => {
  stubBrowser();
  localStorage.clear();
  setAccessToken(null);
  routes = {
    "GET /api/profiles": () => json([]),
    "GET /api/tracks?limit=200&offset=0": () =>
      json({
        items: [row(7, "Pista siete"), row(8, "Pista ocho")],
        total: 2,
        limit: 200,
        offset: 0,
      }),
    "GET /api/tracks/7": () => json(row(7, "Pista siete")),
    "GET /api/tracks/8": () => json(row(8, "Pista ocho")),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const handler = routes[`${init?.method ?? "GET"} ${url}`];
      return Promise.resolve(
        handler ? handler(init) : json({ detail: { reason: "track_not_found", detail: "x" } }, 404),
      );
    }),
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
  setAccessToken(null);
});

const openSaved = async (name: string) => {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
  await screen.findByRole("img", { name: `Plano de la pista ${name}` });
};
const commitName = (value: string) => {
  const input = screen.getByRole("textbox", { name: "Nombre de la pista" }) as HTMLInputElement;
  act(() => input.focus());
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
};
/** Espera real (el retraso del borrador es corto) dentro de `act`. */
const after = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe("escritura del borrador", () => {
  it("escribe tras una pausa, con la clave de la pista, y varias ediciones seguidas son una sola escritura", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("A");
    await after(100);
    commitName("AB");
    await after(100);
    commitName("ABC");
    expect(loadDraft(draftKey(7))).toBeNull();
    await after(DRAFT_DELAY_MS);
    expect(loadDraft(draftKey(7))!.track.name).toBe("ABC");
    expect(setItem.mock.calls.filter(([k]) => String(k).startsWith(DRAFT_PREFIX))).toHaveLength(1);
  });

  it("una pista sin cambios no deja borrador", async () => {
    render(<TrackTracer />);
    await openSaved("Pista siete");
    await after(DRAFT_DELAY_MS * 3);
    expect(listDrafts()).toEqual([]);
  });

  it("una pista guardada usa su id y una sin guardar la clave «new»; no se mezclan", async () => {
    const first = render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("Editada siete");
    await after(DRAFT_DELAY_MS + 50);
    expect(listDrafts().map((d) => d.key)).toEqual([draftKey(7)]);
    first.unmount();
    cleanup();

    // Otra «pestaña»: abre un ejemplo sin guardar y lo edita; el borrador de la pista 7 sigue intacto.
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Técnica 3 × 2,5" }));
    commitName("Ejemplo editado");
    await after(DRAFT_DELAY_MS + 50);
    expect(
      listDrafts()
        .map((d) => d.key)
        .sort(),
    ).toEqual([draftKey(7), draftKey(null)].sort());
    expect(loadDraft(draftKey(7))!.track.name).toBe("Editada siete");
    expect(loadDraft(draftKey(null))!.track.name).toBe("Ejemplo editado");
  });

  it("deshacer hasta el estado limpio borra el borrador", async () => {
    render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("Otra");
    await after(DRAFT_DELAY_MS);
    expect(loadDraft(draftKey(7))).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(loadDraft(draftKey(7))).toBeNull();
  });

  it("al guardar con éxito el borrador se borra", async () => {
    routes["PUT /api/tracks/7"] = () => json(row(7, "Guardada"));
    render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("Guardada");
    await after(DRAFT_DELAY_MS);
    expect(loadDraft(draftKey(7))).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await act(async () => void (await Promise.resolve()));
    await screen.findByText("Pista guardada en la API.");
    expect(loadDraft(draftKey(7))).toBeNull();
  });

  it("guardar una pista nueva borra el borrador «new» (y no deja uno con el id nuevo)", async () => {
    routes["POST /api/tracks"] = () => json(row(21, "Técnica"), 201);
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Técnica 3 × 2,5" }));
    commitName("Técnica editada");
    await after(DRAFT_DELAY_MS);
    expect(loadDraft(draftKey(null))).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Pista guardada en la API.");
    expect(listDrafts()).toEqual([]);
  });

  it("si el almacenamiento falla al escribir, la edición sigue funcionando", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("Sigue");
    await after(DRAFT_DELAY_MS);
    expect(screen.getByRole("img", { name: "Plano de la pista Sigue" })).toBeTruthy();
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });

  it("al desmontar con una escritura pendiente, se escribe de inmediato (no se pierde el último cambio)", async () => {
    const { unmount } = render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("Último cambio");
    expect(loadDraft(draftKey(7))).toBeNull(); // todavía dentro del retraso
    unmount();
    expect(loadDraft(draftKey(7))!.track.name).toBe("Último cambio");
  });
});

describe("recuperar el borrador al volver", () => {
  it("al montar con un borrador, ofrece recuperarlo y lo abre como cambio sin guardar", async () => {
    saveDraft(
      { ...EXAMPLE_TECHNIQUE, id: 7, name: "Trabajo perdido" },
      localStorage,
      new Date("2026-11-03T09:30:00Z"),
    );
    render(<TrackTracer />);
    const banner = await screen.findByRole("alertdialog", { name: "Borrador sin guardar" });
    expect(banner.textContent).toMatch(/«Trabajo perdido»/);
    expect(banner.textContent).toMatch(/pista 7 guardada/);
    fireEvent.click(within(banner).getByRole("button", { name: "Recuperar borrador" }));
    expect(screen.queryByRole("alertdialog", { name: "Borrador sin guardar" })).toBeNull();
    expect(screen.getByRole("img", { name: "Plano de la pista Trabajo perdido" })).toBeTruthy();
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actualizar" }).hasAttribute("disabled")).toBe(false);
    expect(loadDraft(draftKey(7))).not.toBeNull(); // se conserva hasta guardar
  });

  it("descartar el borrador lo borra y quita el aviso", async () => {
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: null, name: "Nueva perdida" });
    render(<TrackTracer />);
    const banner = await screen.findByRole("alertdialog", { name: "Borrador sin guardar" });
    expect(banner.textContent).toMatch(/pista nueva/);
    fireEvent.click(within(banner).getByRole("button", { name: "Descartar borrador" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(listDrafts()).toEqual([]);
  });

  it("con varios borradores, ofrece primero el más reciente e indica cuántos más hay", async () => {
    saveDraft(
      { ...EXAMPLE_TECHNIQUE, id: 7, name: "Antiguo" },
      localStorage,
      new Date("2026-11-01T00:00:00Z"),
    );
    saveDraft(
      { ...EXAMPLE_TECHNIQUE, id: 8, name: "Reciente" },
      localStorage,
      new Date("2026-11-03T00:00:00Z"),
    );
    render(<TrackTracer />);
    const banner = await screen.findByRole("alertdialog", { name: "Borrador sin guardar" });
    expect(banner.textContent).toMatch(/«Reciente»/);
    expect(banner.textContent).toMatch(/Hay 1 más/);
    fireEvent.click(within(banner).getByRole("button", { name: "Descartar borrador" }));
    expect(
      (await screen.findByRole("alertdialog", { name: "Borrador sin guardar" })).textContent,
    ).toMatch(/«Antiguo»/);
  });

  it("no se muestra nada si el borrador está dañado", async () => {
    localStorage.setItem(draftKey(7), "{roto");
    render(<TrackTracer />);
    await screen.findByText("Pista siete");
    expect(screen.queryByRole("alertdialog", { name: "Borrador sin guardar" })).toBeNull();
  });

  it("mientras hay un borrador sin resolver, no se pisa con una pista nueva con la misma clave", async () => {
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: null, name: "Antigua nueva" });
    render(<TrackTracer />);
    fireEvent.click(await screen.findByRole("button", { name: "Nueva pista" }));
    commitName("Otra pista nueva");
    await after(DRAFT_DELAY_MS * 2);
    expect(loadDraft(draftKey(null))!.track.name).toBe("Antigua nueva");
    // Ya resuelto (descartado), la pista nueva sí se respalda.
    fireEvent.click(
      within(screen.getByRole("alertdialog", { name: "Borrador sin guardar" })).getByRole(
        "button",
        { name: "Descartar borrador" },
      ),
    );
    commitName("Otra pista nueva 2");
    await after(DRAFT_DELAY_MS);
    expect(loadDraft(draftKey(null))!.track.name).toBe("Otra pista nueva 2");
  });

  it("recuperar con otra pista con cambios abierta pide confirmar", async () => {
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 8, name: "Del pasado" });
    render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("Edición actual");
    fireEvent.click(
      within(screen.getByRole("alertdialog", { name: "Borrador sin guardar" })).getByRole(
        "button",
        { name: "Recuperar borrador" },
      ),
    );
    expect(screen.getByRole("alertdialog", { name: "Cambios sin guardar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartar y continuar" }));
    expect(screen.getByRole("img", { name: "Plano de la pista Del pasado" })).toBeTruthy();
  });
});

describe("descartar a propósito y borrar pistas", () => {
  it("«Descartar y continuar» borra el borrador de la pista que se deja", async () => {
    render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("Voy a descartar");
    await after(DRAFT_DELAY_MS);
    expect(loadDraft(draftKey(7))).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ocho libre" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar y continuar" }));
    expect(loadDraft(draftKey(7))).toBeNull();
  });

  it("«Cancelar» conserva el borrador y la edición", async () => {
    render(<TrackTracer />);
    await openSaved("Pista siete");
    commitName("Me quedo");
    await after(DRAFT_DELAY_MS);
    fireEvent.click(screen.getByRole("button", { name: "Ocho libre" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(loadDraft(draftKey(7))).not.toBeNull();
    expect(screen.getByRole("img", { name: "Plano de la pista Me quedo" })).toBeTruthy();
  });

  it("borrar una pista guardada borra también su borrador", async () => {
    routes["DELETE /api/tracks/8"] = () => new Response(null, { status: 204 });
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 8, name: "Borrador de la ocho" });
    render(<TrackTracer />);
    const list = await screen.findByRole("list", { name: "Pistas guardadas" });
    const eight = within(list).getByText("Pista ocho").closest("li")!;
    fireEvent.click(within(eight).getByRole("button", { name: "Borrar" }));
    fireEvent.click(within(eight).getByRole("button", { name: "Sí, borrar" }));
    await act(async () => void (await Promise.resolve()));
    await act(async () => void (await Promise.resolve()));
    expect(loadDraft(draftKey(8))).toBeNull();
  });
});

describe("un 401 a mitad de edición no pierde el trabajo", () => {
  it("la consola se desmonta al pedir iniciar sesión y, al volver, ofrece recuperar lo editado", async () => {
    routes["POST /api/auth/login"] = () =>
      json({ access_token: "token-de-prueba", token_type: "bearer" });
    render(
      <AuthGate>
        <TrackTracer />
      </AuthGate>,
    );
    await openSaved("Pista siete");
    commitName("Trabajo en curso");

    // El servidor rechaza la sesión: AuthGate muestra el inicio de sesión y desmonta todo.
    act(() => void window.dispatchEvent(new Event(AUTH_EVENT)));
    expect(screen.getByLabelText("Usuario")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Plano de la pista/ })).toBeNull();
    expect(loadDraft(draftKey(7))!.track.name).toBe("Trabajo en curso");

    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "dev" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "no-es-real" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    });

    const banner = await screen.findByRole("alertdialog", { name: "Borrador sin guardar" });
    expect(banner.textContent).toMatch(/«Trabajo en curso»/);
    fireEvent.click(within(banner).getByRole("button", { name: "Recuperar borrador" }));
    expect(screen.getByRole("img", { name: "Plano de la pista Trabajo en curso" })).toBeTruthy();
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });
});
