import type { Page } from "@playwright/test";

/**
 * Backend en memoria de Medición (mediciones, calibración, GPS, modelo, polígonos y pistas) con los
 * campos en inglés del contrato real. Se registra después de `fakeBackend`, así que tiene prioridad.
 */
const DEVICE = "cel-621b8d99-e2e";
const RECT = (L: number, W: number) => [
  { x: 0, y: 0 },
  { x: L, y: 0 },
  { x: L, y: W },
  { x: 0, y: W },
];

function shoelace(pts: { x: number; y: number }[]) {
  let s = 0;
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { area: Math.abs(s) / 2, perimeter: p };
}

function measurement(
  id: number,
  place: string,
  closurePct: number,
  perimeter: number,
  area: number,
) {
  const path = RECT(8, 6);
  return {
    id,
    device_id: DEVICE,
    method: "steps",
    source: "phone",
    mount: "hand",
    place_name: place,
    closed: true,
    reference: { points: RECT(8, 6), scale_n: 1, name: "" },
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
    result: {
      method: "steps",
      reading_count: 1500,
      step_count: 40,
      distance_m: perimeter,
      closure_error_m: (perimeter * closurePct) / 100,
      closure_error_pct: closurePct,
      heading_drift_deg: 4,
      raw_perimeter_m: perimeter + 0.4,
      raw_area_m2: area + 1,
      perimeter_m: perimeter,
      area_m2: area,
      scale_factor: null,
      corners: 3,
      concave: false,
      self_crossing: false,
      quality: closurePct < 3 ? "green" : closurePct <= 6 ? "yellow" : "red",
      reference_perimeter_m: 28,
      reference_area_m2: 48,
      perimeter_error_pct: ((perimeter - 28) / 28) * 100,
      area_error_pct: ((area - 48) / 48) * 100,
      min_gps_size_m: null,
      warnings: [],
      raw_path: [...path, { x: 0.3, y: -0.2 }],
      corrected_path: [...path, { x: 0, y: 0 }],
      polygon: path,
    },
  };
}

