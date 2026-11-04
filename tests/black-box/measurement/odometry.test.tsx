import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Odometry } from "@/ui/pages/measurement/Odometry";
import { stubBrowser } from "../pages/_harness";
import { measurement, mockApi, result } from "./_api";

const DEVICE = "cel-621b8d99-aaaa";
const PAGE = (
  items = [
    measurement(3),
    measurement(2, { result: result({ quality: "yellow", closure_error_pct: 4.2 }) }),
  ],
) => ({
  items,
  total: items.length,
  limit: 200,
  offset: 0,
});
const CAL = {
  device_id: DEVICE,
  calibration: { ...measurement(1).calibration },
  ready: { steps: true, car: false, gps: true },
  records: {},
};

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const step = () => document.querySelector(".odo-flow")?.getAttribute("data-step");

describe("Odometría · Medir terreno en 4 pasos", () => {
  it("paso 1 → 2: muestra la calibración guardada del celular", async () => {
    const api = mockApi({ "GET /measurements": PAGE(), [`GET /calibrations/${DEVICE}`]: CAL });
    render(<Odometry />);
    await waitFor(() =>
      expect((screen.getByLabelText("Celular que mide") as HTMLInputElement).value).toBe(DEVICE),
    );
    expect(screen.getByLabelText("Plano del lugar").textContent).toContain("48.0");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente: calibrar" }));
    expect(step()).toBe("2");
    expect(await screen.findByText("Sesgo 0.400 °/s")).toBeTruthy();
    expect(screen.getByText("Paso = 0.700 m")).toBeTruthy();
    expect(api.calls.some((c) => c.path === `/calibrations/${DEVICE}`)).toBe(true);
  });

  it("entrada inválida: «otro» sin nombre no deja avanzar", async () => {
    mockApi({ "GET /measurements": PAGE() });
    render(<Odometry />);
    fireEvent.change(screen.getByLabelText("Lugar o contorno"), { target: { value: "otro" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente: calibrar" }));
    expect(screen.getByRole("alert").textContent).toMatch(/nombre del lugar/);
    expect(step()).toBe("1");
  });

  it("entrada inválida: lado con cinta que no es número", async () => {
    mockApi({ "GET /measurements": PAGE() });
    render(<Odometry />);
    fireEvent.change(screen.getByLabelText("Lado medido con cinta"), { target: { value: "ocho" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente: calibrar" }));
    expect(screen.getByRole("alert").textContent).toMatch(/cinta/);
  });

  it("sin celular elegido no avanza", async () => {
    mockApi({ "GET /measurements": PAGE([]) });
    render(<Odometry />);
    await screen.findByText("Aún no hay mediciones guardadas.");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente: calibrar" }));
    expect(screen.getByRole("alert").textContent).toMatch(/celular/);
  });

  it("paso 3: sigue la medición en curso y sus lecturas hasta que termina", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finished = false;
    mockApi({
      "GET /measurements": () =>
        PAGE([
          measurement(9, finished ? {} : { status: "recording", result: null, reading_count: 120 }),
        ]),
      "GET /measurements/9/readings": [
        {
          seq: 0,
          t_ms: Date.parse("2026-11-03T10:00:01Z"),
          kind: "motion",
          gyro_z_dps: 1.5,
          accel: [0, 0, 9.8],
        },
        { seq: 1, t_ms: Date.parse("2026-11-03T10:00:02Z"), kind: "corner" },
      ],
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements/9": measurement(9),
    });
    render(<Odometry />);
    await waitFor(() =>
      expect((screen.getByLabelText("Celular que mide") as HTMLInputElement).value).toBe(DEVICE),
    );
    fireEvent.click(screen.getByRole("button", { name: /3\s*Medir/ }));
    expect(await screen.findByText("Midiendo Aula 204 #9")).toBeTruthy();
    const rows = within(screen.getByRole("table", { name: "Lecturas del celular" })).getAllByRole(
      "row",
    );
    expect(rows[1].textContent).toContain("esquina");
    expect(
      (screen.getByRole("button", { name: "Ver resultado" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    finished = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await screen.findByText("Terminada: Aula 204 #9")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));
    await waitFor(() => expect(step()).toBe("4"));
  });

  it("paso 4: resultado, comparación con el plano y recomendaciones", async () => {
    mockApi({ "GET /measurements": PAGE(), "GET /measurements/3": measurement(3) });
    render(<Odometry />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Aula 204 #3" }));
    await waitFor(() => expect(step()).toBe("4"));
    expect(screen.getAllByText("Medición confiable").length).toBeGreaterThan(0);
    const kpis = screen.getByLabelText("Medidas del resultado").textContent!;
    expect(kpis).toContain("31.5");
    expect(kpis).toContain("plano 32.0 m");
    expect(screen.getByLabelText("Recomendaciones").textContent).toContain("lista para el informe");
    // apagar la corrección muestra el perímetro crudo
    fireEvent.click(screen.getByRole("switch", { name: /Corregir por cierre/ }));
    expect(screen.getByLabelText("Medidas del resultado").textContent).toContain("31.9");
  });

  it("tabla de mediciones guardadas con su calidad", async () => {
    mockApi({ "GET /measurements": PAGE() });
    render(<Odometry />);
    const table = await screen.findByRole("table", { name: "Mediciones guardadas" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(3));
    expect(table.textContent).toContain("Confiable");
    expect(table.textContent).toContain("Revisar");
  });

  it("borrar pide confirmación y vuelve a listar", async () => {
    const api = mockApi({
      "GET /measurements": PAGE(),
      "GET /measurements/3": measurement(3),
      "DELETE /measurements/3": { status: 204 },
    });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(<Odometry />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Aula 204 #3" }));
    fireEvent.click(await screen.findByRole("button", { name: "Borrar medición" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("si la API falla lo muestra", async () => {
    mockApi({
      "GET /measurements": {
        status: 503,
        body: { detail: { reason: "db", detail: "Base caída" } },
      },
    });
    render(<Odometry />);
    expect((await screen.findByRole("alert")).textContent).toBe("Base caída");
  });
});
