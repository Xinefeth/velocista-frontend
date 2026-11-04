import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PrecisionModel, preselect, tunable } from "@/ui/components/measurement/PrecisionModel";
import type { ModelEvaluationApi } from "@/infrastructure/contracts/measurements";
import { stubBrowser } from "../pages/_harness";
import { measurement, mockApi } from "./_api";

const ITEMS = [
  measurement(4, { place_name: "Casa" }),
  measurement(5, { place_name: "Casa" }),
  measurement(6, { place_name: "Casa" }),
  measurement(7, { method: "gps", place_name: "Parque" }),
  measurement(8, { status: "recording", result: null }),
];

const EVALUATION: ModelEvaluationApi = {
  method: "steps",
  measurement_count: 3,
  train_count: 2,
  holdout_measurement_id: 6,
  green_limit_pct: 3,
  initial_params: { gyro_bias_dps: 0, step_length_m: 0.51 },
  final_params: { gyro_bias_dps: 1.16, step_length_m: 0.81 },
  baseline: {
    mean_closure_error_m: 0.93,
    mean_closure_error_pct: 7.53,
    mean_abs_perimeter_error_pct: 40.7,
    quality: "red",
  },
  model: {
    mean_closure_error_m: 1.1,
    mean_closure_error_pct: 5.39,
    mean_abs_perimeter_error_pct: 9.4,
    quality: "yellow",
  },
  improvement_pct_points: 2.14,
  improved: true,
  cost_improved: true,
  meets_green: false,
  generalizes: true,
  verdict: "improves_not_green",
  curve: [
    { attempt: 0, without_model_pct: 7.53, with_model_pct: 7.53 },
    { attempt: 1, without_model_pct: 7.53, with_model_pct: 6.1 },
    { attempt: 2, without_model_pct: 7.53, with_model_pct: 5.39 },
  ],
  measurements: [
    {
      measurement_id: 4,
      role: "train",
      before: { closure_error_m: 1, closure_error_pct: 8.9, perimeter_error_pct: -36.5 },
      after: { closure_error_m: 0.6, closure_error_pct: 5.4, perimeter_error_pct: 0.6 },
    },
    {
      measurement_id: 6,
      role: "holdout",
      before: { closure_error_m: 0.4, closure_error_pct: 3.3, perimeter_error_pct: -36.3 },
      after: { closure_error_m: 0.8, closure_error_pct: 6.8, perimeter_error_pct: 1.1 },
    },
  ],
};

const PAGE = { items: ITEMS, total: 5, limit: 200, offset: 0 };

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("qué mediciones puede usar el modelo", () => {
  it("solo terminadas y no por GPS, de la más antigua a la más nueva", () => {
    expect(tunable([...ITEMS].reverse()).map((m) => m.id)).toEqual([4, 5, 6]);
  });

  it("preselecciona las del lugar medido más recientemente", () => {
    const list = tunable([...ITEMS, measurement(9, { place_name: "Aula" })]);
    expect(preselect(list)).toEqual([9]);
    expect(preselect([])).toEqual([]);
  });
});

describe("vista del modelo con la API", () => {
  it("evalúa las mediciones marcadas y muestra veredicto, KPIs y tabla", async () => {
    const api = mockApi({
      "GET /measurements": PAGE,
      "POST /precision-model/evaluations": EVALUATION,
    });
    render(<PrecisionModel />);
    expect(await screen.findByLabelText("Usar Casa #6")).toBeTruthy();
    // la de GPS y la sin terminar no se ofrecen
    expect(screen.queryByLabelText("Usar Parque #7")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Evaluar modelo" }));
    expect(await screen.findByText("El modelo baja el error, pero no llega a verde")).toBeTruthy();
    const post = api.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ measurement_ids: [4, 5, 6], max_attempts: 40 });
    expect(screen.getByLabelText("Resultado del modelo").textContent).toContain("2.14");
    const table = screen.getByRole("table", { name: "Error antes y después del modelo" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.cells[1].textContent)).toEqual(["Ajuste", "Validación"]);
    expect(screen.getByText(/también bajó en la medición de validación/)).toBeTruthy();
  });

  it("entrada inválida: con una sola medición no llama a la API", async () => {
    const api = mockApi({ "GET /measurements": PAGE });
    render(<PrecisionModel />);
    for (const id of [4, 5]) fireEvent.click(await screen.findByLabelText(`Usar Casa #${id}`));
    fireEvent.click(screen.getByRole("button", { name: "Evaluar modelo" }));
    expect(screen.getByRole("alert").textContent).toMatch(/al menos 2/);
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("entrada inválida: intentos fuera de rango", async () => {
    mockApi({ "GET /measurements": PAGE });
    render(<PrecisionModel />);
    await screen.findByLabelText("Usar Casa #6");
    fireEvent.change(screen.getByLabelText("Intentos del modelo"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Evaluar modelo" }));
    expect(screen.getByRole("alert").textContent).toMatch(/1 a 200/);
  });

  it("traduce el error del backend", async () => {
    mockApi({
      "GET /measurements": PAGE,
      "POST /precision-model/evaluations": {
        status: 422,
        body: { detail: { reason: "model_mixed_methods", detail: "x" } },
      },
    });
    render(<PrecisionModel />);
    await screen.findByLabelText("Usar Casa #6");
    fireEvent.click(screen.getByRole("button", { name: "Evaluar modelo" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/misma forma/));
  });

  it("sin mediciones por pasos lo avisa", async () => {
    mockApi({ "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 } });
    render(<PrecisionModel />);
    expect(await screen.findByText("Aún no hay mediciones por pasos terminadas.")).toBeTruthy();
  });
});
