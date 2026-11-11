// CU-4 · Pantallas del error del GPS por tamaño: lado mínimo por entorno, error según la distancia,
// espera de precisión, precisión informada frente a la real y avisos de pocas pruebas. Consola y
// celular leen todo del resumen del backend; las cifras de las pruebas son del contrato de ejemplo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { sensors } from "@/celular/sensors";
import { neededAccuracy } from "@/celular/tabs/GpsError";
import {
  bandLabel,
  environmentRows,
  recommendedAccuracy,
  trendText,
  trialsOfEnv,
  waitText,
} from "@/domain/measurement/gpsSize";
import type { GpsSummaryApi } from "@/infrastructure/contracts/measurements";
import { GpsTrials } from "@/ui/components/measurement/GpsTrials";
import { stubBrowser } from "../pages/_harness";
import { gpsTrial, measurement, mockApi } from "./_api";

const DEVICE = "cel-621b8d99-aaaa";
const CAL = {
  device_id: DEVICE,
  calibration: { ...measurement(1).calibration },
  ready: { steps: true, car: false, gps: true },
  records: {},
};

const method = (mean: number, max: number, pct: number | null = 5) => ({
  mean_error_m: mean,
  max_error_m: max,
  mean_error_pct: pct,
});

/** Resumen con la forma nueva del contrato (valores de ejemplo, no reglas del sistema). */
function summary(over: Partial<GpsSummaryApi> = {}): GpsSummaryApi {
  return {
    trials: 7,
    methods: { single: method(6.2, 9), mean: method(3.1, 4), filtered: method(2.4, 3) },
    best_method: "filtered",
    improvement_pct: 61.3,
    target_pct: 10,
    min_side_m: 30,
    config: {
      target_pct: 10,
      min_trials: 5,
      accuracy_thresholds_m: [3, 5, 10, 20],
      wait_seconds: [5, 10, 20],
      distance_bands_m: [5, 20, 50],
    },
    environments: {
      open: {
        trials: 5,
        enough_data: true,
        missing_trials: 0,
        best_method: "filtered",
        mean_error_m: 2.4,
        max_error_m: 3,
        min_side_m: 30,
      },
      indoor: {
        trials: 2,
        enough_data: false,
        missing_trials: 3,
        best_method: "mean",
        mean_error_m: 6.1,
        max_error_m: 8,
        min_side_m: 80,
      },
    },
    by_distance: [
      { from_m: 0, to_m: 5, trials: 1, mean_error_m: 2, max_error_m: 2, mean_error_pct: 40 },
      { from_m: 5, to_m: 20, trials: 3, mean_error_m: 2.5, max_error_m: 3, mean_error_pct: 15 },
      { from_m: 20, to_m: 50, trials: 3, mean_error_m: 2.6, max_error_m: 3.2, mean_error_pct: 8 },
      {
        from_m: 50,
        to_m: null,
        trials: 0,
        mean_error_m: null,
        max_error_m: null,
        mean_error_pct: null,
      },
    ],
    error_trend: "flat",
    by_accuracy: [
      {
        max_accuracy_m: 3,
        usable_trials: 2,
        mean_error_m: 1.1,
        max_error_m: 1.5,
        mean_kept_pct: 30,
      },
      {
        max_accuracy_m: 5,
        usable_trials: 6,
        mean_error_m: 1.9,
        max_error_m: 2.6,
        mean_kept_pct: 62,
      },
    ],
    recommended_accuracy_m: 3,
    by_wait: [
      { seconds: 5, usable_trials: 7, mean_error_m: 3.4, max_error_m: 5 },
      { seconds: 20, usable_trials: 7, mean_error_m: 2.4, max_error_m: 3 },
    ],
    reported_vs_real: {
      trials: 7,
      mean_reported_accuracy_m: 4,
      mean_expected_error_m: 5.7,
      mean_real_error_m: 8.9,
      ratio: 1.56,
      optimistic: true,
    },
    warnings: [
      {
        code: "gps_environment_few_trials",
        environment: "indoor",
        message: "Bajo techo tiene 2 pruebas; faltan 3 para llegar a 5.",
      },
    ],
    conclusion: {
      code: "ok",
      best_method: "filtered",
      min_side_m: 30,
      trials: 7,
      ready_environments: ["open"],
      text: "Con 7 pruebas, el mejor método es el promedio filtrado y el lado mínimo es de 30 m.",
    },
    ...over,
  };
}

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sensors.fix = null;
});