export async function fakeMeasurements(page: Page) {
  const items = [
    measurement(1, "Aula 204", 2.1, 28.4, 47.1),
    measurement(2, "Aula 204", 4.2, 29.1, 50.2),
    measurement(3, "Aula 204", 1.4, 27.8, 47.8),
  ];
  const gpsTrials = [1, 2, 3].map((id) => ({
    id,
    device_id: DEVICE,
    place_name: ["Cancha", "Calle", "Parque"][id - 1],
    environment: "open",
    real_distance_m: 50,
    fix_count: 40,
    result: {
      methods: {
        single: { gps_distance_m: 56, error_m: 6 + id, error_pct: 12 },
        mean: { gps_distance_m: 53, error_m: 3 + id, error_pct: 6 },
        filtered: { gps_distance_m: 52, error_m: 2 + id / 2, error_pct: 4 },
      },
      reported_accuracy_m: 4.5,
    },
    created_at: "2026-11-03T10:00:00Z",
  }));
  const track = {
    id: 1,
    name: "Rectángulo 8 × 6",
    board: { width_cm: 900, height_cm: 700 },
    closed: true,
    points: RECT(800, 600).map((p) => ({ ...p, radius: 0, gap: false })),
    zones: [],
    start: { edge: 0, t: 0 },
    profile_id: null,
    length_cm: 2800,
    perimeter_cm: 2800,
    area_cm2: 480000,
    created_at: "2026-10-28T10:00:00Z",
    updated_at: "2026-10-28T10:00:00Z",
  };
  const matches = (url: URL) =>
    /\/api\/(measurements|calibrations|gps-trials|precision-model|polygons|tracks)/.test(
      url.pathname,
    );

  await page.route(matches, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/measurements" && method === "GET")
      return json({ items, total: items.length, limit: 200, offset: 0 });
    const one = /^\/measurements\/(\d+)$/.exec(path);
    if (one && method === "GET") {
      const m = items.find((x) => x.id === Number(one[1]));
      return m ? json(m) : json({ detail: { reason: "measurement_not_found", detail: "x" } }, 404);
    }
    if (/^\/measurements\/\d+\/readings$/.test(path)) return json([]);
    if (path.startsWith("/calibrations/"))
      return json({
        device_id: DEVICE,
        calibration: items[0].calibration,
        ready: { steps: true, car: false, gps: true },
        records: {},
      });
    if (path === "/gps-trials") return json(gpsTrials);
    if (path === "/gps-trials/summary")
      return json({
        trials: 3,
        methods: {
          single: { mean_error_m: 8, max_error_m: 9, mean_error_pct: 16 },
          mean: { mean_error_m: 5, max_error_m: 6, mean_error_pct: 10 },
          filtered: { mean_error_m: 3, max_error_m: 3.5, mean_error_pct: 6 },
        },
        best_method: "filtered",
        improvement_pct: 62.5,
        target_pct: 10,
        min_side_m: 35,
      });
    if (path === "/precision-model/evaluations") {
      const ids = (request.postDataJSON() as { measurement_ids: number[] }).measurement_ids;
      return json({
        method: "steps",
        measurement_count: ids.length,
        train_count: ids.length - 1,
        holdout_measurement_id: ids[ids.length - 1],
        green_limit_pct: 3,
        initial_params: { gyro_bias_dps: 0.4, step_length_m: 0.7 },
        final_params: { gyro_bias_dps: 0.5, step_length_m: 0.68 },
        baseline: {
          mean_closure_error_m: 0.9,
          mean_closure_error_pct: 3.15,
          mean_abs_perimeter_error_pct: 2.6,
          quality: "yellow",
        },
        model: {
          mean_closure_error_m: 0.6,
          mean_closure_error_pct: 2.2,
          mean_abs_perimeter_error_pct: 1.1,
          quality: "green",
        },
        improvement_pct_points: 0.95,
        improved: true,
        cost_improved: true,
        meets_green: true,
        generalizes: true,
        verdict: "improves_green",
        curve: [0, 1, 2].map((attempt) => ({
          attempt,
          without_model_pct: 3.15,
          with_model_pct: 3.15 - attempt * 0.475,
        })),
        measurements: ids.map((id, i) => ({
          measurement_id: id,
          role: i === ids.length - 1 ? "holdout" : "train",
          before: { closure_error_m: 0.9, closure_error_pct: 3.1, perimeter_error_pct: 2 },
          after: { closure_error_m: 0.6, closure_error_pct: 2.1, perimeter_error_pct: 1 },
        })),
      });
    }
    if (path === "/polygons/from-points") {
      const pts = (request.postDataJSON() as { points: { x: number; y: number }[] }).points;
      const { area, perimeter } = shoelace(pts);
      return json({
        points: pts,
        sides_m: pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          return Math.hypot(q.x - p.x, q.y - p.y);
        }),
        angles_deg: pts.map(() => 90),
        perimeter_m: perimeter,
        area_m2: area,
        concave: pts.length > 4,
        self_crossing: false,
        closure_error_m: 0,
        angle_sum_error_deg: 0,
        closes: true,
        computed_sides: [],
        computed_angles: [],
        warnings: [],
      });
    }
    if (path === "/polygons/solve") {
      const body = request.postDataJSON() as { sides_m: (number | null)[] };
      if (body.sides_m.filter((s) => s == null).length > 2)
        return json({ detail: { reason: "polygon_underdetermined", detail: "x" } }, 422);
      return json({
        points: RECT(8, 6),
        sides_m: [8, 6, 8, 6],
        angles_deg: [90, 90, 90, 90],
        perimeter_m: 28,
        area_m2: 48,
        concave: false,
        self_crossing: false,
        closure_error_m: 0,
        angle_sum_error_deg: 0,
        closes: true,
        computed_sides: [3],
        computed_angles: [3],
        warnings: [],
      });
    }
    if (path === "/tracks") return json({ items: [track], total: 1, limit: 200, offset: 0 });
    return json({ detail: { reason: "not_found", detail: `No simulado: ${method} ${path}` } }, 404);
  });
  return { items, device: DEVICE };
}
