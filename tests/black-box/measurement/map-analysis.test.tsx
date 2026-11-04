// Mapa de pista solo para análisis (HU-30, F1): texto visible, sin controles de envío, velocidad por
// mapa desactivada en prueba y competencia, giro total, advertencia y datos reales frente al simulador.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MapView } from "@/ui/pages/MapView";
import { Control } from "@/ui/pages/Control";
import { TrackComparison } from "@/ui/components/measurement/TrackComparison";
import { stubBrowser, WithConsole } from "../pages/_harness";
import { measurement, mockApi, result } from "./_api";
import type { TrackApi } from "@/infrastructure/contracts/tracks";

const TRACK: TrackApi = {
  id: 7,
  name: "Rectángulo 3 × 2,5",
  board: { width_cm: 400, height_cm: 300 },
  closed: true,
  points: [
    { x: 0, y: 0, radius: 0, gap: false },
    { x: 300, y: 0, radius: 0, gap: false },
    { x: 300, y: 250, radius: 0, gap: false },
    { x: 0, y: 250, radius: 0, gap: false },
  ],
  zones: [],
  start: { edge: 0, t: 0 },
  profile_id: null,
  length_cm: 1100,
  perimeter_cm: 1100,
  area_cm2: 75000,
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T10:00:00Z",
};
const ONLY_TEXT = "Solo análisis: en competencia el robot no usa el mapa";
const SIM_TOGGLE = "Mostrar simulador (desarrollo)";

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Lap = ReturnType<typeof measurement>;
function routes(lap: Lap, extra: Lap[] = []) {
  const all = [lap, ...extra];
  const byId = Object.fromEntries(all.map((m) => [`GET /measurements/${m.id}`, m]));
  return mockApi({
    "GET /tracks": { items: [TRACK], total: 1, limit: 200, offset: 0 },
    "GET /measurements": { items: all, total: all.length, limit: 200, offset: 0 },
    ...byId,
  });
}

