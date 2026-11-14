// ¿El modo guiado cambia lo medido por pasos? Se camina DOS veces el mismo rectángulo sintético (con
// ruido de aceleración y de giro, igual en ambas) sin plano guía y con un plano guía, y se compara lo
// que se envía al servidor (lecturas y esquinas) y lo que muestra el panel en vivo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { GRAVITY } from "@/domain/measurement/phone";
import type { ReadingApi } from "@/infrastructure/contracts/measurements";
import { stubBrowser } from "../../black-box/pages/_harness";
import { measurement, mockApi } from "../../black-box/measurement/_api";
import { stubCanvas } from "../../black-box/measurement/_canvas";

const DEVICE = "cel-621b8d99-aaaa";

beforeAll(() => {
  if (!File.prototype.text)
    File.prototype.text = function (this: File) {
      return new Promise<string>((ok) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.readAsText(this);
      });
    };
});
beforeEach(() => {
  stubBrowser();
  // reloj simulado puro (sin avanzar con el real): las dos corridas ven exactamente los mismos tiempos
  vi.useFakeTimers();
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

/** Generador pseudoaleatorio con semilla: el mismo ruido en las dos corridas. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function motion(z: number, rate: number) {
  const e = new Event("devicemotion") as Event & Record<string, unknown>;
  e.accelerationIncludingGravity = { x: 0, y: 0, z };
  e.rotationRate = { alpha: rate, beta: 0, gamma: 0 };
  window.dispatchEvent(e);
}
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Espera a que algo aparezca avanzando el reloj simulado de a poco. */
async function until<T>(fn: () => T): Promise<T> {
  for (let i = 0; i < 200; i++) {
    try {
      return fn();
    } catch {
      await tick(20);
    }
  }
  return fn();
}

/** Un lado de `steps` pasos (picos y valles con ruido) y después un giro de ~90° a la izquierda. */
async function side(rand: () => number, steps: number, turn: boolean) {
  for (let i = 0; i < steps; i++) {
    const amp = 2.6 + rand() * 0.8;
    for (const extra of [amp, amp, amp, 0, -amp, -amp, -amp, 0]) {
      motion(GRAVITY + extra, (rand() - 0.5) * 6); // ruido de giro de ±3 °/s
      await tick(50);
    }
  }
  if (turn) {
    for (let i = 0; i < 20; i++) {
      motion(GRAVITY, 90 + (rand() - 0.5) * 8); // 90 °/s durante 1 s
      await tick(50);
    }
    for (let i = 0; i < 6; i++) {
      motion(GRAVITY, (rand() - 0.5) * 4);
      await tick(50);
    }
  }
}

/** Sin la hora (el reloj simulado avanza también con el real) y con el giro redondeado (1e-6 °/s). */
const norm = (rs: ReadingApi[]) =>
  rs.map((r) => ({
    ...r,
    t_ms: 0,
    gyro_z_dps: r.gyro_z_dps == null ? r.gyro_z_dps : Math.round(r.gyro_z_dps * 1e6) / 1e6,
  }));

interface Outcome {
  readings: ReadingApi[];
  corners: number[];
  texts: Record<string, string>;
  startBody: unknown;
}

async function run(guided: boolean): Promise<Outcome> {
  stubCanvas(320, 250);
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
    "POST /measurements/9/finish": measurement(9),
  });
  render(
    <PhoneProvider initialDevice={DEVICE}>
      <PhoneApp />
    </PhoneProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Activar sensores" }));
  await until(() => screen.getByText(/Sensores activados/));
  motion(GRAVITY, 0);
  fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
  fireEvent.change(screen.getByLabelText("Nombre del lugar"), { target: { value: "Patio" } });
  if (guided) {
    fireEvent.change(screen.getByLabelText("Plano para guiar el recorrido"), {
      target: { value: "dxf" },
    });
    const text = readFileSync(
      join(process.cwd(), "tests/fixtures/dxf/rect-8x6-lwpolyline-m-r2000.dxf"),
      "utf8",
    );
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File([text], "patio.dxf")] },
    });
    await until(() => screen.getByRole("group", { name: "Esquina de inicio" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Iniciar medición" }));
  await until(() => screen.getByText("Midiendo…"));
  // el mismo rectángulo (12 + 8 + 12 + 8 pasos de 0,7 m ≈ 8,4 × 5,6 m) con el mismo ruido
  const rand = seeded(1234);
  for (const steps of [12, 8, 12, 8]) await side(rand, steps, true);
  await tick(1200);
  const panel = screen.getByText("Midiendo…").closest("section")!.querySelector(".kv")!;
  const texts: Record<string, string> = {};
  const nodes = [...panel.children];
  for (let i = 0; i < nodes.length - 1; i += 2)
    texts[nodes[i].textContent ?? ""] = nodes[i + 1].textContent ?? "";
  fireEvent.click(screen.getByRole("button", { name: "Terminar y calcular" }));
  await until(() => screen.getByRole("region", { name: "Resultado" }));
  const t0 = sent[0].t_ms;
  const readings = sent.map((r) => ({ ...r, t_ms: r.t_ms - t0 }));
  const corners = readings.filter((r) => r.kind === "corner").map((r) => r.seq);
  const startBody = api.calls.find((c) => c.method === "POST" && c.path === "/measurements")!.body;
  return { readings, corners, texts, startBody };
}

describe("el modo guiado no cambia lo medido por pasos", () => {
  it("mismas lecturas, mismas esquinas y mismos lados con y sin plano guía", async () => {
    const plain = await run(false);
    cleanup();
    const guided = await run(true);
    // sanidad: el rectángulo sintético sí marca sus 4 esquinas
    expect(plain.corners.length).toBe(4);
    // lo enviado al servidor es idéntico lectura por lectura (la única diferencia es `reference`)
    expect(guided.readings.length).toBe(plain.readings.length);
    expect(norm(guided.readings)).toEqual(norm(plain.readings));
    expect(guided.corners).toEqual(plain.corners);
    // y el panel en vivo muestra los mismos pasos, lados y distancias
    for (const k of ["Pasos", "Lados terminados", "Esquinas marcadas", "Distancia recorrida"])
      expect(guided.texts[k]).toBe(plain.texts[k]);
    expect(plain.startBody).not.toHaveProperty("reference");
    expect(guided.startBody).toHaveProperty("reference");
    console.log(
      JSON.stringify({
        lecturas: plain.readings.length,
        esquinas: plain.corners,
        panel: plain.texts,
      }),
    );
  }, 30_000);
});
