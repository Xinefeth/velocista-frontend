// Medición en vivo en el celular: distancia recorrida y distancia al punto de inicio (más el largo del
// tramo actual) siguen visibles mientras se mide, y los lados ya cerrados se dibujan con su largo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { GRAVITY } from "@/domain/measurement/phone";
import { stubBrowser } from "../../black-box/pages/_harness";
import { measurement, mockApi } from "../../black-box/measurement/_api";
import { stubCanvas } from "../../black-box/measurement/_canvas";

const DEVICE = "cel-621b8d99-bbbb";
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
    value: { watchPosition: () => 1 },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const motion = () => {
  const e = new Event("devicemotion") as Event & Record<string, unknown>;
  e.accelerationIncludingGravity = { x: 0, y: 0, z: GRAVITY };
  e.rotationRate = { alpha: 0, beta: 0, gamma: 0 };
  window.dispatchEvent(e);
};
const row = (label: string) => {
  const span = screen.getByText(label, { selector: ".kv span" });
  return span.nextElementSibling!.textContent!.replace(/\s+/g, " ").trim();
};

describe("celular · medición por pasos en vivo", () => {
  it("muestra el tramo actual, la distancia recorrida y la distancia al inicio", async () => {
    stubCanvas(300, 240);
    const live = measurement(9, { status: "recording", result: null, reference: null });
    mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
      "POST /measurements": { status: 201, body: live },
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
    fireEvent.click(screen.getByRole("button", { name: "Activar sensores" }));
    await screen.findByText(/Sensores activados/);
    motion();
    fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
    await tick(0);
    fireEvent.change(screen.getByLabelText("Nombre del lugar"), { target: { value: "Aula" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar medición" }));
    expect(await screen.findByText("Midiendo…")).toBeTruthy();
    await tick(700);

    expect(screen.getByText(/^Lado 1$/)).toBeTruthy(); // tramo actual
    expect(row("Distancia recorrida")).toBe("0.0 m");
    expect(row("Distancia al inicio")).toBe("0.0 m");
    expect(row("Lados terminados")).toBe("—");
  });
});
