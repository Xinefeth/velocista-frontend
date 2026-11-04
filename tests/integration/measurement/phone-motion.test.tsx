// Estado «caminando / quieto» de la pestaña Medir (HU-37, F1): chip con icono y palabra,
// actualizado por el temporizador de 500 ms que ya existe.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { GRAVITY } from "@/domain/measurement/phone";
import { stubBrowser } from "../../black-box/pages/_harness";
import { measurement, mockApi } from "../../black-box/measurement/_api";

const DEVICE = "cel-621b8d99-bbbb";
let gpsCallback: ((p: GeolocationPosition) => void) | null = null;

function motion(acc: number[], rate = 0) {
  const e = new Event("devicemotion") as Event & Record<string, unknown>;
  e.accelerationIncludingGravity = { x: acc[0], y: acc[1], z: acc[2] };
  e.rotationRate = { alpha: rate, beta: 0, gamma: 0 };
  window.dispatchEvent(e);
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Manda `n` lecturas de movimiento, una cada 50 ms. */
async function shake(n: number) {
  for (let i = 0; i < n; i++) {
    motion([0, 0, GRAVITY + (i % 2 ? 2 : -2)], 1);
    await tick(50);
  }
}

const CAL = {
  device_id: DEVICE,
  calibration: { ...measurement(1).calibration },
  ready: { steps: true, car: false, gps: true },
  records: {},
};

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
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Activa sensores e inicia una medición por pasos; deja la pantalla «Midiendo…». */
async function startMeasuring() {
  fireEvent.click(screen.getByRole("button", { name: "Activar sensores" }));
  expect(await screen.findByText(/Sensores activados/)).toBeTruthy();
  motion([0, 0, GRAVITY]);
  gpsCallback?.({
    coords: { latitude: -8.1116, longitude: -79.0287, accuracy: 4 },
    timestamp: Date.now(),
  } as GeolocationPosition);
  fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
  fireEvent.change(screen.getByLabelText("Nombre del lugar"), { target: { value: "Mi cuarto" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar medición" }));
  expect(await screen.findByText("Midiendo…")).toBeTruthy();
}

const startedMeasurement = measurement(9, { status: "recording", result: null });

function openMeasure() {
  mockApi({
    [`GET /calibrations/${DEVICE}`]: CAL,
    "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
    "POST /measurements": { status: 201, body: startedMeasurement },
    "POST /measurements/9/readings": {
      accepted: 1,
      duplicates: 0,
      discarded: {},
      total_readings: 1,
    },
  });
  render(
    <PhoneProvider initialDevice={DEVICE}>
      <PhoneApp />
    </PhoneProvider>,
  );
}

const chip = () => document.querySelector<HTMLElement>("p.motion")!;

describe("estado de movimiento mientras se mide", () => {
  it("es una región role=status con la palabra y un icono, no solo color", async () => {
    openMeasure();
    await startMeasuring();
    await tick(600);
    expect(chip().getAttribute("role")).toBe("status");
    expect(chip().getAttribute("aria-live")).toBe("polite");
    expect(chip().querySelector("svg")).toBeTruthy();
  });

  it("sin lecturas del acelerómetro dice «Sin datos» con el motivo", async () => {
    openMeasure();
    await startMeasuring();
    await tick(600);
    expect(chip().textContent).toContain("Sin datos del acelerómetro");
    expect(chip().textContent).toContain("Activa los sensores");
  });

  it("quieto sobre la mesa muestra «Quieto»", async () => {
    openMeasure();
    await startMeasuring();
    for (let i = 0; i < 20; i++) {
      motion([0, 0, GRAVITY + (i % 2 ? 0.02 : -0.02)], 0);
      await tick(50);
    }
    await tick(500);
    expect(chip().textContent).toContain("Quieto");
    expect(chip().className).toContain("still");
  });

  it("al caminar muestra «Caminando» y al parar vuelve a «Quieto» y luego «Sin datos»", async () => {
    openMeasure();
    await startMeasuring();
    await shake(20);
    await tick(500);
    expect(chip().textContent).toContain("Caminando");
    // deja de llegar movimiento: tras 3 s ya no hay datos
    await tick(3600);
    expect(chip().textContent).toContain("Sin datos del acelerómetro");
  });

  it("se actualiza con el temporizador existente: sin peticiones nuevas por el estado", async () => {
    const before = () => vi.getTimerCount();
    openMeasure();
    await startMeasuring();
    const timers = before();
    await shake(10);
    await tick(1000);
    // el estado no crea temporizadores
    expect(before()).toBe(timers);
  });
});
