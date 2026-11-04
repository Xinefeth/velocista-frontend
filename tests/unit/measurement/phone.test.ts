import { describe, expect, it } from "vitest";
import {
  fixSideHeading,
  GRAVITY,
  integrateTurn,
  markCorner,
  metersBetween,
  newDeviceId,
  newWalk,
  normalizeDeviceId,
  shouldMarkCorner,
  stepCounter,
  stepForward,
  stillPoint,
  toLocal,
  unwrap,
} from "@/domain/measurement/phone";
import { storedDevice } from "@/celular/context";
import { errorText } from "@/domain/measurement/labels";
import { isReadingCap, measurementBody } from "@/celular/tabs/Measure";
import { gpsTone, realDistance } from "@/celular/tabs/GpsError";
import { findDevice } from "@/celular/tabs/Connection";

/** Aceleración vertical de una caminata: un pico de +2 m/s² y un valle de −2 cada 500 ms. */
function walkAccel(steps: number) {
  const out: { t: number; acc: number[] }[] = [];
  for (let i = 0; i < steps * 25; i++) {
    const phase = (i % 25) / 25;
    const extra = phase < 0.2 ? 2 : phase > 0.5 && phase < 0.7 ? -2 : 0;
    out.push({ t: i * 20, acc: [0, 0, GRAVITY + extra] });
  }
  return out;
}

describe("contador de pasos (misma regla que el backend)", () => {
  it("cuenta un paso por pico", () => {
    const count = stepCounter();
    let n = 0;
    for (const s of walkAccel(10)) n = count(s.t, s.acc);
    expect(n).toBe(10);
  });

  it("quieto no cuenta y sin acelerómetro devuelve la misma cuenta", () => {
    const count = stepCounter();
    for (let i = 0; i < 100; i++) count(i * 20, [0, 0, GRAVITY]);
    expect(count(3000, null)).toBe(0);
  });

  it("con un umbral aprendido más alto, una pisada suave no cuenta", () => {
    const count = stepCounter(3);
    let n = 0;
    for (const s of walkAccel(5)) n = count(s.t, s.acc);
    expect(n).toBe(0);
  });
});

describe("GPS de una persona quieta", () => {
  const fix = (lat: number, lon: number, accuracy_m: number) => ({ t_ms: 0, lat, lon, accuracy_m });

  it("descarta las lecturas peores que la mediana y pondera por precisión", () => {
    const p = stillPoint([
      fix(-8, -79, 4),
      fix(-8, -79, 4),
      fix(-8.001, -79, 40),
      fix(-8, -79, 3),
    ])!;
    expect(p.lat).toBeCloseTo(-8, 6);
    expect(p.accuracy_m).toBe(4);
  });

  it("con menos de 3 lecturas no hay punto", () => {
    expect(stillPoint([fix(0, 0, 1), fix(0, 0, 1)])).toBeNull();
  });

  it("convierte a metros (1 milésima de grado de latitud ≈ 111 m)", () => {
    const o = { lat: -8.1116, lon: -79.0287 };
    expect(toLocal({ lat: -8.1106, lon: -79.0287 }, o).y).toBeCloseTo(111.2, 0);
    expect(metersBetween(o, { lat: -8.1116, lon: -79.0277 })).toBeCloseTo(110.1, 0);
  });
});

describe("giro y recorrido en vivo", () => {
  it("integra el giro restando el sesgo y limita saltos de tiempo a 1 s", () => {
    expect(integrateTurn(0, 10.4, 0.4, 500)).toBeCloseTo(5);
    expect(integrateTurn(0, 10, 0, 5000)).toBe(10);
  });

  it("une los ángulos de orientación sin saltar en ±180°", () => {
    expect(unwrap(null, null, 350)).toBe(350);
    expect(unwrap(350, 350, 10)).toBe(370);
    expect(unwrap(10, 370, 350)).toBe(350);
  });

  it("esquina automática: tras 1 m y un giro de más de 60°", () => {
    let w = newWalk();
    for (let i = 0; i < 2; i++) w = fixSideHeading(stepForward(w, 0.7));
    expect(w.sideHeading).toBe(0);
    expect(shouldMarkCorner({ ...w, heading: 50 })).toBe(false);
    w = { ...w, heading: 90 };
    expect(shouldMarkCorner(w)).toBe(true);
    w = markCorner(w);
    expect(w.sides).toEqual([1.4]);
    expect(w.sideHeading).toBeNull();
    // el paso siguiente avanza a 90° (hacia +y)
    const next = stepForward(w, 1);
    expect(next.path.at(-1)!.y).toBeCloseTo(1);
  });

  it("el código nuevo del celular empieza con cel-", () => {
    expect(newDeviceId()).toMatch(/^cel-/);
  });
});

