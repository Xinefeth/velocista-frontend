// Integración de la página del celular ante fallos del backend a mitad de una medición:
// sesión caducada (401) sin perder la cola de lecturas y tope de lecturas (409).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { GRAVITY } from "@/domain/measurement/phone";
import { setAccessToken } from "@/infrastructure/config";
import type { ReadingApi } from "@/infrastructure/contracts/measurements";
import { AuthGate } from "@/ui/components/AuthGate";
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
  setAccessToken("viejo");
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
const countOf = (calls: { path: string }[]) =>
  calls.filter((c) => c.path === "/measurements/9/readings").length;

describe("sesión caducada a mitad de una medición (401)", () => {
  it("mantiene la página y la cola, y reenvía lo pendiente sin duplicar tras iniciar sesión", async () => {
    let expired = true;
    const sent: ReadingApi[] = [];
    mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
      "POST /measurements": { status: 201, body: startedMeasurement },
      "POST /measurements/9/readings": (body) => {
        if (expired) return { status: 401, body: { detail: "Unauthorized" } };
        const readings = (body as { readings: ReadingApi[] }).readings;
        sent.push(...readings);
        return {
          accepted: readings.length,
          duplicates: 0,
          discarded: {},
          total_readings: sent.length,
        };
      },
      "POST /auth/login": { access_token: "nuevo" },
    });
    render(
      <AuthGate keepMounted>
        <PhoneProvider initialDevice={DEVICE}>
          <PhoneApp />
        </PhoneProvider>
      </AuthGate>,
    );
    await startMeasuring();

    // el token caduca: aparece el inicio de sesión, pero la medición sigue montada y viva
    await shake(10);
    await tick(600);
    expect(await screen.findByRole("dialog", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.getByText("Midiendo…")).toBeTruthy();
    expect(screen.getByText(/Tu sesión caducó/)).toBeTruthy();
    expect(sent).toHaveLength(0);

    // mientras se espera el reingreso se siguen juntando lecturas
    await shake(10);

    // al volver a iniciar sesión, la cola completa se reenvía
    expired = false;
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "ana" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreto" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Iniciar sesión" })).toBeNull(),
    );
    await tick(1500);
    await waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(20));
    // sin huecos ni repetidos: las lecturas salen con seq 0, 1, 2…
    expect(sent.map((r) => r.seq)).toEqual(sent.map((_, i) => i));
    expect(new Set(sent.map((r) => r.seq)).size).toBe(sent.length);
    expect(screen.getByText("Midiendo…")).toBeTruthy();
  });

  it("sin keepMounted el login reemplaza la página (consola)", () => {
    mockApi({});
    render(
      <AuthGate>
        <p>contenido</p>
      </AuthGate>,
    );
    expect(screen.getByText("contenido")).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event("velocista:auth-required"));
    });
    expect(screen.queryByText("contenido")).toBeNull();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
  });
});

describe("tope de lecturas de la medición (409)", () => {
  it("deja de enviar, avisa en español y permite terminar", async () => {
    const api = mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
      "POST /measurements": { status: 201, body: startedMeasurement },
      "POST /measurements/9/readings": {
        status: 409,
        body: {
          detail: {
            reason: "measurement_too_many_readings",
            detail: "The measurement reached the readings limit",
          },
        },
      },
      "POST /measurements/9/finish": measurement(9, { place_name: "Mi cuarto" }),
    });
    render(
      <PhoneProvider initialDevice={DEVICE}>
        <PhoneApp />
      </PhoneProvider>,
    );
    await startMeasuring();

    await shake(10);
    await tick(600);
    expect(await screen.findByText(/Se llegó al máximo de lecturas/)).toBeTruthy();
    // un solo intento: no reintenta ni sigue encolando
    expect(countOf(api.calls)).toBe(1);
    await shake(10);
    await tick(2000);
    expect(countOf(api.calls)).toBe(1);

    // y la medición se puede terminar (no espera una cola que ya no se envía)
    fireEvent.click(screen.getByRole("button", { name: "Terminar y calcular" }));
    expect(await screen.findByRole("region", { name: "Resultado" })).toBeTruthy();
    expect(api.calls.filter((c) => c.path === "/measurements/9/finish")).toHaveLength(1);
  });
});