describe("CU-4 · textos del dominio", () => {
  it("rotula las bandas de distancia", () => {
    expect(bandLabel({ from_m: 0, to_m: 5 })).toBe("hasta 5 m");
    expect(bandLabel({ from_m: 5, to_m: 20 })).toBe("5 a 20 m");
    expect(bandLabel({ from_m: 50, to_m: null })).toBe("más de 50 m");
  });
  it("dice si el error crece con la distancia o no, y calla sin datos", () => {
    expect(trendText("flat")).toMatch(/no crece/);
    expect(trendText("grows")).toMatch(/crece con la distancia/);
    expect(trendText(null)).toBeNull();
  });
  it("marca los entornos con pocas pruebas y los ordena", () => {
    expect(trialsOfEnv(2, false, 3, 5)).toBe("2 de 5 · faltan 3");
    expect(trialsOfEnv(6, true, 0, 5)).toBe("6");
    expect(environmentRows(summary()).map((r) => r.id)).toEqual(["open", "indoor"]);
    expect(environmentRows(null)).toEqual([]);
  });
  it("la precisión a esperar sale de lo escrito o de la recomendada (0 = no esperar)", () => {
    expect(recommendedAccuracy(summary())).toBe(3);
    expect(recommendedAccuracy(null)).toBeNull();
    expect(neededAccuracy("", 3)).toBe(3);
    expect(neededAccuracy("7,5", 3)).toBe(7.5);
    expect(neededAccuracy("0", 3)).toBeNull();
    expect(neededAccuracy("", null)).toBeNull();
    expect(waitText(9, 3)).toContain("± 9 m");
    expect(waitText(null, 3)).toContain("Esperando señal GPS");
  });
});