describe("validación de los formularios del celular", () => {
  const base = {
    method: "steps" as const,
    place: "Aula",
    hasRef: false,
    length: "",
    width: "",
    tape: "",
    scaleN: "1",
  };

  it("medición sin plano, con plano y con lado de cinta", () => {
    expect(measurementBody(base, "cel-1")).toEqual({
      method: "steps",
      source: "phone",
      mount: "hand",
      place_name: "Aula",
      device_id: "cel-1",
    });
    const withRef = measurementBody(
      { ...base, hasRef: true, length: "8", width: "6", tape: "8" },
      "d",
    );
    expect(withRef).toMatchObject({ tape_side_m: 8, reference: { scale_n: 1 } });
  });

  it("entradas inválidas: sin lugar, sin medidas y lado de cinta no numérico", () => {
    expect(measurementBody({ ...base, place: " " }, "d")).toMatch(/nombre del lugar/);
    expect(measurementBody({ ...base, hasRef: true, length: "8" }, "d")).toMatch(
      /largo y el ancho/,
    );
    expect(
      measurementBody({ ...base, hasRef: true, length: "8", width: "6", tape: "x" }, "d"),
    ).toMatch(/primer lado/);
  });

  it("por GPS no se pide plano", () => {
    expect(measurementBody({ ...base, method: "gps", hasRef: true }, "d")).not.toHaveProperty(
      "reference",
    );
  });

  it("distancia real de la prueba del GPS y su semáforo", () => {
    expect(realDistance("known", 30, 0, null)).toBe(30);
    expect(realDistance("steps", 0, 40, 0.7)).toBeCloseTo(28);
    expect(realDistance("steps", 0, 40, null)).toBe(0);
    expect(realDistance("loop", 30, 40, 0.7)).toBe(0);
    expect([gpsTone(1, 3), gpsTone(3, 10), gpsTone(9, 20)]).toEqual(["good", "warn", "red"]);
    expect([gpsTone(4, null), gpsTone(12, null)]).toEqual(["good", "red"]);
  });

  it("recuperar el código: único, ambiguo, corto o inexistente", () => {
    const ids = ["cel-621b8d99-a", "cel-621b8d00-b", "cel-77aa0011-c"];
    expect(findDevice("77aa0011", ids)).toEqual({ id: "cel-77aa0011-c" });
    expect(findDevice("621b8d", ids)).toEqual({ error: expect.stringMatching(/varios/) });
    expect(findDevice("621", ids)).toEqual({ error: expect.stringMatching(/6 primeros/) });
    expect(findDevice("ffffffff", ids)).toEqual({ error: expect.stringMatching(/No encontré/) });
  });
});

describe("id del dispositivo guardado por la página vieja", () => {
  it("quita las comillas JSON y deja intacto el id sin comillas", () => {
    expect(normalizeDeviceId('"cel-621b8d99-aaaa"')).toBe("cel-621b8d99-aaaa");
    expect(normalizeDeviceId("cel-621b8d99-aaaa")).toBe("cel-621b8d99-aaaa");
    expect(normalizeDeviceId('  "cel-1"  ')).toBe("cel-1");
  });

  it("devuelve null si no hay un id usable", () => {
    expect(normalizeDeviceId(null)).toBeNull();
    expect(normalizeDeviceId("")).toBeNull();
    expect(normalizeDeviceId('""')).toBeNull();
    expect(normalizeDeviceId('"   "')).toBeNull();
  });

  it("storedDevice lee el valor viejo con comillas, lo usa limpio y lo deja guardado limpio", () => {
    localStorage.clear();
    localStorage.setItem("apaec.celular.device", '"cel-621b8d99-aaaa"');
    expect(storedDevice("")).toBe("cel-621b8d99-aaaa");
    expect(localStorage.getItem("apaec.celular.device")).toBe("cel-621b8d99-aaaa");
    expect(storedDevice("")).toBe("cel-621b8d99-aaaa");
    localStorage.clear();
  });

  it("storedDevice crea un id nuevo si no había y respeta ?dev=", () => {
    localStorage.clear();
    expect(storedDevice("")).toMatch(/^cel-/);
    expect(storedDevice("?dev=cel-otro")).toBe("cel-otro");
    expect(localStorage.getItem("apaec.celular.device")).toBe("cel-otro");
    localStorage.clear();
  });
});

describe("tope de lecturas (409)", () => {
  it("solo el 409 con la razón de tope corta el envío", () => {
    expect(isReadingCap({ status: 409, reason: "measurement_too_many_readings" })).toBe(true);
    expect(isReadingCap({ status: 409, reason: "measurement_finished" })).toBe(false);
    expect(isReadingCap({ status: 401, reason: "measurement_too_many_readings" })).toBe(false);
    expect(isReadingCap(new TypeError("Failed to fetch"))).toBe(false);
    expect(isReadingCap(null)).toBe(false);
  });

  it("la razón tiene texto en español", () => {
    const text = errorText({ reason: "measurement_too_many_readings", message: "x" });
    expect(text).toMatch(/máximo de lecturas/);
    expect(text).toMatch(/Terminar y calcular/);
  });
});
