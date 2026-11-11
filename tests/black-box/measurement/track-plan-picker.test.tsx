// CU-1: «Pista guardada del Trazador» como plano de referencia en Odometría (paso 1 y paso 4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Odometry } from "@/ui/pages/measurement/Odometry";
import type { TrackApi } from "@/infrastructure/contracts/tracks";
import { stubBrowser } from "../pages/_harness";
import { expectClean, stubCanvas } from "./_canvas";
import { measurement, mockApi, result } from "./_api";

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type V = [number, number, number?];
function track(id: number, name: string, pts: V[], over: Partial<TrackApi> = {}): TrackApi {
  return {
    id,
    name,
    board: { width_cm: 300, height_cm: 250 },
    closed: true,
    points: pts.map(([x, y, radius = 0]) => ({ x, y, radius, gap: false })),
    zones: [],
    start: { edge: 0, t: 0.5 },
    profile_id: null,
    length_cm: 560,
    perimeter_cm: 560,
    area_cm2: 19200,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...over,
  };
}
const RECT: V[] = [
  [70, 65],
  [230, 65],
  [230, 185],
  [70, 185],
];
const TRACKS = [
  track(1, "Aula dibujada", RECT),
  track(
    2,
    "Pista abierta",
    [
      [0, 0],
      [50, 0],
      [50, 50],
    ],
    { closed: false, perimeter_cm: null, area_cm2: null },
  ),
  track(
    3,
    "Lazo cruzado",
    [
      [0, 0],
      [100, 100],
      [100, 0],
      [0, 100],
    ],
    { area_cm2: null },
  ),
];
const page = (items: TrackApi[]) => ({ items, total: items.length, limit: 200, offset: 0 });
const MEAS = { items: [measurement(3)], total: 1, limit: 200, offset: 0 };

const choosePista = () =>
  fireEvent.change(screen.getByLabelText("Lugar o contorno"), { target: { value: "pista" } });
const next = () => fireEvent.click(screen.getByRole("button", { name: /Siguiente: calibrar/ }));
const kpi = (label: string) => screen.getByText(label).parentElement!.textContent ?? "";

