import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { stubBrowser } from "../pages/_harness";
import { measurement, mockApi } from "./_api";

const DEVICE = "cel-621b8d99-aaaa";
const CAL = {
  device_id: DEVICE,
  calibration: { ...measurement(1).calibration },
  ready: { steps: true, car: false, gps: true },
  records: {},
};
const PAGE = (items = [measurement(3), measurement(4, { status: "recording", result: null })]) => ({
  items,
  total: items.length,
  limit: 200,
  offset: 0,
});

function show() {
  return render(
    <PhoneProvider initialDevice={DEVICE}>
      <PhoneApp />
    </PhoneProvider>,
  );
}
const tab = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("página del celular: conexión", () => {
  it("muestra el código corto de este celular y conecta con el backend", async () => {
    mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /health": { status: "ok", database: "ok" },
    });
    show();
    expect(screen.getByLabelText("Código de este celular").textContent).toBe("621b8d99");
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
    expect(await screen.findByText("Conectado ✔ (base de datos lista)")).toBeTruthy();
  });

  it("si la base de datos no responde lo dice", async () => {
    mockApi({ "GET /health": { status: "ok", database: "down" } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/base de datos no/);
  });

  it("sin HTTPS no activa los sensores", async () => {
    mockApi({});
    vi.stubGlobal("isSecureContext", false);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Activar sensores" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/https/);
  });

  it("recupera un código anterior y entrada inválida (muy corto)", async () => {
    mockApi({ "GET /measurements": PAGE([measurement(1, { device_id: "cel-77aa0011-x" })]) });
    show();
    fireEvent.change(screen.getByLabelText("Tu código"), { target: { value: "77a" } });
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/6 primeros/);
    fireEvent.change(screen.getByLabelText("Tu código"), { target: { value: "77aa0011" } });
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    expect(await screen.findByText(/recuperé tus datos \(1 mediciones\)/)).toBeTruthy();
    expect(screen.getByLabelText("Código de este celular").textContent).toBe("77aa0011");
  });
});

describe("página del celular: calibrar y medir", () => {
  it("muestra la calibración guardada", async () => {
    mockApi({ [`GET /calibrations/${DEVICE}`]: CAL });
    show();
    tab("2. Calibrar");
    const state = screen.getByLabelText("Estado de la calibración");
    await waitFor(() => expect(state.textContent).toContain("✔ sesgo 0.40 °/s"));
    expect(state.textContent).toContain("✔ 0.700 m");
  });

  it("calibrar el giroscopio sin sensores activos avisa qué hacer", async () => {
    mockApi({ [`GET /calibrations/${DEVICE}`]: CAL });
    show();
    tab("2. Calibrar");
    fireEvent.click(screen.getByRole("button", { name: "Calibrar giroscopio" }));
    expect((await screen.findAllByRole("alert"))[0].textContent).toMatch(/Activa los sensores/);
  });

  it("medir por pasos sin sensores no empieza ni crea la medición", async () => {
    const api = mockApi({ [`GET /calibrations/${DEVICE}`]: CAL, "GET /measurements": PAGE() });
    show();
    tab("3. Medir");
    fireEvent.change(screen.getByLabelText("Nombre del lugar"), { target: { value: "Mi cuarto" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar medición" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Activa los sensores/);
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("por GPS sin señal no empieza", async () => {
    mockApi({ [`GET /calibrations/${DEVICE}`]: CAL, "GET /measurements": PAGE() });
    show();
    tab("3. Medir");
    fireEvent.change(screen.getByLabelText("¿Qué vas a medir?"), { target: { value: "gps" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar medición" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/GPS tenga señal/);
  });

  it("lista mis mediciones, abre una terminada y borra con confirmación", async () => {
    const api = mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": PAGE(),
      "GET /measurements/3": measurement(3),
      "DELETE /measurements/4": { status: 204 },
    });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    show();
    tab("3. Medir");
    const table = await screen.findByRole("table", { name: "Mis mediciones" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(3));
    expect(table.textContent).toContain("sin terminar");
    fireEvent.click(within(table).getByText("Aula 204 #3"));
    expect(await screen.findByRole("region", { name: "Resultado" })).toBeTruthy();
    expect(screen.getByText("Medición confiable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Borrar Aula 204 #4" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(api.calls.some((c) => c.path === `/measurements?device_id=${DEVICE}&limit=200`)).toBe(
      true,
    );
  });
});

describe("página del celular: error GPS y modelo", () => {
  it("la prueba del GPS sin señal no empieza", async () => {
    mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      [`GET /gps-trials`]: [],
      [`GET /gps-trials/summary`]: { trials: 0, methods: {}, best_method: null, min_side_m: null },
    });
    show();
    tab("4. Error GPS");
    fireEvent.click(screen.getByRole("button", { name: "Estoy en el inicio" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/No hay señal GPS/);
  });

  it("el modelo corre con las mediciones preseleccionadas y muestra el resultado", async () => {
    const api = mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": PAGE([
        measurement(5),
        measurement(6),
        measurement(7, { method: "gps" }),
      ]),
      "POST /precision-model/runs": {
        id: 1,
        device_id: DEVICE,
        measurement_ids: [5, 6],
        applied: false,
        created_at: "2026-11-03T10:00:00Z",
        result: {
          method: "steps",
          initial_params: { gyro_bias_dps: 0, step_length_m: 0.77 },
          final_params: { gyro_bias_dps: 0.4, step_length_m: 0.7 },
          baseline_cost: 9,
          final_cost: 2,
          improved: true,
          meets_green: true,
          attempts: [{ attempt: 1, cost: 2, best_cost: 2, accepted: true }],
          measurements: [
            {
              measurement_id: 5,
              before: { closure_error_pct: 8, perimeter_error_pct: 10 },
              after: { closure_error_pct: 1, perimeter_error_pct: 0.5 },
            },
          ],
          holdout: null,
          generalizes: null,
        },
      },
    });
    show();
    tab("5. Modelo");
    expect(await screen.findByText(/1 mediciones por GPS no salen aquí/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Correr modelo" }));
    expect(await screen.findByText("El error bajó de 9.0 % a 2.0 %")).toBeTruthy();
    expect(api.calls.find((c) => c.method === "POST")!.body).toEqual({
      measurement_ids: [5, 6],
      max_attempts: 40,
      apply: false,
    });
  });

  it("entrada inválida: con una sola medición marcada no corre", async () => {
    mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": PAGE([measurement(5), measurement(6)]),
    });
    show();
    tab("5. Modelo");
    fireEvent.click(await screen.findByLabelText("Usar Aula 204 #5"));
    fireEvent.click(screen.getByRole("button", { name: "Correr modelo" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/al menos 2/);
  });
});
