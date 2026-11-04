// Aviso de lugar chico con el error del GPS medido en SP-06 (HU-37, F2): consulta única del
// resumen, aviso antes de empezar, aviso al terminar con ambos números y botón «Medir por pasos».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { GRAVITY } from "@/domain/measurement/phone";
import { stubBrowser } from "../../black-box/pages/_harness";
import { measurement, mockApi, result } from "../../black-box/measurement/_api";

const DEVICE = "cel-621b8d99-bbbb";
let gpsCallback: ((p: GeolocationPosition) => void) | null = null;

const CAL = {
  device_id: DEVICE,
  calibration: { ...measurement(1).calibration },
  ready: { steps: true, car: false, gps: true },
  records: {},
};
const SUMMARY = (min: number | null, trials = 3) => ({
  trials,
  methods: {},
  best_method: null,
  min_side_m: min,
});

beforeEach(() => {
  stubBrowser();
  sessionStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition: (ok: (p: GeolocationPosition) => void) => ((gpsCallback = ok), 1) },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const summaryCalls = (calls: { path: string }[]) =>
  calls.filter((c) => c.path.startsWith("/gps-trials/summary"));

function open(routes: Record<string, unknown>) {
  const api = mockApi({
    [`GET /calibrations/${DEVICE}`]: CAL,
    "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
    ...routes,
  });
  render(
    <PhoneProvider initialDevice={DEVICE}>
      <PhoneApp />
    </PhoneProvider>,
  );
  return api;
}

const goMeasure = async () => {
  fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
  await tick(0);
};
const pickMethod = (method: string) =>
  fireEvent.change(screen.getByLabelText("¿Qué vas a medir?"), { target: { value: method } });

describe("aviso antes de empezar (método GPS)", () => {
  it("con el mínimo medido en SP-06 lo muestra con el número, como región de estado", async () => {
    const api = open({ "GET /gps-trials/summary": SUMMARY(30) });
    await goMeasure();
    pickMethod("gps");
    const advice = document.querySelector(".gpsadvice")!;
    expect(advice.getAttribute("role")).toBe("status");
    expect(advice.textContent).toMatch(
      /^Con el error de tu GPS, el lado mínimo es 30[.,]0 m: si tu terreno es más chico, mide por pasos\.$/,
    );
    expect(summaryCalls(api.calls)).toHaveLength(1);
    expect(summaryCalls(api.calls)[0].path).toContain(`device_id=${DEVICE}`);
    expect(summaryCalls(api.calls)[0].path).toContain("target_pct=10");
  });

  it("lee el resumen una sola vez: cambiar de método o de pestaña no repite la petición", async () => {
    const api = open({ "GET /gps-trials/summary": SUMMARY(30) });
    await goMeasure();
    pickMethod("gps");
    pickMethod("steps");
    pickMethod("gps");
    fireEvent.click(screen.getByRole("button", { name: "1. Conexión" }));
    await goMeasure();
    await tick(5000); // sin sondeo
    expect(summaryCalls(api.calls)).toHaveLength(1);
  });

  it("no consulta nada hasta entrar en Medir", async () => {
    const api = open({ "GET /gps-trials/summary": SUMMARY(30) });
    await tick(1000);
    expect(summaryCalls(api.calls)).toHaveLength(0);
  });

  it("por pasos no muestra el aviso", async () => {
    open({ "GET /gps-trials/summary": SUMMARY(30) });
    await goMeasure();
    expect(document.querySelector(".gpsadvice")).toBeNull();
  });

  it("sin pruebas SP-06 lo dice y enlaza a la pestaña 4", async () => {
    open({ "GET /gps-trials/summary": SUMMARY(null, 0) });
    await goMeasure();
    pickMethod("gps");
    const advice = document.querySelector(".gpsadvice")!;
    expect(advice.textContent).toContain("Aún no hay pruebas de error del GPS");
    expect(advice.textContent).toContain("el aviso del servidor sigue");
    fireEvent.click(within(advice as HTMLElement).getByRole("button", { name: /pestaña 4/ }));
    expect(screen.getByRole("button", { name: "4. Error GPS" }).getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("si el resumen falla no muestra aviso ni rompe la pestaña", async () => {
    open({}); // 404 del resumen
    await goMeasure();
    pickMethod("gps");
    expect(document.querySelector(".gpsadvice")).toBeNull();
    expect(screen.getByRole("button", { name: "Iniciar medición" })).toBeTruthy();
  });
});

describe("aviso al terminar una medición GPS cerrada", () => {
  async function runGpsMeasurement(perimeter: number, closed = true, warnings: string[] = []) {
    const finished = measurement(9, {
      method: "gps",
      closed,
      place_name: "Parque central",
      reference: null,
      result: result({
        method: "gps",
        perimeter_m: perimeter,
        area_m2: 50,
        min_gps_size_m: 30,
        warnings,
      }),
    });
    open({
      "GET /gps-trials/summary": SUMMARY(30),
      "POST /measurements": {
        status: 201,
        body: { ...finished, status: "recording", result: null },
      },
      "POST /measurements/9/readings": {
        accepted: 1,
        duplicates: 0,
        discarded: {},
        total_readings: 1,
      },
      "POST /measurements/9/finish": finished,
    });
    fireEvent.click(screen.getByRole("button", { name: "Activar sensores" }));
    expect(await screen.findByText(/Sensores activados/)).toBeTruthy();
    const e = new Event("devicemotion") as Event & Record<string, unknown>;
    e.accelerationIncludingGravity = { x: 0, y: 0, z: GRAVITY };
    e.rotationRate = { alpha: 0, beta: 0, gamma: 0 };
    window.dispatchEvent(e);
    gpsCallback?.({
      coords: { latitude: -8.1116, longitude: -79.0287, accuracy: 4 },
      timestamp: Date.now(),
    } as GeolocationPosition);
    await goMeasure();
    pickMethod("gps");
    fireEvent.change(screen.getByLabelText("Nombre del lugar"), {
      target: { value: "Parque central" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar medición" }));
    expect(await screen.findByText("Midiendo…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Terminar y calcular" }));
    await screen.findByRole("region", { name: "Resultado" });
  }

  it("lado menor que el mínimo: avisa con ambos números y «Medir por pasos» vuelve al formulario", async () => {
    await runGpsMeasurement(40); // lado = 10 m < 30 m
    const warn = document.querySelector(".gpsadvice.warn")!;
    expect(warn.getAttribute("role")).toBe("status");
    expect(warn.textContent).toMatch(/unos 10[.,]0 m por lado/);
    expect(warn.textContent).toMatch(/lado mínimo es 30[.,]0 m/);
    fireEvent.click(within(warn as HTMLElement).getByRole("button", { name: "Medir por pasos" }));
    // formulario con el método por pasos y el mismo lugar
    expect((screen.getByLabelText("¿Qué vas a medir?") as HTMLSelectElement).value).toBe("steps");
    expect((screen.getByLabelText("Nombre del lugar") as HTMLInputElement).value).toBe(
      "Parque central",
    );
    expect(screen.queryByRole("region", { name: "Resultado" })).toBeNull();
  });

  it("lado igual o mayor que el mínimo: sin aviso", async () => {
    await runGpsMeasurement(120); // lado = 30 m
    expect(document.querySelector(".gpsadvice.warn")).toBeNull();
  });

  it("medición no cerrada: sin aviso aunque el lado sea chico", async () => {
    await runGpsMeasurement(40, false);
    expect(document.querySelector(".gpsadvice.warn")).toBeNull();
  });

  it("el aviso del servidor (gps_space_too_small) se mantiene junto al nuevo", async () => {
    await runGpsMeasurement(40, true, ["gps_space_too_small"]);
    expect(document.querySelector("ul.warns")!.textContent).toContain(
      "El lugar es chico para el GPS: usa la medición por pasos.",
    );
    expect(document.querySelector(".gpsadvice.warn")).toBeTruthy();
  });
});
