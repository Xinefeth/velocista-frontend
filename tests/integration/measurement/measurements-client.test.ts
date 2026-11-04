import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccessToken } from "@/infrastructure/config";
import { ErrorApi } from "@/infrastructure/http/api";
import {
  calibrationsApi,
  gpsApi,
  measurementsApi,
  polygonsApi,
  precisionModelApi,
} from "@/infrastructure/http/measurements";

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;
const call = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit & { headers: Headers }];
  return {
    url,
    method: init.method ?? "GET",
    body: init.body ? JSON.parse(String(init.body)) : undefined,
    headers: init.headers,
  };
};

beforeEach(() => {
  setAccessToken(null);
  fetchMock = vi.fn(async () => json({}));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("cliente de mediciones contra la API", () => {
  it("lista con filtros y el tamaño de página máximo", async () => {
    await measurementsApi.list({ deviceId: "cel-1 a", placeName: "Aula" });
    expect(call().url).toBe("/api/measurements?device_id=cel-1+a&place_name=Aula&limit=200");
  });

  it("empieza, envía lecturas, termina y borra con los métodos del contrato", async () => {
    await measurementsApi.start({ method: "steps", place_name: "Aula", device_id: "d" });
    await measurementsApi.send(7, [{ seq: 0, t_ms: 1, kind: "corner" }]);
    await measurementsApi.finish(7);
    fetchMock.mockResolvedValueOnce(json(null, 204));
    await measurementsApi.remove(7);
    expect([0, 1, 2, 3].map((i) => [call(i).method, call(i).url])).toEqual([
      ["POST", "/api/measurements"],
      ["POST", "/api/measurements/7/readings"],
      ["POST", "/api/measurements/7/finish"],
      ["DELETE", "/api/measurements/7"],
    ]);
    expect(call(1).body).toEqual({ readings: [{ seq: 0, t_ms: 1, kind: "corner" }] });
  });

  it("manda el token cuando hay sesión", async () => {
    setAccessToken("abc");
    await calibrationsApi.state("cel/1");
    expect(call().url).toBe("/api/calibrations/cel%2F1");
    expect(call().headers.get("Authorization")).toBe("Bearer abc");
  });

  it("convierte el error del backend en ErrorApi con su reason", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        { detail: { reason: "measurement_not_found", detail: "Measurement 9 does not exist" } },
        404,
      ),
    );
    const error = await measurementsApi.get(9).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ status: 404, reason: "measurement_not_found" });
  });
});

describe("GPS, modelo y polígonos", () => {
  it("resumen del GPS con el porcentaje objetivo y cambio de nombre", async () => {
    await gpsApi.summary("d", 10);
    await gpsApi.rename(3, "Cancha");
    expect(call(0).url).toBe("/api/gps-trials/summary?device_id=d&target_pct=10");
    expect(call(1)).toMatchObject({
      method: "PATCH",
      url: "/api/gps-trials/3",
      body: { place_name: "Cancha" },
    });
  });

  it("el modelo corre y se evalúa con 40 intentos por defecto", async () => {
    await precisionModelApi.run([1, 2, 3], { apply: true });
    await precisionModelApi.evaluate([1, 2, 3]);
    expect(call(0).body).toEqual({ measurement_ids: [1, 2, 3], max_attempts: 40, apply: true });
    expect(call(1)).toMatchObject({
      url: "/api/precision-model/evaluations",
      body: { measurement_ids: [1, 2, 3], max_attempts: 40 },
    });
  });

  it("los polígonos van con null en lo que falta", async () => {
    await polygonsApi.solve([3, 4, null], [null, 90, null]);
    await polygonsApi.fromPoints([{ x: 0, y: 0 }]);
    expect(call(0).body).toEqual({ sides_m: [3, 4, null], angles_deg: [null, 90, null] });
    expect(call(1)).toMatchObject({
      url: "/api/polygons/from-points",
      body: { points: [{ x: 0, y: 0 }] },
    });
  });
});
