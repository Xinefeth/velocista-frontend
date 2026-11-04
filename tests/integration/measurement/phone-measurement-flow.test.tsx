// Integración de la página del celular: sensores simulados del navegador (movimiento y GPS) →
// medición en la API (crear, lotes de lecturas, terminar) → resultado en pantalla.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { GRAVITY } from "@/domain/measurement/phone";
import type { ReadingApi } from "@/infrastructure/contracts/measurements";
import { stubBrowser } from "../../black-box/pages/_harness";
import { measurement, mockApi } from "../../black-box/measurement/_api";

const DEVICE = "cel-621b8d99-aaaa";
let gpsCallback: ((p: GeolocationPosition) => void) | null = null;

function motion(acc: number[], rate = 0) {
  const e = new Event("devicemotion") as Event & Record<string, unknown>;
  e.accelerationIncludingGravity = { x: acc[0], y: acc[1], z: acc[2] };
  e.rotationRate = { alpha: rate, beta: 0, gamma: 0 };
  window.dispatchEvent(e);
}

/** Camina `steps` pasos: un pico y un valle de aceleración por paso, separados en el tiempo. */
async function walk(steps: number) {
  for (let i = 0; i < steps; i++) {
    for (const extra of [2, 2, 2, 0, -2, -2, -2, 0]) {
      motion([0, 0, GRAVITY + extra], 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    }
  }
}

function fix(lat: number, lon: number) {
  gpsCallback?.({
    coords: { latitude: lat, longitude: lon, accuracy: 4 },
    timestamp: Date.now(),
  } as GeolocationPosition);
}

beforeEach(() => {
  stubBrowser();
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

describe("medición completa desde el celular", () => {
  it("activa sensores, mide por pasos, envía las lecturas en lotes y muestra el resultado", async () => {
    const sent: ReadingApi[] = [];
    const api = mockApi({
      [`GET /calibrations/${DEVICE}`]: {
        device_id: DEVICE,
        calibration: { ...measurement(1).calibration },
        ready: { steps: true, car: false, gps: true },
        records: {},
      },
      "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
      "POST /measurements": {
        status: 201,
        body: measurement(9, { status: "recording", result: null }),
      },
      "POST /measurements/9/readings": (body) => {
        const readings = (body as { readings: ReadingApi[] }).readings;
        sent.push(...readings);
        return {
          accepted: readings.length,
          duplicates: 0,
          discarded: {},
          total_readings: sent.length,
        };
      },
      "POST /measurements/9/finish": measurement(9, { place_name: "Mi cuarto" }),
    });
    render(
      <PhoneProvider initialDevice={DEVICE}>
        <PhoneApp />
      </PhoneProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Activar sensores" }));
    expect(await screen.findByText(/Sensores activados/)).toBeTruthy();
    motion([0, 0, GRAVITY]);
    fix(-8.1116, -79.0287);

    fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
    fireEvent.change(screen.getByLabelText("Nombre del lugar"), { target: { value: "Mi cuarto" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar medición" }));
    expect(await screen.findByText("Midiendo…")).toBeTruthy();
    const start = api.calls.find((c) => c.method === "POST" && c.path === "/measurements")!;
    expect(start.body).toMatchObject({
      method: "steps",
      place_name: "Mi cuarto",
      device_id: DEVICE,
    });

    await walk(6);
    fix(-8.11161, -79.0287);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    // las lecturas salen en lotes, en orden y con su tipo
    await waitFor(() => expect(sent.length).toBeGreaterThan(20));
    expect(sent.map((r) => r.seq)).toEqual(sent.map((_, i) => i));
    expect(sent.some((r) => r.kind === "motion" && r.accel?.length === 3)).toBe(true);
    expect(sent.some((r) => r.kind === "gps" && r.accuracy_m === 4)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Marcar esquina/ }));
    fireEvent.click(screen.getByRole("button", { name: "Terminar y calcular" }));
    expect(await screen.findByRole("region", { name: "Resultado" })).toBeTruthy();
    expect(screen.getByText("Medición confiable")).toBeTruthy();
    expect(sent.some((r) => r.kind === "corner")).toBe(true);
    // se pidió el cálculo una sola vez, después de enviar todo
    expect(api.calls.filter((c) => c.path === "/measurements/9/finish")).toHaveLength(1);
  });
});