describe("CU-4 · consola: Precisión del GPS", () => {
  const routes = (s: GpsSummaryApi = summary()) => ({
    "GET /gps-trials": [gpsTrial(1, 5, 2)],
    "GET /gps-trials/summary": s,
  });

  it("muestra el lado mínimo por entorno con las pruebas que faltan", async () => {
    mockApi(routes());
    render(<GpsTrials />);
    const t = await screen.findByRole("table", { name: "Lado mínimo por entorno" });
    const rows = within(t).getAllByRole("row");
    expect(rows[1].textContent).toContain("Aire libre");
    expect(rows[1].textContent).toContain("30 m");
    expect(rows[2].textContent).toContain("Bajo techo");
    expect(rows[2].textContent).toContain("2 de 5 · faltan 3");
    expect(rows[2].textContent).toContain("80 m");
  });

  it("muestra el error según la distancia y que no crece", async () => {
    mockApi(routes());
    render(<GpsTrials />);
    const t = await screen.findByRole("table", { name: "Error según la distancia" });
    const rows = within(t)
      .getAllByRole("row")
      .map((r) => r.textContent ?? "");
    expect(rows[1]).toContain("hasta 5 m");
    expect(rows[4]).toContain("más de 50 m");
    expect(rows[4]).toContain("—");
    expect(screen.getByText(/El error en metros no crece con la distancia/)).toBeTruthy();
  });

  it("muestra la espera de precisión recomendada y el tiempo quieto", async () => {
    mockApi(routes());
    render(<GpsTrials />);
    const t = await screen.findByRole("table", { name: "Error según la precisión exigida" });
    expect(within(t).getByText(/recomendada/).textContent).toContain("± 3 m");
    expect(
      screen.getByRole("table", { name: "Error según el tiempo quieto" }).textContent,
    ).toContain("Primeros 20 s");
    expect(screen.getByText(/Conviene esperar a una precisión de ± 3 m/)).toBeTruthy();
  });

  it("compara la precisión informada con el error real y dice si el celular es optimista", async () => {
    mockApi(routes());
    render(<GpsTrials />);
    const dl = await screen.findByLabelText("Precisión informada frente a la real");
    expect(dl.textContent).toContain("± 4.0 m");
    expect(dl.textContent).toContain("8.9 m");
    expect(dl.textContent).toContain("1.56");
    expect(screen.getByText(/El celular es optimista/)).toBeTruthy();
  });

  it("muestra el aviso de pocas pruebas y la conclusión que genera el backend", async () => {
    mockApi(routes());
    render(<GpsTrials />);
    expect(
      await screen.findByText("Bajo techo tiene 2 pruebas; faltan 3 para llegar a 5."),
    ).toBeTruthy();
    expect(screen.getByText(/el mejor método es el promedio filtrado/)).toBeTruthy();
  });

  it("sin pruebas no inventa cifras: listas vacías y mensajes", async () => {
    mockApi({
      "GET /gps-trials": [],
      "GET /gps-trials/summary": summary({
        trials: 0,
        methods: {},
        best_method: null,
        min_side_m: null,
        environments: {},
        error_trend: null,
        recommended_accuracy_m: null,
        reported_vs_real: null,
        by_distance: [],
        by_accuracy: [],
        by_wait: [],
        warnings: [
          {
            code: "gps_few_trials",
            environment: null,
            message: "Hay 0 pruebas; se recomiendan al menos 5.",
          },
        ],
        conclusion: {
          code: "no_data",
          best_method: null,
          min_side_m: null,
          trials: 0,
          text: "Todavía no hay pruebas de GPS.",
        },
      }),
    });
    render(<GpsTrials />);
    expect(await screen.findByText("Aún no hay pruebas por entorno.")).toBeTruthy();
    expect(screen.getByText("Hay 0 pruebas; se recomiendan al menos 5.")).toBeTruthy();
    expect(
      screen.getByText(/Aún no hay pruebas para comparar la precisión informada/),
    ).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Error según la distancia" })).toBeNull();
  });

  it("el objetivo y el mínimo de pruebas son configurables y se mandan al backend", async () => {
    const api = mockApi(routes());
    render(<GpsTrials />);
    await screen.findByRole("table", { name: "Lado mínimo por entorno" });
    // el mínimo sale de la configuración del servidor, no está escrito en la pantalla
    expect(
      (screen.getByLabelText("Mínimo de pruebas por entorno") as HTMLInputElement).placeholder,
    ).toBe("5");
    fireEvent.change(screen.getByLabelText("Error objetivo del GPS (%)"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("Mínimo de pruebas por entorno"), {
      target: { value: "8" },
    });
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.path === "/gps-trials/summary?target_pct=15&min_trials=8"),
      ).toBe(true),
    );
  });

  it("una configuración inválida no se manda", async () => {
    const api = mockApi(routes());
    render(<GpsTrials />);
    await screen.findByRole("table", { name: "Lado mínimo por entorno" });
    fireEvent.change(screen.getByLabelText("Mínimo de pruebas por entorno"), {
      target: { value: "2.5" },
    });
    fireEvent.change(screen.getByLabelText("Error objetivo del GPS (%)"), {
      target: { value: "-3" },
    });
    await waitFor(() =>
      expect(api.calls.filter((c) => c.path.startsWith("/gps-trials/summary")).pop()?.path).toBe(
        "/gps-trials/summary",
      ),
    );
  });
});

