import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TrackComparison } from "@/ui/components/measurement/TrackComparison";
import { alignTo, compareTrack, designPath, laps } from "@/domain/measurement/trackCompare";
import { perimeter } from "@/domain/measurement/plot";
import { toTrack } from "@/infrastructure/http/tracks";
import type { TrackApi } from "@/infrastructure/contracts/tracks";
import { stubBrowser } from "../pages/_harness";
import { measurement, mockApi, result } from "./_api";

/** Rectángulo de 3 × 2,5 m sin curvas: 11 m de vuelta y 7,5 m² de área. */
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

const LAP = measurement(12, {
  place_name: "Pista del aula",
  result: result({
    perimeter_m: 11.55,
    area_m2: 7.2,
    closure_error_m: 0.31,
    heading_drift_deg: 6.5,
  }),
});

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("comparación diseño frente a medido (unitarias)", () => {
  it("la pista diseñada se muestrea en metros", () => {
    const pts = designPath(toTrack(TRACK));
    expect(perimeter(pts)).toBeCloseTo(11, 1);
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(3, 1);
  });

  it("alinear traslada el centro del recorrido al de la pista sin deformarlo", () => {
    const design = [
      { x: 0, y: 0 },
      { x: 2, y: 2 },
    ];
    const out = alignTo(design, [
      { x: 10, y: 10 },
      { x: 12, y: 12 },
    ]);
    expect(out).toEqual(design);
  });

  it("tabla: largo y área con su diferencia, cierre y giro sobrante", () => {
    const rows = compareTrack(toTrack(TRACK), LAP);
    expect(rows.map((r) => r.label)).toEqual([
      "Largo de la vuelta",
      "Área encerrada",
      "Error de cierre",
      "Giro total",
      "Giro sobrante",
    ]);
    expect(rows[0].design).toBe(11);
    expect(rows[0].diffPct).toBeCloseTo(5);
    expect(rows[1].diffPct).toBeCloseTo(-4);
    expect(rows[4].measured).toBe(6.5);
  });

  it("solo las mediciones terminadas que no son por GPS sirven como vuelta", () => {
    const items = [
      measurement(1, { method: "gps" }),
      measurement(2),
      measurement(3, { result: null }),
    ];
    expect(laps(items).map((m) => m.id)).toEqual([2]);
  });
});

describe("vista Pista diseñada frente a pista medida", () => {
  it("carga pistas y vueltas, pide la vuelta completa y compara", async () => {
    const api = mockApi({
      "GET /tracks": { items: [TRACK], total: 1, limit: 200, offset: 0 },
      "GET /measurements": { items: [LAP], total: 1, limit: 200, offset: 0 },
      "GET /measurements/12": LAP,
    });
    render(<TrackComparison />);
    const table = screen.getByRole("table", { name: "Diseño frente a medido" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(6));
    expect(table.textContent).toContain("11.00 m");
    expect(table.textContent).toContain("+5.0 %");
    expect(screen.getAllByText("Medición confiable").length).toBe(1);
    expect(api.calls.some((c) => c.path === "/measurements/12")).toBe(true);
  });

  it("sin pistas ni vueltas lo explica", async () => {
    mockApi({
      "GET /tracks": { items: [], total: 0, limit: 200, offset: 0 },
      "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
    });
    render(<TrackComparison />);
    expect(await screen.findByRole("option", { name: "Sin pistas en el Trazador" })).toBeTruthy();
    expect(screen.getByText(/Elige una pista y una vuelta medida/)).toBeTruthy();
  });

  it("cambiar de vuelta pide esa medición", async () => {
    const other = measurement(13, { place_name: "Pista 2" });
    const api = mockApi({
      "GET /tracks": { items: [TRACK], total: 1, limit: 200, offset: 0 },
      "GET /measurements": { items: [LAP, other], total: 2, limit: 200, offset: 0 },
      "GET /measurements/12": LAP,
      "GET /measurements/13": other,
    });
    render(<TrackComparison />);
    await screen.findByRole("option", { name: /Pista 2 #13/ });
    fireEvent.change(screen.getByLabelText("Vuelta medida"), { target: { value: "12" } });
    await waitFor(() => expect(api.calls.some((c) => c.path === "/measurements/12")).toBe(true));
  });

  it("si la API falla lo muestra", async () => {
    mockApi({
      "GET /tracks": { status: 503, body: { detail: { reason: "db", detail: "Base caída" } } },
      "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
    });
    render(<TrackComparison />);
    expect((await screen.findByRole("alert")).textContent).toBe("Base caída");
  });
});
