// Cliente REST de medición con el celular sobre `request()` (JWT y 401 ya resueltos allí).
// Contrato: /measurements, /calibrations, /gps-trials, /precision-model y /polygons del backend.
// Las vistas de Medición de la consola y la página del celular usan solo este módulo.
import type {
  CalibrationRecordApi,
  CalibrationStateApi,
  CarTrialApi,
  GpsSummaryApi,
  GpsTrialApi,
  GpsTrialBodyApi,
  IngestReportApi,
  MeasurementApi,
  MeasurementBodyApi,
  MeasurementPageApi,
  ModelEvaluationApi,
  ModelRunApi,
  PointApi,
  PolygonApi,
  ReadingApi,
  StepTrialApi,
} from "@/infrastructure/contracts/measurements";
import { request } from "@/infrastructure/http/api";

/** Cuántas mediciones se piden al listar (máximo del backend). */
export const MEASUREMENT_PAGE_SIZE = 200;
/** Lecturas por lote: el backend acepta hasta 1000 por llamada. */
export const READINGS_BATCH = 1000;

const enc = encodeURIComponent;
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const measurementsApi = {
  list: (filter: { deviceId?: string; placeName?: string; limit?: number } = {}) =>
    request<MeasurementPageApi>(
      `/measurements${query({
        device_id: filter.deviceId,
        place_name: filter.placeName,
        limit: filter.limit ?? MEASUREMENT_PAGE_SIZE,
      })}`,
    ),
  get: (id: number) => request<MeasurementApi>(`/measurements/${id}`),
  start: (body: MeasurementBodyApi) => post<MeasurementApi>("/measurements", body),
  send: (id: number, readings: ReadingApi[]) =>
    post<IngestReportApi>(`/measurements/${id}/readings`, { readings }),
  readings: (id: number) => request<ReadingApi[]>(`/measurements/${id}/readings`),
  finish: (id: number) => post<MeasurementApi>(`/measurements/${id}/finish`, {}),
  remove: (id: number) => request<null>(`/measurements/${id}`, { method: "DELETE" }),
};

export const calibrationsApi = {
  state: (deviceId: string) => request<CalibrationStateApi>(`/calibrations/${enc(deviceId)}`),
  history: (deviceId: string) =>
    request<CalibrationRecordApi[]>(`/calibrations/${enc(deviceId)}/history`),
  gyro: (deviceId: string, samples: { t_ms: number; gyro_z_dps: number }[]) =>
    post<CalibrationRecordApi>(`/calibrations/${enc(deviceId)}/gyro`, { samples }),
  step: (deviceId: string, trials: StepTrialApi[]) =>
    post<CalibrationRecordApi>(`/calibrations/${enc(deviceId)}/step`, { trials }),
  car: (deviceId: string, trials: CarTrialApi[]) =>
    post<CalibrationRecordApi>(`/calibrations/${enc(deviceId)}/car`, { trials }),
};

export const gpsApi = {
  list: (deviceId?: string) =>
    request<GpsTrialApi[]>(`/gps-trials${query({ device_id: deviceId })}`),
  create: (body: GpsTrialBodyApi) => post<GpsTrialApi>("/gps-trials", body),
  rename: (id: number, placeName: string) =>
    request<GpsTrialApi>(`/gps-trials/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ place_name: placeName }),
    }),
  remove: (id: number) => request<null>(`/gps-trials/${id}`, { method: "DELETE" }),
  /** `targetPct` y `minTrials` son configurables; sin ellos manda el servidor (`config` del resumen). */
  summary: (deviceId?: string, targetPct?: number, minTrials?: number) =>
    request<GpsSummaryApi>(
      `/gps-trials/summary${query({ device_id: deviceId, target_pct: targetPct, min_trials: minTrials })}`,
    ),
};

export const precisionModelApi = {
  run: (measurementIds: number[], options: { maxAttempts?: number; apply?: boolean } = {}) =>
    post<ModelRunApi>("/precision-model/runs", {
      measurement_ids: measurementIds,
      max_attempts: options.maxAttempts ?? 40,
      apply: options.apply ?? false,
    }),
  runs: (deviceId?: string) =>
    request<ModelRunApi[]>(`/precision-model/runs${query({ device_id: deviceId })}`),
  evaluate: (measurementIds: number[], maxAttempts = 40) =>
    post<ModelEvaluationApi>("/precision-model/evaluations", {
      measurement_ids: measurementIds,
      max_attempts: maxAttempts,
    }),
};

export const polygonsApi = {
  solve: (sides: (number | null)[], angles: (number | null)[]) =>
    post<PolygonApi>("/polygons/solve", { sides_m: sides, angles_deg: angles }),
  fromPoints: (points: PointApi[]) => post<PolygonApi>("/polygons/from-points", { points }),
};
