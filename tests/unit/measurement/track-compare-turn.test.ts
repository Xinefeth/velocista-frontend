// Giro total y giro sobrante en la comparación del mapa (HU-30, F1) y filtro de vueltas por origen.
import { describe, expect, it } from "vitest";
import { compareTrack, laps, TURN_TOLERANCE_DEG } from "@/domain/measurement/trackCompare";
import { toTrack } from "@/infrastructure/http/tracks";
import type { TrackApi } from "@/infrastructure/contracts/tracks";
import { measurement, result } from "../../black-box/measurement/_api";

const TRACK: TrackApi = {
  id: 7,
  name: "Rectángulo",
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
const rows = (r: Parameters<typeof result>[0]) =>
  compareTrack(toTrack(TRACK), measurement(1, { result: result(r) }));
const row = (label: string, r: Parameters<typeof result>[0]) =>
  rows(r).find((x) => x.label === label)!;

describe("fila «Giro total»", () => {
  it("va antes de «Giro sobrante», con diseño ±360° y unidad °", () => {
    const labels = rows({}).map((r) => r.label);
    expect(labels).toEqual([
      "Largo de la vuelta",
      "Área encerrada",
      "Error de cierre",
      "Giro total",
      "Giro sobrante",
    ]);
    const total = row("Giro total", { turn_total_deg: -358.2 });
    expect(total.designText).toBe("±360");
    expect(total.unit).toBe("°");
  });

  it("muestra el valor absoluto con el sentido en palabras", () => {
    const right = row("Giro total", { turn_total_deg: -358.2 });
    expect(right.measured).toBeCloseTo(358.2);
    expect(right.measuredText).toMatch(/358[.,]20 ° a la derecha/);
    expect(row("Giro total", { turn_total_deg: 361 }).measuredText).toMatch(/a la izquierda/);
  });

  it("sin el campo (backend viejo o GPS) queda vacío, no 0", () => {
    for (const turn of [undefined, null]) {
      const total = row("Giro total", { turn_total_deg: turn });
      expect(total.measured).toBeNull();
      expect(total.measuredText).toBeUndefined();
    }
  });

  it("una medición sin resultado no rompe la tabla", () => {
    const out = compareTrack(toTrack(TRACK), measurement(1, { result: null }));
    expect(out.find((r) => r.label === "Giro total")!.measured).toBeNull();
  });
});

describe("advertencia de «Giro sobrante»", () => {
  it("la tolerancia es 15° y se marca solo por encima", () => {
    expect(TURN_TOLERANCE_DEG).toBe(15);
    expect(row("Giro sobrante", { heading_drift_deg: 15 }).warn).toBeUndefined();
    expect(row("Giro sobrante", { heading_drift_deg: 15.1 }).warn).toContain("15");
    expect(row("Giro sobrante", { heading_drift_deg: -20 }).warn).toBeTruthy();
  });

  it("sin dato o con poco giro no hay advertencia", () => {
    expect(row("Giro sobrante", { heading_drift_deg: null }).warn).toBeUndefined();
    expect(row("Giro sobrante", { heading_drift_deg: 4.1 }).warn).toBeUndefined();
  });

  it("las demás filas nunca llevan advertencia", () => {
    for (const r of rows({ heading_drift_deg: 90 }))
      if (r.label !== "Giro sobrante") expect(r.warn).toBeUndefined();
  });
});

describe("laps(): datos reales del celular por defecto", () => {
  const items = [
    measurement(1, { source: "phone" }),
    measurement(2, { source: "simulator" }),
    measurement(3, { source: "robot" }),
    measurement(4, { source: "phone", method: "gps" }),
    measurement(5, { source: "phone", result: null }),
    measurement(6, { source: "phone", method: "car" }),
  ];
  it("sin el interruptor solo entran las de source phone, terminadas y que no son GPS", () => {
    expect(laps(items).map((m) => m.id)).toEqual([6, 1]);
  });
  it("con el simulador activado entran también las de otro origen (nunca GPS ni sin resultado)", () => {
    expect(laps(items, true).map((m) => m.id)).toEqual([6, 3, 2, 1]);
  });
});
