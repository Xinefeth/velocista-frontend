// Cotas y ángulos sobre el plano (consola) y lados en el celular: qué etiquetas se dibujan, que no se
// pisen ni se salgan del lienzo (a 1440 y a 360 px) y la tabla de lados con la diferencia frente al plano.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { measurementToDxf } from "@/domain/measurement/dxf";
import type { DxfSource } from "@/domain/measurement/dxfParse";
import { ImportDxfPlan } from "@/ui/components/measurement/ImportDxfPlan";
import { SidesTable } from "@/ui/components/measurement/SidesTable";
import { Odometry } from "@/ui/pages/measurement/Odometry";
import { stubBrowser } from "../pages/_harness";
import { expectClean, stubCanvas, type CanvasLog } from "./_canvas";
import { measurement, mockApi, result } from "./_api";
import { gpsMeasurement, realWalk } from "../../unit/measurement/_gps";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/fixtures/dxf", name), "utf8");
const file = (text: string, name = "plano.dxf") => new File([text], name);

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
beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Harness() {
  const [value, setValue] = useState<DxfSource | null>(null);
  return <ImportDxfPlan value={value} onChange={setValue} />;
}
function choose(f: File) {
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
    target: { files: [f] },
  });
}

describe.each([
  ["1440 px", 700],
  ["360 px", 300],
])("vista previa del plano importado (%s)", (_name, width) => {
  let log: CanvasLog;
  beforeEach(() => {
    log = stubCanvas(width, 280);
  });

  it("rectángulo 8 × 6: largo de cada lado, vértices con ángulo, perímetro y área", async () => {
    render(<Harness />);
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    await waitFor(() => expect(log.texts).toContain("Área 48.00 m²"));
    expect(log.texts).toContain("Perímetro 28.00 m");
    expect(log.texts.filter((t) => t === "8.00 m")).toHaveLength(2);
    expect(log.texts.filter((t) => t === "6.00 m")).toHaveLength(2);
    for (const v of ["A", "B", "C", "D"]) expect(log.texts).toContain(`${v} 90°`);
    expectClean(log);
  });

  it("Terreno en L: seis lados, el ángulo reflejo de 270° y nada se pisa ni se sale", async () => {
    render(<Harness />);
    choose(file(fixture("export-terreno-en-L.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    await waitFor(() => expect(log.texts).toContain("Área 75.00 m²"));
    expect(log.texts).toContain("Perímetro 40.00 m");
    expect(log.texts.filter((t) => t === "10.00 m")).toHaveLength(2);
    expect(log.texts.filter((t) => t === "5.00 m")).toHaveLength(4);
    expect(log.texts.filter((t) => t.endsWith("90°"))).toHaveLength(5);
    expect(log.texts).toContain("D 270°");
    expectClean(log);
  });
});

describe("tabla de lados (texto para lectores de pantalla)", () => {
  const RECT_8x6 = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ];
  const MEASURED = [
    { x: 0, y: 0 },
    { x: 8.12, y: 0 },
    { x: 8.12, y: 5.94 },
    { x: 0, y: 5.94 },
  ];

  it("con plano de los mismos vértices muestra medido, plano y diferencia por lado", () => {
    render(<SidesTable polygon={MEASURED} plan={RECT_8x6} />);
    const rows = within(
      screen.getByRole("table", { name: "Lados del contorno medido" }),
    ).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(rows[1].textContent).toContain("AB");
    expect(rows[1].textContent).toContain("8.12 m");
    expect(rows[1].textContent).toContain("8.00 m");
    expect(rows[1].textContent).toContain("+0.12 m");
    expect(rows[2].textContent).toContain("−0.06 m");
    expect(rows[1].textContent).toContain("B 90°");
  });

  it("sin plano solo muestra lados y ángulos", () => {
    render(<SidesTable polygon={MEASURED} />);
    expect(screen.queryByText("Diferencia")).toBeNull();
    expect(screen.getByText("Medido")).toBeTruthy();
  });

  it("con otro número de vértices avisa que no compara lado por lado", () => {
    render(
      <SidesTable
        polygon={MEASURED}
        plan={[
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 10 },
          { x: 0, y: 10 },
        ]}
      />,
    );
    expect(screen.queryByText("Diferencia")).toBeNull();
    expect(screen.getByText(/distinto número de vértices/)).toBeTruthy();
  });

  it("un contorno sin área no dibuja nada", () => {
    const { container } = render(<SidesTable polygon={[{ x: 0, y: 0 }]} />);
    expect(container.textContent).toBe("");
  });
});

describe("Odometría · paso 4 con cotas", () => {
  // el plano por defecto es el aula 8 × 6; la medición trae un rectángulo de 10 × 6
  const noPlan = measurement(3, {
    reference: null,
    result: result({ reference_perimeter_m: null, reference_area_m2: null }),
  });

  async function openResult() {
    mockApi({
      "GET /measurements": { items: [noPlan], total: 1, limit: 200, offset: 0 },
      "GET /measurements/3": noPlan,
    });
    render(<Odometry />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Aula 204 #3" }));
    await waitFor(() =>
      expect(document.querySelector(".odo-flow")?.getAttribute("data-step")).toBe("4"),
    );
  }

  it("dibuja los lados con su diferencia frente al plano, los ángulos y el resumen", async () => {
    const log = stubCanvas(700, 360);
    await openResult();
    await waitFor(() => expect(log.texts.some((t) => t.startsWith("Medido "))).toBe(true));
    expect(log.texts).toContain("Medido 31.50 m · 56.30 m²");
    expect(log.texts).toContain("Plano 28.00 m · 48.00 m²");
    expect(log.texts).toContain("10.00 m +2.00 m"); // lado AB medido 10 frente al plano 8
    expect(log.texts).toContain("6.00 m 0.00 m"); // lado BC igual al plano
    expect(log.texts).toContain("A 90°");
    expectClean(log);
  });

  it("a 360 px las etiquetas siguen dentro del lienzo y sin pisarse", async () => {
    const log = stubCanvas(300, 360);
    await openResult();
    await waitFor(() => expect(log.texts.length).toBeGreaterThan(8));
    expectClean(log);
  });

  it("la tabla de lados del resultado trae la diferencia por lado", async () => {
    stubCanvas(700, 360);
    await openResult();
    const table = await screen.findByRole("table", { name: "Lados del contorno medido" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1].textContent).toContain("AB");
    expect(rows[1].textContent).toContain("+2.00 m");
    expect(rows[2].textContent).toContain("0.00 m");
  });
});

describe("celular · resultado de una medición", () => {
  const DEVICE = "cel-621b8d99-aaaa";
  const CAL = {
    device_id: DEVICE,
    calibration: { ...measurement(1).calibration },
    ready: { steps: true, car: false, gps: true },
    records: {},
  };

  it("dibuja solo los lados (sin ángulos ni nombres de vértice)", async () => {
    const log = stubCanvas(300, 240);
    const m = measurement(3);
    mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": { items: [m], total: 1, limit: 200, offset: 0 },
      "GET /measurements/3": m,
    });
    render(
      <PhoneProvider initialDevice={DEVICE}>
        <PhoneApp />
      </PhoneProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
    const table = await screen.findByRole("table", { name: "Mis mediciones" });
    fireEvent.click(await within(table).findByText("Aula 204 #3"));
    await screen.findByRole("region", { name: "Resultado" });
    await waitFor(() => expect(log.texts).toContain("10.00 m"));
    expect(log.texts).toContain("6.00 m");
    expect(log.texts.some((t) => t.includes("°"))).toBe(false);
    expect(log.texts.some((t) => /^[A-D]\b/.test(t))).toBe(false);
    expectClean(log);
  });
});

describe("recorrido GPS real (473 vértices): el dibujo rotula solo las esquinas", () => {
  const real = realWalk();
  const gps = gpsMeasurement(real.CONTORNO, real.TRAZO, real.TRAZO_CRUDO);
  const sideLabels = (texts: string[]) =>
    texts.filter((t) => / m$/.test(t) && !t.startsWith("Per"));

  it.each([
    ["1440 px", 700],
    ["360 px", 300],
  ])("vista previa del DXF exportado (%s): 4 lados y 4 vértices, sin mancha", async (_n, width) => {
    const log = stubCanvas(width, 280);
    render(<Harness />);
    choose(file(measurementToDxf(gps), "Test-59.dxf"));
    await screen.findByLabelText("Contorno leído del archivo");
    await waitFor(() => expect(log.texts.some((t) => t.startsWith("Perímetro"))).toBe(true));
    expect(log.texts).toContain("Perímetro 273.99 m"); // el contorno completo, no el simplificado
    expect(sideLabels(log.texts)).toHaveLength(4);
    expect(log.texts.filter((t) => /^[A-Z]+ \d+(\.\d)?°$/.test(t))).toHaveLength(4);
    expect(log.rects.length).toBeLessThan(15);
    expectClean(log);
  });

  it("Odometría paso 4 con el recorrido GPS: lados y vértices de las esquinas, y su tabla", async () => {
    const log = stubCanvas(700, 360);
    mockApi({
      "GET /measurements": { items: [gps], total: 1, limit: 200, offset: 0 },
      "GET /measurements/59": gps,
    });
    render(<Odometry />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Test #59" }));
    await waitFor(() =>
      expect(document.querySelector(".odo-flow")?.getAttribute("data-step")).toBe("4"),
    );
    await waitFor(() => expect(log.texts.some((t) => t.startsWith("Medido "))).toBe(true));
    expect(log.rects.length).toBeLessThan(20);
    expectClean(log);
    const table = await screen.findByRole("table", { name: "Lados del contorno medido" });
    expect(within(table).getAllByRole("row").length).toBeLessThanOrEqual(9); // cabecera + ≤ 8 lados
  });

  it("celular, resultado: solo los 4 lados, sin ángulos", async () => {
    const log = stubCanvas(300, 240);
    const DEVICE = "cel-621b8d99-aaaa";
    mockApi({
      [`GET /calibrations/${DEVICE}`]: {
        device_id: DEVICE,
        calibration: { ...gps.calibration },
        ready: { steps: true, car: false, gps: true },
        records: {},
      },
      "GET /measurements": { items: [gps], total: 1, limit: 200, offset: 0 },
      "GET /measurements/59": gps,
    });
    render(
      <PhoneProvider initialDevice={DEVICE}>
        <PhoneApp />
      </PhoneProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
    const table = await screen.findByRole("table", { name: "Mis mediciones" });
    fireEvent.click(await within(table).findByText("Test #59"));
    await screen.findByRole("region", { name: "Resultado" });
    await waitFor(() => expect(sideLabels(log.texts).length).toBeGreaterThan(0));
    expect(sideLabels(log.texts)).toHaveLength(4);
    expect(log.texts.some((t) => t.includes("°"))).toBe(false);
    expectClean(log);
  });
});