describe("Odometría · fuente «Pista guardada del Trazador»", () => {
  it("la opción aparece y las demás no cambian", () => {
    mockApi({ "GET /measurements": MEAS });
    render(<Odometry />);
    const labels = within(screen.getByLabelText("Lugar o contorno"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toContain("Pista guardada del Trazador");
    expect(labels).toContain("Plano desde archivo (.dxf)");
    expect(labels).toHaveLength(7);
  });

  it("lista las pistas con su tamaño y no ofrece las abiertas ni las que se cruzan", async () => {
    mockApi({ "GET /measurements": MEAS, "GET /tracks": page(TRACKS) });
    render(<Odometry />);
    choosePista();
    const sel = await screen.findByLabelText("Pista guardada");
    await waitFor(() => expect(within(sel).getAllByRole("option")).toHaveLength(4));
    const opts = within(sel).getAllByRole("option") as HTMLOptionElement[];
    expect(opts[1].textContent).toContain("Aula dibujada · 160 × 120 cm");
    expect(opts[1].disabled).toBe(false);
    expect(opts[2].textContent).toContain(
      "La pista está abierta: cierra el circuito en el Trazador",
    );
    expect(opts[2].disabled).toBe(true);
    expect(opts[3].textContent).toContain("La línea de la pista se cruza: no encierra un área");
    expect(opts[3].disabled).toBe(true);
  });

  it("solo hace GET /tracks, una vez, y solo al elegir esta fuente", async () => {
    const { calls } = mockApi({ "GET /measurements": MEAS, "GET /tracks": page(TRACKS) });
    render(<Odometry />);
    await screen.findByLabelText("Lugar o contorno");
    expect(calls.some((c) => c.path.startsWith("/tracks"))).toBe(false);
    choosePista();
    await screen.findByLabelText("Pista guardada");
    await waitFor(() => expect(calls.filter((c) => c.path.startsWith("/tracks"))).toHaveLength(1));
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("sin pistas guardadas lo dice y manda al Trazador", async () => {
    mockApi({ "GET /measurements": MEAS, "GET /tracks": page([]) });
    render(<Odometry />);
    choosePista();
    expect(await screen.findByText(/Dibuja y guarda una pista en el Trazador/)).toBeTruthy();
  });

  it("si falla la carga avisa y Reintentar vuelve a pedir la lista", async () => {
    let ok = false;
    mockApi({
      "GET /measurements": MEAS,
      "GET /tracks": () => (ok ? page(TRACKS) : { status: 500, body: { detail: "x" } }),
    });
    render(<Odometry />);
    choosePista();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "No se pudieron cargar las pistas",
    );
    ok = true;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() =>
      expect(within(screen.getByLabelText("Pista guardada")).getAllByRole("option")).toHaveLength(
        4,
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a 1:5 el plano mide 28 m y 48 m² (tarjeta «Qué vas a medir» y vista previa)", async () => {
    mockApi({ "GET /measurements": MEAS, "GET /tracks": page(TRACKS) });
    render(<Odometry />);
    choosePista();
    await waitFor(() => expect(screen.getByLabelText("Pista guardada")).toBeTruthy());
    await screen.findByRole("option", { name: /Aula dibujada/ });
    fireEvent.change(screen.getByLabelText("Pista guardada"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Escala 1:N de la pista"), { target: { value: "5" } });
    expect(kpi("Perímetro del plano")).toContain("28.0");
    expect(kpi("Área del plano")).toContain("48.0");
  });

  it("con el largo real de un lado da el mismo plano y muestra la escala resultante", async () => {
    mockApi({ "GET /measurements": MEAS, "GET /tracks": page(TRACKS) });
    render(<Odometry />);
    choosePista();
    await screen.findByRole("option", { name: /Aula dibujada/ });
    fireEvent.change(screen.getByLabelText("Pista guardada"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Largo real de un lado (m)"));
    // por defecto propone el lado más largo (AB, 160 cm)
    expect((screen.getByLabelText("Lado medido en el lugar") as HTMLSelectElement).value).toBe("0");
    fireEvent.change(screen.getByLabelText("Largo real del lado"), { target: { value: "8" } });
    expect(kpi("Perímetro del plano")).toContain("28.0");
    expect(screen.getByLabelText("Pista a tamaño real").textContent).toContain("1:5");
    fireEvent.change(screen.getByLabelText("Lado medido en el lugar"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Largo real del lado"), { target: { value: "6" } });
    expect(kpi("Área del plano")).toContain("48.0");
  });

  it("una escala inválida da el error y no avanza", async () => {
    mockApi({ "GET /measurements": MEAS, "GET /tracks": page(TRACKS) });
    render(<Odometry />);
    choosePista();
    await screen.findByRole("option", { name: /Aula dibujada/ });
    fireEvent.change(screen.getByLabelText("Pista guardada"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Escala 1:N de la pista"), { target: { value: "0" } });
    next();
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toContain("Escribe la escala 1:N o el largo real de un lado.");
    expect(document.querySelector(".odo-flow")?.getAttribute("data-step")).toBe("1");
    // al corregir la escala el aviso desaparece
    fireEvent.change(screen.getByLabelText("Escala 1:N de la pista"), { target: { value: "5" } });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("sin pista elegida «Siguiente» da «Elige una pista guardada.» y se quita al elegir", async () => {
    mockApi({ "GET /measurements": MEAS, "GET /tracks": page(TRACKS) });
    render(<Odometry />);
    choosePista();
    await screen.findByRole("option", { name: /Aula dibujada/ });
    next();
    expect((await screen.findByRole("alert")).textContent).toBe("Elige una pista guardada.");
    fireEvent.change(screen.getByLabelText("Pista guardada"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Escala 1:N de la pista"), { target: { value: "5" } });
    await waitFor(() => expect(screen.queryByText("Elige una pista guardada.")).toBeNull());
    next();
    expect(document.querySelector(".odo-flow")?.getAttribute("data-step")).toBe("2");
  });

  it("«Elige una pista guardada.» también se quita al cambiar de lugar", async () => {
    mockApi({ "GET /measurements": MEAS, "GET /tracks": page(TRACKS) });
    render(<Odometry />);
    choosePista();
    next();
    await screen.findByText("Elige una pista guardada.");
    fireEvent.change(screen.getByLabelText("Lugar o contorno"), { target: { value: "aula" } });
    await waitFor(() => expect(screen.queryByText("Elige una pista guardada.")).toBeNull());
  });

  it("con esquinas redondeadas lo avisa una vez", async () => {
    const round = track(
      5,
      "Pista redonda",
      RECT.map(([x, y]) => [x, y, 15] as V),
    );
    mockApi({ "GET /measurements": MEAS, "GET /tracks": page([round]) });
    render(<Odometry />);
    choosePista();
    await screen.findByRole("option", { name: /Pista redonda/ });
    fireEvent.change(screen.getByLabelText("Pista guardada"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Escala 1:N de la pista"), { target: { value: "5" } });
    expect(
      screen.getAllByText(/Esquinas redondeadas: el perímetro y el área incluyen las curvas/),
    ).toHaveLength(1);
  });

  it("la vista previa dibuja lados, ángulos y resumen dentro del lienzo, a 700 y a 300 px", async () => {
    for (const w of [700, 300]) {
      const log = stubCanvas(w, 280);
      mockApi({ "GET /measurements": MEAS, "GET /tracks": page(TRACKS) });
      render(<Odometry />);
      choosePista();
      await screen.findByRole("option", { name: /Aula dibujada/ });
      fireEvent.change(screen.getByLabelText("Pista guardada"), { target: { value: "1" } });
      // se descarta lo dibujado a 1:1 para revisar solo el dibujo final
      log.reset();
      fireEvent.change(screen.getByLabelText("Escala 1:N de la pista"), { target: { value: "5" } });
      await waitFor(() => expect(log.texts).toContain("Perímetro 28.00 m"));
      expect(log.texts).toContain("Área 48.00 m²");
      expect(log.texts).toContain("8.00 m");
      expect(log.texts).toContain("A 90°");
      expectClean(log);
      cleanup();
    }
  });
});

describe("Odometría · paso 4 con el plano de una pista", () => {
  it("compara contra el plano elegido: error frente al plano y diferencias por lado", async () => {
    stubCanvas(700, 360);
    const noPlan = measurement(3, {
      reference: null,
      result: result({ reference_perimeter_m: null, reference_area_m2: null }),
    });
    mockApi({
      "GET /measurements": { items: [noPlan], total: 1, limit: 200, offset: 0 },
      "GET /measurements/3": noPlan,
      "GET /tracks": page(TRACKS),
    });
    render(<Odometry />);
    choosePista();
    await screen.findByRole("option", { name: /Aula dibujada/ });
    fireEvent.change(screen.getByLabelText("Pista guardada"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Escala 1:N de la pista"), { target: { value: "5" } });
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Aula 204 #3" }));
    const table = await screen.findByRole("table", { name: "Lados del contorno medido" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1].textContent).toContain("AB");
    expect(rows[1].textContent).toContain("+2.00 m"); // medido 10 m frente al plano 8 m
    expect(screen.getAllByText(/28\.0/).length).toBeGreaterThan(0);
  });
});