describe("solo análisis", () => {
  it("la vista Mapa de pista y la comparación lo dicen con texto visible", async () => {
    routes(measurement(12));
    render(
      <WithConsole>
        <MapView />
      </WithConsole>,
    );
    await screen.findByRole("option", { name: /#12/ });
    const region = screen.getByRole("region", { name: "Mapa de pista" });
    expect(within(region).getAllByText(ONLY_TEXT)).toHaveLength(2); // bajo el título y en la tarjeta
  });

  it("no ofrece controles para iniciar, detener ni enviar el mapa al robot", async () => {
    routes(measurement(12));
    render(
      <WithConsole>
        <MapView />
      </WithConsole>,
    );
    await screen.findByRole("option", { name: /#12/ });
    const region = screen.getByRole("region", { name: "Mapa de pista" });
    const names = within(region)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    for (const name of names)
      expect(name).not.toMatch(/iniciar|arrancar|detener|parar|enviar|competencia/i);
    expect(within(region).queryByRole("switch")).toBeNull();
  });
});

describe("velocidad por mapa en Control", () => {
  const speedSwitch = () =>
    screen.getByText("Velocidad por mapa").closest(".row")!.querySelector("button")!;

  it("está desactivada en modo prueba y en competencia, con su motivo visible", () => {
    render(
      <WithConsole>
        <Control />
      </WithConsole>,
    );
    const check = () => {
      expect(speedSwitch().disabled).toBe(true);
      expect(speedSwitch().getAttribute("aria-checked")).toBe("false");
      expect(document.querySelector(".lockrow")!.textContent!.length).toBeGreaterThan(20);
    };
    check(); // modo prueba (el de arranque)
    fireEvent.click(screen.getByRole("button", { name: "Competencia" }));
    check();
    fireEvent.click(screen.getByRole("button", { name: "Prueba" }));
    check();
  });
});

describe("giro total y giro sobrante en la tabla", () => {
  it("muestra el giro total con ±360 de diseño y su sentido", async () => {
    routes(measurement(12, { result: result({ turn_total_deg: -358.2, heading_drift_deg: 6.5 }) }));
    render(<TrackComparison />);
    const table = screen.getByRole("table", { name: "Diseño frente a medido" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(6));
    const total = within(table).getByText("Giro total").closest("tr")!;
    expect(total.textContent).toContain("±360 °");
    expect(total.textContent).toMatch(/358[.,]20 ° a la derecha/);
  });

  it("una medición antigua sin el campo muestra «—» en el giro total", async () => {
    routes(measurement(12, { result: result({ heading_drift_deg: 6.5 }) }));
    render(<TrackComparison />);
    const table = screen.getByRole("table", { name: "Diseño frente a medido" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(6));
    const total = within(table).getByText("Giro total").closest("tr")!;
    expect(total.cells[2].textContent).toBe("—");
  });

  it("giro sobrante sobre 15° lleva icono y palabra «Revisar»; bajo la tolerancia no", async () => {
    routes(measurement(12, { result: result({ heading_drift_deg: 22.4 }) }));
    const { unmount } = render(<TrackComparison />);
    const table = screen.getByRole("table", { name: "Diseño frente a medido" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(6));
    const row = within(table).getByText("Giro sobrante").closest("tr")!;
    expect(row.textContent).toContain("Revisar");
    expect(row.querySelector(".rowwarn svg")).toBeTruthy();
    expect(row.querySelector(".rowwarn")!.getAttribute("role")).toBe("status");
    unmount();
    routes(measurement(12, { result: result({ heading_drift_deg: 6.5 }) }));
    render(<TrackComparison />);
    const table2 = screen.getByRole("table", { name: "Diseño frente a medido" });
    await waitFor(() => expect(within(table2).getAllByRole("row")).toHaveLength(6));
    expect(within(table2).getByText("Giro sobrante").closest("tr")!.textContent).not.toContain(
      "Revisar",
    );
  });
});

describe("datos reales frente a simulador", () => {
  it("por defecto solo lista vueltas del celular; el interruptor local suma las del simulador", async () => {
    const sim = measurement(13, { source: "simulator", place_name: "Simulada" });
    routes(measurement(12, { place_name: "Real" }), [sim]);
    render(<TrackComparison />);
    await screen.findByRole("option", { name: /Real #12/ });
    expect(screen.queryByRole("option", { name: /Simulada #13/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: SIM_TOGGLE }));
    expect(await screen.findByRole("option", { name: /Simulada #13/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: SIM_TOGGLE }));
    await waitFor(() => expect(screen.queryByRole("option", { name: /Simulada #13/ })).toBeNull());
  });

  it("si la vuelta elegida era del simulador y se apaga el interruptor, pasa a una real", async () => {
    const sim = measurement(30, { source: "simulator", place_name: "Simulada" });
    routes(measurement(12, { place_name: "Real" }), [sim]);
    render(<TrackComparison />);
    await screen.findByRole("option", { name: /Real #12/ });
    fireEvent.click(screen.getByRole("checkbox", { name: SIM_TOGGLE }));
    const select = screen.getByLabelText("Vuelta medida") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "30" } });
    await waitFor(() => expect(select.value).toBe("30"));
    fireEvent.click(screen.getByRole("checkbox", { name: SIM_TOGGLE }));
    await waitFor(() => expect(select.value).toBe("12"));
  });

  it("el carro: nota «no disponible» mientras no haya vueltas con el carro", async () => {
    routes(measurement(12));
    render(<TrackComparison />);
    expect(
      await screen.findByText(/Con el carro: no disponible \(sin modelo de velocidad\)/),
    ).toBeTruthy();
  });

  it("si hay una vuelta con el carro la nota desaparece", async () => {
    routes(measurement(12, { method: "car", mount: "robot" }));
    render(<TrackComparison />);
    await screen.findByRole("option", { name: /#12/ });
    expect(screen.queryByText(/Con el carro: no disponible/)).toBeNull();
  });
});

describe("estilos de los textos nuevos", () => {
  it("usan solo tokens de la paleta y nunca --dim", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(__dirname, "../../../src/ui/styles/prototype.css"), "utf8");
    const rules = [...css.matchAll(/((?:\.analysis-only|\.chk|\.rowwarn)[^{]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const [, sel, body] of rules) {
      expect(body, sel).not.toContain("--dim");
      expect(body, sel).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});
