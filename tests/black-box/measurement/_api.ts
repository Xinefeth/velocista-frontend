// API simulada para las pruebas de las vistas de Medición: responde por método y ruta con JSON
// del contrato real (en inglés) y registra las llamadas para comprobar lo que envió la vista.
import { vi } from "vitest";
import type {
  GpsTrialApi,
  MeasurementApi,
  ResultApi,
} from "@/infrastructure/contracts/measurements";

type Handler = (body: unknown, url: URL) => unknown;
export type Routes = Record<string, unknown | Handler>;

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Instala `fetch` con rutas `"GET /measurements"` → respuesta (o función). Una respuesta
 * `{ status, body }` con `status` responde ese código. Lo que no está en `routes` da 404.
 */
export function mockApi(routes: Routes) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: path + url.search, body });
    const key = `${method} ${path}`;
    const route = key in routes ? routes[key] : undefined;
    if (route === undefined)
      return new Response(JSON.stringify({ detail: { reason: "not_found", detail: key } }), {
        status: 404,
      });
    const value = typeof route === "function" ? (route as Handler)(body, url) : route;
    const out = value as { status?: number; body?: unknown } | null;
    if (out && typeof out === "object" && "status" in out && typeof out.status === "number")
      return new Response(out.status === 204 ? null : JSON.stringify(out.body ?? null), {
        status: out.status,
      });
    return new Response(JSON.stringify(value), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const RECT_10x6 = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 6 },
  { x: 0, y: 6 },
];

export function result(overrides: Partial<ResultApi> = {}): ResultApi {
  return {
    method: "steps",
    reading_count: 1500,
    step_count: 46,
    distance_m: 31.9,
    closure_error_m: 0.62,
    closure_error_pct: 2.0,
    heading_drift_deg: 4.1,
    raw_perimeter_m: 31.9,
    raw_area_m2: 57.1,
    perimeter_m: 31.5,
    area_m2: 56.3,
    scale_factor: null,
    corners: 3,
    concave: false,
    self_crossing: false,
    quality: "green",
    reference_perimeter_m: 32,
    reference_area_m2: 60,
    perimeter_error_pct: -1.5,
    area_error_pct: -6.1,
    min_gps_size_m: null,
    warnings: [],
    raw_path: [...RECT_10x6, { x: 0.4, y: -0.3 }],
    corrected_path: [...RECT_10x6, { x: 0, y: 0 }],
    polygon: RECT_10x6,
    ...overrides,
  };
}

export function measurement(id: number, overrides: Partial<MeasurementApi> = {}): MeasurementApi {
  return {
    id,
    device_id: "cel-621b8d99-aaaa",
    method: "steps",
    source: "phone",
    mount: "hand",
    place_name: "Aula 204",
    closed: true,
    reference: { points: RECT_10x6, scale_n: 1, name: "" },
    tape_side_m: null,
    calibration: {
      gyro_bias_dps: 0.4,
      gyro_calibrated: true,
      step_length_m: 0.7,
      speed_k: null,
      speed_c: 0,
      step_threshold_ms2: 1.2,
      step_min_interval_ms: 300,
    },
    status: "finished",
    reading_count: 1500,
    started_at: "2026-11-03T10:00:00Z",
    finished_at: "2026-11-03T10:02:00Z",
    result: result(),
    ...overrides,
  };
}

export function gpsTrial(id: number, single: number, filtered: number, real = 50): GpsTrialApi {
  const err = (e: number) => ({
    gps_distance_m: real + e,
    error_m: e,
    error_pct: (e / real) * 100,
  });
  return {
    id,
    device_id: "cel-621b8d99-aaaa",
    place_name: `Cancha ${id}`,
    environment: "open",
    real_distance_m: real,
    fix_count: 40,
    result: {
      methods: { single: err(single), mean: err((single + filtered) / 2), filtered: err(filtered) },
      reported_accuracy_m: 4.5,
    },
    created_at: "2026-11-03T10:00:00Z",
  };
}
