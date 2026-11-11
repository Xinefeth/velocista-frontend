// Trazo en vivo del celular con el método GPS: las esquinas se detectan sobre la marcha, sin parpadeo, y
// el lienzo y el panel muestran los lados terminados, los ángulos y las esquinas detectadas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { GRAVITY } from "@/domain/measurement/phone";
import { stubBrowser } from "../../black-box/pages/_harness";
import { measurement, mockApi } from "../../black-box/measurement/_api";
import { expectClean, stubCanvas, type CanvasLog } from "../../black-box/measurement/_canvas";

// caminar un rectángulo entero son unos 200 segundos simulados: con toda la suite en paralelo tarda más de 5 s
vi.setConfig({ testTimeout: 40_000 });

const DEVICE = "cel-621b8d99-bbbb";
const CAL = {
  device_id: DEVICE,
  calibration: { ...measurement(1).calibration },
  ready: { steps: true, car: false, gps: true },
  records: {},
};
const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;
/** Metros locales (x este, y norte) a latitud y longitud con origen en (0, 0) del planeta de prueba. */
const fix = (x: number, y: number) =>
  ({
    coords: { latitude: y / (EARTH_R * RAD), longitude: x / (EARTH_R * RAD), accuracy: 3 },
    timestamp: Date.now(),
  }) as GeolocationPosition;

let gpsCallback: ((p: GeolocationPosition) => void) | null = null;

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const row = (label: string) => {
  const span = screen.getByText(label, { selector: ".kv span" });
  return span.nextElementSibling!.textContent!.replace(/\s+/g, " ").trim();
};
/** Valores de una fila de lista del panel: cada lado o ángulo es un elemento aparte. */
const items = (label: string) =>
  [
    ...screen
      .getByText(label, { selector: ".kv span" })
      .nextElementSibling!.querySelectorAll("span"),
  ].map((x) => x.textContent!);

/** Un rectángulo w × h caminado a 1.3 m por segundo, con ruido de ±1 m. */
function rectangleFixes(w: number, h: number, noise = 1) {
  let s = 11;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const lens = corners.map(([x, y], i) =>
    Math.hypot(corners[(i + 1) % 4][0] - x, corners[(i + 1) % 4][1] - y),
  );
  const total = lens.reduce((a, b) => a + b, 0);
  const n = Math.round(total / 1.3);
  return Array.from({ length: n + 1 }, (_, i) => {
    let d = (i / n) * total;
    let k = 0;
    while (k < 3 && d > lens[k]) d -= lens[k++];
    const [ax, ay] = corners[k];
    const [bx, by] = corners[(k + 1) % 4];
    const t = d / lens[k];
    return {
      x: ax + (bx - ax) * t + (i ? rand() * noise : 0),
      y: ay + (by - ay) * t + (i ? rand() * noise : 0),
    };
  });
}

