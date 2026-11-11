// Aviso de lugar chico con el error del GPS medido en SP-06 (HU-37, F2): consulta única del
// resumen, aviso antes de empezar, aviso al terminar con ambos números y botón «Medir por pasos».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { GRAVITY } from "@/domain/measurement/phone";
import { stubBrowser } from "../../black-box/pages/_harness";
import { measurement, mockApi, result } from "../../black-box/measurement/_api";
import type { ResultApi } from "@/infrastructure/contracts/measurements";

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

  it("mínimo no creíble (> 500 m): no lo presenta como lado mínimo y enlaza a la pestaña 4", async () => {
    open({ "GET /gps-trials/summary": SUMMARY(2838.4) });
    await goMeasure();
    pickMethod("gps");
    const advice = document.querySelector(".gpsadvice")!;
    expect(advice.textContent).toContain("que no es creíble");
    expect(advice.textContent).not.toContain("si tu terreno es más chico");
    fireEvent.click(within(advice as HTMLElement).getByRole("button", { name: /pestaña 4/ }));
    expect(screen.getByRole("button", { name: "4. Error GPS" }).getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("mínimo 0, negativo o NaN del resumen: se trata como sin pruebas, sin avisar «lado mínimo 0»", async () => {
    for (const bad of [0, -4]) {
      cleanup();
      open({ "GET /gps-trials/summary": SUMMARY(bad) });
      await goMeasure();
      pickMethod("gps");
      expect(document.querySelector(".gpsadvice")!.textContent).not.toMatch(/lado mínimo es/);
    }
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
  async function runGpsMeasurement(
    perimeter: number,
    closed = true,
    warnings: string[] = [],
    extra: Partial<ResultApi> = {},
    min: number | null = 30,
  ) {
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
        ...extra,
      }),
    });
    open({
      "GET /gps-trials/summary": SUMMARY(min),
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

  const LOW = { quality: "yellow" as const, closure_error_pct: 6 };
  // terreno alargado 62 × 164: perímetro / 4 daría 112,8 pero el lado corto es 62
  const LONG = [
    { x: 0, y: 0 },
    { x: 164, y: 0 },
    { x: 164, y: 62 },
    { x: 0, y: 62 },
  ];

  it("lado corto menor que el mínimo (calidad no buena): aviso con ambos números y «Medir por pasos»", async () => {
    await runGpsMeasurement(40, true, [], LOW); // polígono 10 × 6 → lado corto 6 m
    const warn = document.querySelector(".gpsadvice.warn")!;
    expect(warn.getAttribute("role")).toBe("status");
    expect(warn.textContent).toMatch(/unos 6[.,]0 m en su lado corto/);
    expect(warn.textContent).toMatch(/lado mínimo es 30[.,]0 m/);
    fireEvent.click(within(warn as HTMLElement).getByRole("button", { name: "Medir por pasos" }));
    expect((screen.getByLabelText("¿Qué vas a medir?") as HTMLSelectElement).value).toBe("steps");
    expect((screen.getByLabelText("Nombre del lugar") as HTMLInputElement).value).toBe(
      "Parque central",
    );
    expect(screen.queryByRole("region", { name: "Resultado" })).toBeNull();
  });

  it("usa el lado corto y no perímetro / 4 en un terreno alargado", async () => {
    await runGpsMeasurement(451.15, true, [], { ...LOW, polygon: LONG, corrected_path: LONG }, 100);
    const warn = document.querySelector(".gpsadvice.warn")!;
    expect(warn.textContent).toMatch(/unos 62[.,]0 m en su lado corto/);
    expect(warn.textContent).not.toContain("112");
  });

  it("terreno largo y angosto pero con lado corto suficiente: sin aviso", async () => {
    await runGpsMeasurement(451.15, true, [], { ...LOW, polygon: LONG, corrected_path: LONG }, 50);
    expect(document.querySelector(".gpsadvice.warn")).toBeNull();
    expect(document.querySelector(".gpsadvice")).toBeNull();
  });

  it("medición confiable en terreno chico: aviso informativo sin contradecir la calidad", async () => {
    await runGpsMeasurement(40, true, [], { closure_error_pct: 1.0 });
    const info = document.querySelector(".gpsadvice")!;
    expect(info.classList.contains("warn")).toBe(false);
    expect(info.textContent).toMatch(/salió confiable \(error de cierre 1[.,]0 %\)/);
    expect(info.textContent).toMatch(/lado corto ≈ 6[.,]0 m/);
    expect(info.textContent).not.toContain("es chico para el GPS");
    expect(
      within(info as HTMLElement).getByRole("button", { name: "Medir por pasos" }),
    ).toBeTruthy();
  });

  it("mínimo no creíble (2 838 m): no dice «es chico», explica y enlaza a la pestaña 4", async () => {
    await runGpsMeasurement(
      451.15,
      true,
      [],
      { ...LOW, polygon: LONG, corrected_path: LONG },
      2838.4,
    );
    const adv = document.querySelector(".gpsadvice")!;
    expect(adv.textContent).toContain("que no es creíble");
    expect(adv.textContent).toContain("Repítelas o bórralas en la pestaña 4");
    expect(adv.textContent).not.toContain("es chico para el GPS");
    expect(document.querySelector(".gpsadvice.warn")).toBeNull();
    expect(screen.queryByRole("button", { name: "Medir por pasos" })).toBeNull();
    fireEvent.click(within(adv as HTMLElement).getByRole("button", { name: /pestaña 4/ }));
    expect(screen.getByRole("button", { name: "4. Error GPS" }).getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("un trazo sin forma (menos de 3 puntos) no avisa por una lectura mala", async () => {
    await runGpsMeasurement(0, true, [], { ...LOW, polygon: [], corrected_path: [] });
    expect(document.querySelector(".gpsadvice.warn")).toBeNull();
  });

  it("el aviso del servidor «lugar chico» se oculta si su tamaño no es creíble", async () => {
    await runGpsMeasurement(120, true, ["gps_space_too_small"], { min_gps_size_m: 100_000 });
    expect(document.querySelector("ul.warns")).toBeNull();
  });

  it("lado igual o mayor que el mínimo: sin aviso", async () => {
    const WIDE = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 0, y: 30 },
    ];
    await runGpsMeasurement(120, true, [], { polygon: WIDE, corrected_path: WIDE }); // lado corto = 30 m
    expect(document.querySelector(".gpsadvice.warn")).toBeNull();
  });

  it("medición no cerrada: sin aviso aunque el lado sea chico", async () => {
    await runGpsMeasurement(40, false, [], LOW);
    expect(document.querySelector(".gpsadvice.warn")).toBeNull();
  });

  it("el aviso del servidor (gps_space_too_small) se mantiene junto al nuevo", async () => {
    await runGpsMeasurement(40, true, ["gps_space_too_small"], { ...LOW, min_gps_size_m: 30 });
    expect(document.querySelector("ul.warns")!.textContent).toContain(
      "El lugar es chico para el GPS: usa la medición por pasos.",
    );
    expect(document.querySelector(".gpsadvice.warn")).toBeTruthy();
  });
});
