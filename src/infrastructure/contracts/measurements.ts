// Contrato REST de medición con el celular (EN-32 a EN-35, SP-06, SP-07, EN-42), tal como lo
// devuelve el backend: claves en inglés y snake_case, distancias en metros y tiempos en ms.
// Solo `infrastructure/http/measurements.ts` usa estos tipos.

export type MethodApi = "steps" | "gps" | "car";
export type QualityApi = "green" | "yellow" | "red";
export type EnvironmentApi = "open" | "buildings" | "trees" | "indoor";

export interface PointApi {
  x: number;
  y: number;
}

export interface ReferenceApi {
  points: PointApi[];
  scale_n: number;
  name: string;
}

export interface CalibrationApi {
  gyro_bias_dps: number;
  gyro_calibrated: boolean;
  step_length_m: number | null;
  speed_k: number | null;
  speed_c: number;
  step_threshold_ms2: number;
  step_min_interval_ms: number;
}

export interface ResultApi {
  method: MethodApi;
  reading_count: number;
  step_count: number;
  distance_m: number;
  closure_error_m: number;
  closure_error_pct: number;
  heading_drift_deg: number | null;
  /** Giro acumulado de toda la vuelta en grados (positivo a la izquierda; ±360° si cierra). Opcional: el backend viejo no lo trae. */
  turn_total_deg?: number | null;
  raw_perimeter_m: number;
  raw_area_m2: number;
  perimeter_m: number;
  area_m2: number;
  scale_factor: number | null;
  corners: number;
  concave: boolean;
  self_crossing: boolean;
  quality: QualityApi;
  reference_perimeter_m: number | null;
  reference_area_m2: number | null;
  perimeter_error_pct: number | null;
  area_error_pct: number | null;
  min_gps_size_m: number | null;
  warnings: string[];
  /** Vacíos en el listado: solo GET /measurements/{id} trae los recorridos. */
  raw_path: PointApi[];
  corrected_path: PointApi[];
  polygon: PointApi[];
}

export interface MeasurementApi {
  id: number;
  device_id: string;
  method: MethodApi;
  source: "phone" | "simulator" | "robot";
  mount: "hand" | "robot";
  place_name: string;
  closed: boolean;
  reference: ReferenceApi | null;
  tape_side_m: number | null;
  calibration: CalibrationApi;
  status: "recording" | "finished";
  reading_count: number;
  started_at: string;
  finished_at: string | null;
  result: ResultApi | null;
}

export interface MeasurementPageApi {
  items: MeasurementApi[];
  total: number;
  limit: number;
  offset: number;
}

export interface MeasurementBodyApi {
  method: MethodApi;
  source?: "phone" | "simulator" | "robot";
  mount?: "hand" | "robot";
  place_name: string;
  device_id: string;
  closed?: boolean;
  reference?: ReferenceApi;
  tape_side_m?: number;
}

/** Lectura del celular: `motion` (giroscopio y acelerómetro), `gps` o `corner`. */
export interface ReadingApi {
  seq: number;
  t_ms: number;
  kind: "motion" | "gps" | "corner";
  gyro_z_dps?: number | null;
  accel?: number[] | null;
  step?: boolean;
  pwm?: number | null;
  lat?: number | null;
  lon?: number | null;
  accuracy_m?: number | null;
}

export interface IngestReportApi {
  accepted: number;
  duplicates: number;
  discarded: Record<string, number>;
  total_readings: number;
}

export interface CalibrationRecordApi {
  id: number;
  device_id: string;
  kind: "gyro_bias" | "step_length" | "car_speed";
  origin: "manual" | "model";
  params: Record<string, unknown>;
  created_at: string;
}

export interface CalibrationStateApi {
  device_id: string;
  calibration: CalibrationApi;
  ready: { steps: boolean; car: boolean; gps: boolean };
  records: Partial<Record<CalibrationRecordApi["kind"], CalibrationRecordApi>>;
}

export interface StepTrialApi {
  distance_m: number;
  step_count?: number;
  readings?: ReadingApi[];
}

export interface CarTrialApi {
  pwm: number;
  distance_m: number;
  seconds: number;
}

export interface FixApi {
  t_ms: number;
  lat: number;
  lon: number;
  accuracy_m: number;
}

export type GpsMethodApi = "single" | "mean" | "filtered";

export interface GpsMethodErrorApi {
  gps_distance_m: number;
  error_m: number;
  error_pct: number | null;
}

export interface GpsTrialApi {
  id: number;
  device_id: string;
  place_name: string;
  environment: EnvironmentApi;
  real_distance_m: number;
  fix_count: number;
  result: {
    methods: Record<GpsMethodApi, GpsMethodErrorApi>;
    reported_accuracy_m: number;
    /** CU-4: error usando solo los primeros N segundos quieto en cada punto (clave = segundos). */
    by_wait?: Record<string, GpsWaitErrorApi | null>;
    /** CU-4: error usando solo lecturas con precisión ≤ umbral (clave = umbral en m). */
    by_accuracy?: Record<string, GpsAccuracyErrorApi | null>;
  };
  created_at: string;
}

/** CU-4: error de una prueba con una sola configuración de espera o de umbral de precisión. */
export interface GpsWaitErrorApi {
  /** `false` si no había lecturas suficientes con esa espera. */
  usable: boolean;
  error_m: number | null;
}
export interface GpsAccuracyErrorApi extends GpsWaitErrorApi {
  /** Lecturas que cumplen el umbral y lecturas totales. */
  kept: number;
  total: number;
}