async function startGpsMeasurement() {
  mockApi({
    [`GET /calibrations/${DEVICE}`]: CAL,
    "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 },
    "POST /measurements": {
      status: 201,
      body: measurement(9, { method: "gps", status: "recording", result: null, reference: null }),
    },
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
  const e = new Event("devicemotion") as Event & Record<string, unknown>;
  e.accelerationIncludingGravity = { x: 0, y: 0, z: GRAVITY };
  e.rotationRate = { alpha: 0, beta: 0, gamma: 0 };
  window.dispatchEvent(e);
  gpsCallback?.(fix(0, 0));
  fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
  await tick(0);
  fireEvent.change(screen.getByLabelText("¿Qué vas a medir?"), { target: { value: "gps" } });
  fireEvent.change(screen.getByLabelText("Nombre del lugar"), { target: { value: "Campo" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar medición" }));
  expect(await screen.findByText("Midiendo…")).toBeTruthy();
}

/** Manda `fixes[from..to]` al celular, un punto por segundo. */
async function walk(fixes: { x: number; y: number }[], from: number, to: number) {
  for (let i = from; i < to; i++) {
    gpsCallback?.(fix(fixes[i].x, fixes[i].y));
    await tick(1000);
  }
}

describe("celular · medición GPS en vivo con un rectángulo de 78 × 55 m", () => {
  it("el primer lado no da esquinas; al empezar el segundo aparece 1 esquina con su ángulo y su lado", async () => {
    const log: CanvasLog = stubCanvas(300, 240);
    const path = rectangleFixes(78, 55);
    await startGpsMeasurement();
    await walk(path, 1, 40); // ~52 m del primer lado
    expect(row("Esquinas detectadas")).toBe("0");
    expect(row("Lados terminados")).toBe("—");
    expect(row("Ángulos")).toBe("—");
    await walk(path, 40, 80); // pasa la esquina y camina ~15 m del segundo lado
    expect(row("Esquinas detectadas")).toBe("1");
    expect(row("Lados terminados")).toMatch(/^1\) 7[0-9]\.\d m$/);
    expect(row("Ángulos")).toMatch(/^B (8|9|10)\d°$/);
    log.reset();
    await tick(300);
    expect(log.texts.some((t) => /^(8|9|10)\d°$/.test(t))).toBe(true); // el ángulo en el lienzo
    expect(log.texts.some((t) => /^7\d\.\d\d m$/.test(t))).toBe(true); // el largo del lado terminado
    expect(log.texts.some((t) => t.startsWith("Inicio"))).toBe(true);
    expectClean(log);
  });

  it("las esquinas confirmadas no bajan ni parpadean mientras se camina el rectángulo", async () => {
    stubCanvas(300, 240);
    const path = rectangleFixes(78, 55);
    await startGpsMeasurement();
    let last = 0;
    for (let i = 1; i < path.length; i += 4) {
      await walk(path, i, Math.min(i + 4, path.length));
      const n = Number(row("Esquinas detectadas"));
      expect(n, `punto ${i}`).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(last).toBe(3);
  });

  it("al cerrar el rectángulo hay 4 lados terminados y los 4 ángulos (con el inicio)", async () => {
    const log = stubCanvas(300, 240);
    const path = rectangleFixes(78, 55);
    await startGpsMeasurement();
    await walk(path, 1, path.length);
    expect(row("Esquinas detectadas")).toBe("3");
    const sides = row("Lados terminados").match(/\d\) /g) ?? [];
    expect(sides).toHaveLength(4);
    const angles = items("Ángulos");
    expect(angles.map((a) => a[0])).toEqual(["A", "B", "C", "D"]);
    for (const a of angles) expect(Math.abs(parseInt(a.slice(2)) - 90)).toBeLessThan(15);
    expect(row("Esquinas marcadas")).toBe("0"); // lo marcado por el usuario no cambia
    log.reset();
    await tick(300);
    expect(log.texts.filter((t) => /^\d+°$/.test(t))).toHaveLength(4);
    expect(log.texts.some((t) => t.startsWith("Inicio"))).toBe(false); // ya volvió al inicio
    expectClean(log);
  });

  it("con el GPS parado no se muestra ninguna esquina ni lado", async () => {
    stubCanvas(300, 240);
    await startGpsMeasurement();
    for (let i = 0; i < 60; i++) {
      gpsCallback?.(fix(Math.sin(i) * 0.3, Math.cos(i * 1.7) * 0.3));
      await tick(1000);
    }
    expect(row("Esquinas detectadas")).toBe("0");
    expect(row("Lados terminados")).toBe("—");
    expect(row("Ángulos")).toBe("—");
  });
});

describe("panel en vivo: la lista de lados envuelve por valor completo", () => {
  it("cada lado es un valor que no se parte en dos líneas (white-space: nowrap) y la fila no pierde nada", async () => {
    stubCanvas(300, 240);
    const path = rectangleFixes(78, 55);
    await startGpsMeasurement();
    await walk(path, 1, path.length);
    const list = screen.getByText("Lados terminados", { selector: ".kv span" }).nextElementSibling!;
    expect(list.classList.contains("list")).toBe(true);
    const values = [...list.querySelectorAll("span")].map((s) => s.textContent);
    expect(values).toHaveLength(4);
    for (const v of values) expect(v).toMatch(/^\d\) \d+\.\d m$/); // «1) 77.7 m» entero en un solo elemento
    // las filas que ya existían siguen
    for (const label of [
      "Pasos",
      "Distancia recorrida",
      "Distancia al inicio",
      "Esquinas marcadas",
      "Tiempo",
      "Lecturas enviadas",
      "Pendientes de enviar",
    ])
      expect(screen.getByText(label, { selector: ".kv span" })).toBeTruthy();
  });
});
