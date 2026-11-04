import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GpsTrials } from "@/ui/components/measurement/GpsTrials";
import { gpsFits } from "@/domain/measurement/gpsFit";
import { stubBrowser } from "../pages/_harness";
import { gpsTrial, mockApi } from "./_api";

const SUMMARY = {
  trials: 3,
  methods: {
    single: { mean_error_m: 6.2, max_error_m: 9, mean_error_pct: 12 },
    mean: { mean_error_m: 3.1, max_error_m: 4, mean_error_pct: 6 },
    filtered: { mean_error_m: 2.4, max_error_m: 3, mean_error_pct: 5 },
  },
  best_method: "filtered",
  improvement_pct: 61.3,
  target_pct: 10,
  min_side_m: 30,
};

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("regla: ¿sirve el GPS en este lugar?", () => {
  it("sirve si el lado más corto alcanza el mínimo del backend", () => {
    expect(gpsFits(30, 30)?.tone).toBe("good");
    expect(gpsFits(6, 30)?.tone).toBe("bad");
    expect(gpsFits(0, 30)?.tone).toBe("warn");
    expect(gpsFits(10, null)).toBeNull();
  });
});

describe("vista Precisión del GPS con datos del backend", () => {
  it("muestra el resumen, una fila por prueba y el veredicto", async () => {
    const api = mockApi({
      "GET /gps-trials": [gpsTrial(2, 8, 3), gpsTrial(1, 5, 2)],
      "GET /gps-trials/summary": SUMMARY,
    });
    render(<GpsTrials />);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.cells[0].textContent)).toEqual([
      "Cancha 1 #1Aire libre",
      "Cancha 2 #2Aire libre",
    ]);
    expect(screen.getByLabelText("Resumen del error del GPS").textContent).toContain("61");
    expect(screen.getByText("3 pruebas")).toBeTruthy();
    // lado de 6 m con un mínimo de 30 m: no sirve
    expect(screen.getByText("No, el lugar es chico para el GPS")).toBeTruthy();
    expect(api.calls[1].path).toBe("/gps-trials/summary?target_pct=10");
  });

  it("al escribir un lado mayor, el veredicto cambia a que sí sirve", async () => {
    mockApi({ "GET /gps-trials": [gpsTrial(1, 5, 2)], "GET /gps-trials/summary": SUMMARY });
    render(<GpsTrials />);
    await screen.findByText("No, el lugar es chico para el GPS");
    fireEvent.change(screen.getByLabelText("Lado más corto del lugar a medir"), {
      target: { value: "40" },
    });
    expect(screen.getByText("Sí, el GPS sirve en este lugar")).toBeTruthy();
  });

  it("entrada inválida: un lado vacío pide escribirlo", async () => {
    mockApi({ "GET /gps-trials": [gpsTrial(1, 5, 2)], "GET /gps-trials/summary": SUMMARY });
    render(<GpsTrials />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Lado más corto del lugar a medir"), {
      target: { value: "" },
    });
    expect(screen.getByText("Escribe el lado más corto del lugar")).toBeTruthy();
  });

  it("filtra por celular y vuelve a pedir los datos de ese celular", async () => {
    const api = mockApi({
      "GET /gps-trials": [gpsTrial(1, 5, 2)],
      "GET /gps-trials/summary": SUMMARY,
    });
    render(<GpsTrials />);
    await screen.findByRole("option", { name: "621b8d99" });
    fireEvent.change(screen.getByLabelText("Celular"), {
      target: { value: "cel-621b8d99-aaaa" },
    });
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === "/gps-trials?device_id=cel-621b8d99-aaaa")).toBe(
        true,
      ),
    );
  });

  it("sin pruebas avisa que faltan y no da veredicto", async () => {
    mockApi({
      "GET /gps-trials": [],
      "GET /gps-trials/summary": { trials: 0, methods: {}, best_method: null, min_side_m: null },
    });
    render(<GpsTrials />);
    expect(await screen.findByText("Aún no hay pruebas del GPS.")).toBeTruthy();
    expect(screen.getByText("Faltan pruebas")).toBeTruthy();
  });

  it("si la API falla muestra el error", async () => {
    mockApi({
      "GET /gps-trials": { status: 503, body: { detail: { reason: "db", detail: "Base caída" } } },
      "GET /gps-trials/summary": SUMMARY,
    });
    render(<GpsTrials />);
    expect((await screen.findByRole("alert")).textContent).toBe("Base caída");
  });
});