describe("CU-4 · celular: pestaña Error GPS", () => {
  const show = () =>
    render(
      <PhoneProvider initialDevice={DEVICE}>
        <PhoneApp />
      </PhoneProvider>,
    );
  const openTab = () => fireEvent.click(screen.getByRole("button", { name: "4. Error GPS" }));
  const emit = (accuracy: number) => {
    const fix = { t_ms: Date.now(), lat: 10, lon: -60, accuracy_m: accuracy };
    sensors.fix = fix;
    const hub = sensors as unknown as { fixes: Set<(f: typeof fix) => void> };
    act(() => hub.fixes.forEach((fn) => fn(fix)));
  };
  const base = (s: GpsSummaryApi) => ({
    [`GET /calibrations/${DEVICE}`]: CAL,
    "GET /gps-trials": [],
    "GET /gps-trials/summary": s,
  });

  it("avisa de pocas pruebas en el entorno elegido antes de empezar", async () => {
    mockApi(
      base(
        summary({
          warnings: [
            {
              code: "gps_few_trials",
              environment: null,
              message: "Hay 2 pruebas; se recomiendan al menos 5.",
            },
            {
              code: "gps_environment_few_trials",
              environment: "indoor",
              message: "Bajo techo tiene 2 pruebas; faltan 3 para llegar a 5.",
            },
          ],
        }),
      ),
    );
    show();
    openTab();
    expect(
      (await screen.findAllByText("Hay 2 pruebas; se recomiendan al menos 5.")).length,
    ).toBeGreaterThan(0);
    const warn = () =>
      screen.queryAllByText("Bajo techo tiene 2 pruebas; faltan 3 para llegar a 5.").length;
    expect(warn()).toBe(1); // solo en el resumen
    fireEvent.change(screen.getByLabelText("¿Cómo es el lugar?"), { target: { value: "indoor" } });
    expect(warn()).toBe(2); // y ahora también junto al entorno elegido
  });

  it("el resumen del celular trae el lado mínimo por entorno, la distancia y la precisión informada", async () => {
    mockApi(base(summary()));
    show();
    openTab();
    expect(await screen.findByRole("table", { name: "Lado mínimo por entorno" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Error según la distancia" })).toBeTruthy();
    expect(screen.getByLabelText("Precisión informada frente a la real")).toBeTruthy();
  });

  it("antes de medir espera a la precisión recomendada y empieza cuando llega", async () => {
    mockApi(base(summary()));
    show();
    openTab();
    await screen.findByRole("table", { name: "Lado mínimo por entorno" });
    emit(12); // hay señal, pero con ± 12 m (la recomendada es ± 3 m)
    fireEvent.click(screen.getByRole("button", { name: "Estoy en el inicio" }));
    expect(await screen.findByText("Espera a que el GPS se afine")).toBeTruthy();
    expect(screen.getByText(/Precisión ahora ± 12 m\. Espero ± 3 m o mejor\./)).toBeTruthy();
    emit(2.5);
    expect(await screen.findByText("Quédate quieta en el inicio")).toBeTruthy();
    // sale de la espera: el botón ya no es «Medir sin esperar»
    expect(screen.queryByRole("button", { name: "Medir sin esperar" })).toBeNull();
  });

  it("«Medir sin esperar» salta la espera", async () => {
    mockApi(base(summary()));
    show();
    openTab();
    await screen.findByRole("table", { name: "Lado mínimo por entorno" });
    emit(12);
    fireEvent.click(screen.getByRole("button", { name: "Estoy en el inicio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Medir sin esperar" }));
    expect(await screen.findByText("Quédate quieta en el inicio")).toBeTruthy();
  });

  it("con 0 no espera aunque haya una recomendación", async () => {
    mockApi(base(summary()));
    show();
    openTab();
    await screen.findByRole("table", { name: "Lado mínimo por entorno" });
    emit(12);
    fireEvent.change(screen.getByLabelText("Esperar precisión de (m)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Estoy en el inicio" }));
    expect(await screen.findByText("Quédate quieta en el inicio")).toBeTruthy();
  });

  it("cancelar durante la espera vuelve al inicio sin guardar nada", async () => {
    const api = mockApi(base(summary()));
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    show();
    openTab();
    await screen.findByRole("table", { name: "Lado mínimo por entorno" });
    emit(12);
    fireEvent.click(screen.getByRole("button", { name: "Estoy en el inicio" }));
    await screen.findByText("Espera a que el GPS se afine");
    fireEvent.click(screen.getByRole("button", { name: /Cancelar prueba/ }));
    expect(await screen.findByRole("button", { name: "Estoy en el inicio" })).toBeTruthy();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });
});
