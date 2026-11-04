import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Areas, parseRows, PRESETS } from "@/ui/pages/measurement/Areas";
import type { PolygonApi } from "@/infrastructure/contracts/measurements";
import { stubBrowser } from "../pages/_harness";
import { mockApi } from "./_api";

function polygon(overrides: Partial<PolygonApi> = {}): PolygonApi {
  return {
    points: PRESETS.L.points,
    sides_m: [12, 3, 9, 7, 3, 10],
    angles_deg: [90, 90, 90, 270, 90, 90],
    perimeter_m: 44,
    area_m2: 57,
    concave: true,
    self_crossing: false,
    closure_error_m: 0,
    angle_sum_error_deg: 0,
    closes: true,
    computed_sides: [],
    computed_angles: [],
    warnings: [],
    ...overrides,
  };
}

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("lectura de lados y ángulos escritos", () => {
  it("vacío es «no se sabe» y acepta coma decimal", () => {
    expect(
      parseRows([
        { side: "3,5", angle: "" },
        { side: "4", angle: "90" },
        { side: "", angle: "" },
      ]),
    ).toEqual({ sides: [3.5, 4, null], angles: [null, 90, null] });
  });

  it("rechaza texto y figuras de menos de 3 lados", () => {
    expect(
      parseRows([
        { side: "a", angle: "" },
        { side: "1", angle: "" },
        { side: "1", angle: "" },
      ]),
    ).toMatch(/Lado 1/);
    expect(parseRows([{ side: "1", angle: "" }])).toMatch(/al menos 3/);
  });
});

describe("marcar puntos (HU-41)", () => {
  it("al abrir calcula la acera en L con el backend y muestra el área", async () => {
    const api = mockApi({ "POST /polygons/from-points": polygon() });
    render(<Areas />);
    expect(await screen.findByText("57.00")).toBeTruthy();
    expect(api.calls[0].body).toEqual({ points: PRESETS.L.points });
    expect(screen.getByText("Figura cóncava: el área se calcula igual.")).toBeTruthy();
  });

  it("agregar un punto escrito vuelve a pedir el cálculo con ese punto", async () => {
    const api = mockApi({ "POST /polygons/from-points": polygon() });
    render(<Areas />);
    await screen.findByText("57.00");
    fireEvent.change(screen.getByLabelText("x del punto"), { target: { value: "1,5" } });
    fireEvent.change(screen.getByLabelText("y del punto"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar punto" }));
    await waitFor(() => expect(api.calls).toHaveLength(2));
    const sent = (api.calls[1].body as { points: unknown[] }).points;
    expect(sent.at(-1)).toEqual({ x: 1.5, y: 13 });
  });

  it("entrada inválida: un punto sin y no se agrega", async () => {
    const api = mockApi({ "POST /polygons/from-points": polygon() });
    render(<Areas />);
    await screen.findByText("57.00");
    fireEvent.change(screen.getByLabelText("x del punto"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar punto" }));
    expect(screen.getByRole("alert").textContent).toMatch(/x e y/);
    expect(api.calls).toHaveLength(1);
  });

  it("con menos de 3 puntos no llama al backend", async () => {
    const api = mockApi({ "POST /polygons/from-points": polygon() });
    render(<Areas />);
    await screen.findByText("57.00");
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(screen.getByText("Marca al menos 3 puntos o calcula el plano.")).toBeTruthy();
    expect(api.calls).toHaveLength(1);
  });

  it("avisa si los lados se cruzan", async () => {
    mockApi({
      "POST /polygons/from-points": polygon({
        self_crossing: true,
        closes: false,
        warnings: ["self_crossing"],
      }),
    });
    render(<Areas />);
    expect(await screen.findByText("Dos lados se cruzan: el área no es válida.")).toBeTruthy();
  });
});

describe("lados y ángulos (HU-43)", () => {
  it("calcula el lado y los ángulos que faltan y los marca como calculados", async () => {
    const api = mockApi({
      "POST /polygons/from-points": polygon(),
      "POST /polygons/solve": polygon({
        points: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 6 },
          { x: 0, y: 6 },
        ],
        sides_m: [8, 6, 8, 6],
        angles_deg: [90, 90, 90, 90],
        area_m2: 48,
        perimeter_m: 28,
        concave: false,
        computed_sides: [3],
        computed_angles: [3],
      }),
    });
    render(<Areas />);
    fireEvent.click(screen.getByRole("button", { name: "Lados y ángulos" }));
    fireEvent.click(screen.getByRole("button", { name: "Calcular plano" }));
    expect(await screen.findByText("48.00")).toBeTruthy();
    const solve = api.calls.find((c) => c.path === "/polygons/solve")!;
    expect(solve.body).toEqual({ sides_m: [8, 6, 8, null], angles_deg: [90, 90, 90, null] });
    const rows = within(
      screen.getByRole("table", { name: "Lados y ángulos de la figura" }),
    ).getAllByRole("row");
    expect(rows[4].textContent).toContain("calculado");
  });

  it("entrada inválida: texto en un lado", async () => {
    const api = mockApi({ "POST /polygons/from-points": polygon() });
    render(<Areas />);
    fireEvent.click(screen.getByRole("button", { name: "Lados y ángulos" }));
    fireEvent.change(screen.getByLabelText("Lado 2"), { target: { value: "seis" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcular plano" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Lado 2/);
    expect(api.calls.some((c) => c.path === "/polygons/solve")).toBe(false);
  });

  it("traduce cuando faltan demasiados datos", async () => {
    mockApi({
      "POST /polygons/from-points": polygon(),
      "POST /polygons/solve": {
        status: 422,
        body: { detail: { reason: "polygon_underdetermined", detail: "x" } },
      },
    });
    render(<Areas />);
    fireEvent.click(screen.getByRole("button", { name: "Lados y ángulos" }));
    fireEvent.click(screen.getByRole("button", { name: "Calcular plano" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Faltan demasiados datos/);
  });

  it("agrega y quita lados, nunca menos de 3", () => {
    mockApi({ "POST /polygons/from-points": polygon() });
    render(<Areas />);
    fireEvent.click(screen.getByRole("button", { name: "Lados y ángulos" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar lado" }));
    expect(screen.getByLabelText("Lado 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quitar lado" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar lado" }));
    expect(screen.queryByLabelText("Lado 4")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Quitar lado" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("comparar con el plano a escala", () => {
  it("lleva el plano a tamaño real y muestra la diferencia", async () => {
    mockApi({ "POST /polygons/from-points": polygon({ perimeter_m: 28, area_m2: 48 }) });
    render(<Areas />);
    await screen.findByText("48.00");
    fireEvent.change(screen.getByLabelText("Largo del plano"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Ancho del plano"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Escala del plano"), { target: { value: "2" } });
    const table = screen.getByRole("table", { name: "Plano frente a figura" });
    expect(table.textContent).toContain("28.00 m");
    expect(table.textContent).toContain("0.0 %");
    expect(table.textContent).not.toContain("+0.0");
  });

  it("entrada inválida: escala 0", async () => {
    mockApi({ "POST /polygons/from-points": polygon() });
    render(<Areas />);
    await screen.findByText("57.00");
    fireEvent.change(screen.getByLabelText("Escala del plano"), { target: { value: "0" } });
    expect(screen.getByText("Escribe largo, ancho y escala mayores que 0.")).toBeTruthy();
  });
});