export interface GpsTrialBodyApi {
  device_id: string;
  place_name: string;
  environment: EnvironmentApi;
  real_distance_m: number;
  start_fixes: FixApi[];
  end_fixes: FixApi[];
}

export interface GpsSummaryApi {
  trials: number;
  methods: Partial<
    Record<
      GpsMethodApi,
      { mean_error_m: number; max_error_m: number; mean_error_pct: number | null }
    >
  >;
  best_method: GpsMethodApi | null;
  improvement_pct?: number | null;
  mean_reported_accuracy_m?: number;
  target_pct?: number;
  min_side_m: number | null;
  /** CU-4: todo lo siguiente es aditivo; un backend anterior no lo manda. */
  config?: GpsConfigApi;
  environments?: Partial<Record<EnvironmentApi, GpsEnvironmentApi>>;
  by_distance?: GpsDistanceBandApi[];
  error_trend?: "flat" | "grows" | null;
  by_accuracy?: GpsAccuracyBandApi[];
  recommended_accuracy_m?: number | null;
  by_wait?: GpsWaitBandApi[];
  reported_vs_real?: GpsReportedVsRealApi | null;
  warnings?: GpsWarningApi[];
  conclusion?: GpsConclusionApi;
}

export interface GpsConfigApi {
  target_pct: number;
  min_trials: number;
  accuracy_thresholds_m: number[];
  wait_seconds: number[];
  distance_bands_m: number[];
}

export interface GpsEnvironmentApi {
  trials: number;
  enough_data: boolean;
  missing_trials: number;
  best_method: GpsMethodApi | null;
  mean_error_m: number | null;
  max_error_m: number | null;
  /** Lado mínimo recomendado para ese entorno. */
  min_side_m: number | null;
}

export interface GpsDistanceBandApi {
  from_m: number;
  /** `null` en la última banda (sin tope). */
  to_m: number | null;
  trials: number;
  mean_error_m: number | null;
  max_error_m: number | null;
  mean_error_pct: number | null;
}

export interface GpsAccuracyBandApi {
  max_accuracy_m: number;
  usable_trials: number;
  mean_error_m: number | null;
  max_error_m: number | null;
  mean_kept_pct: number | null;
}

export interface GpsWaitBandApi {
  seconds: number;
  usable_trials: number;
  mean_error_m: number | null;
  max_error_m: number | null;
}

export interface GpsReportedVsRealApi {
  trials: number;
  mean_reported_accuracy_m: number;
  mean_expected_error_m: number;
  mean_real_error_m: number;
  /** > 1: el celular es optimista (el error real supera lo que informa). */
  ratio: number | null;
  optimistic: boolean;
}

export interface GpsWarningApi {
  code: string;
  environment: EnvironmentApi | null;
  message: string;
}

export interface GpsConclusionApi {
  code: "no_data" | "insufficient_data" | "ok";
  best_method: GpsMethodApi | null;
  min_side_m: number | null;
  trials: number;
  ready_environments?: string[];
  text: string;
}

export interface ModelErrorsApi {
  closure_error_pct: number;
  perimeter_error_pct: number | null;
}

export interface ModelRunApi {
  id: number;
  device_id: string;
  measurement_ids: number[];
  applied: boolean;
  result: {
    method: MethodApi;
    initial_params: Record<string, number>;
    final_params: Record<string, number>;
    baseline_cost: number;
    final_cost: number;
    improved: boolean;
    meets_green: boolean;
    attempts: { attempt: number; cost: number; best_cost: number; accepted: boolean }[];
    measurements: { measurement_id: number; before: ModelErrorsApi; after: ModelErrorsApi }[];
    holdout: { measurement_id: number; baseline_cost: number; tuned_cost: number } | null;
    generalizes: boolean | null;
  };
  created_at: string;
}

export interface ErrorSummaryApi {
  mean_closure_error_m: number | null;
  mean_closure_error_pct: number | null;
  mean_abs_perimeter_error_pct: number | null;
  quality: QualityApi | null;
}

export interface EvaluationErrorsApi {
  closure_error_m: number;
  closure_error_pct: number;
  perimeter_error_pct: number | null;
}

export type VerdictApi = "improves_green" | "improves_not_green" | "no_improvement";

export interface ModelEvaluationApi {
  method: MethodApi;
  measurement_count: number;
  train_count: number;
  holdout_measurement_id: number | null;
  green_limit_pct: number;
  initial_params: Record<string, number>;
  final_params: Record<string, number>;
  baseline: ErrorSummaryApi;
  model: ErrorSummaryApi;
  improvement_pct_points: number | null;
  improved: boolean;
  cost_improved: boolean;
  meets_green: boolean;
  generalizes: boolean | null;
  verdict: VerdictApi;
  curve: { attempt: number; without_model_pct: number | null; with_model_pct: number | null }[];
  measurements: {
    measurement_id: number;
    role: "train" | "holdout";
    before: EvaluationErrorsApi;
    after: EvaluationErrorsApi;
  }[];
}

export interface PolygonApi {
  points: PointApi[];
  sides_m: number[];
  angles_deg: number[];
  perimeter_m: number;
  area_m2: number;
  concave: boolean;
  self_crossing: boolean;
  closure_error_m: number;
  angle_sum_error_deg: number;
  closes: boolean;
  computed_sides: number[];
  computed_angles: number[];
  warnings: ("angle_sum_mismatch" | "does_not_close" | "self_crossing")[];
}
