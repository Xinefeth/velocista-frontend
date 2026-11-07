// Importar un plano DXF como plano de referencia (F2 del spec «Exportar e importar DXF»): el
// componente muestra la vista previa y los motivos de rechazo sin enviar el archivo, y la vista
// Odometría usa el plano aceptado en «Qué vas a medir» y en el paso 4.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type DxfSource } from "@/domain/measurement/dxfParse";
import { ImportDxfPlan } from "@/ui/components/measurement/ImportDxfPlan";
import { Odometry } from "@/ui/pages/measurement/Odometry";
import { stubBrowser } from "../pages/_harness";
import { measurement, mockApi, result } from "./_api";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/fixtures/dxf", name), "utf8");
const file = (text: string, name = "plano.dxf") =>
  new File([text], name, { type: "application/dxf" });

beforeAll(() => {
  // jsdom no trae Blob.text() en todas sus versiones
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

/** Elige un archivo en el selector de la página. */
function choose(f: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [f] } });
}

function Harness({ onSource }: { onSource?: (s: DxfSource | null) => void }) {
  const [value, setValue] = useState<DxfSource | null>(null);
  return (
    <ImportDxfPlan
      value={value}
      onChange={(s) => {
        setValue(s);
        onSource?.(s);
      }}
    />
  );
}
const summary = () => screen.getByLabelText("Contorno leído del archivo").textContent!;

describe("ImportDxfPlan", () => {
  it("elegir un archivo válido muestra nombre, capa, vértices, perímetro, área y unidad", async () => {
    render(<Harness />);
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf"), "aula.dxf"));
    await screen.findByLabelText("Contorno leído del archivo");
    const text = summary();
    expect(text).toContain("aula.dxf");
    expect(text).toContain("PLANO");
    expect(text).toMatch(/Vértices4/);
    expect(text).toContain("28.00 m");
    expect(text).toContain("48.00 m²");
    expect(text).toContain("metros (del archivo)");
    expect(screen.getByRole("img", { name: "Vista previa del contorno del plano" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("Unidad del archivo")).toBeNull(); // la declara el archivo
  });

  it("las 4 LINE en milímetros se leen como un rectángulo de 8 × 6 m", async () => {
    render(<Harness />);
    choose(file(fixture("rect-8x6-lines-mm-r2010.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    expect(summary()).toContain("milímetros (del archivo)");
    expect(summary()).toContain("48.00 m²");
  });

  it("un archivo inválido muestra su motivo como alerta y no hay vista previa", async () => {
    render(<Harness />);
    choose(file("esto no es un dxf\nni parecido"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no es un DXF válido");
    expect(screen.queryByLabelText("Contorno leído del archivo")).toBeNull();
    expect(screen.queryByRole("img", { name: /Vista previa/ })).toBeNull();
  });

  it("cada rechazo llega a la pantalla: vacío, sin contorno cerrado y con auto-cruce", async () => {
    render(<Harness />);
    choose(file(""));
    expect((await screen.findByRole("alert")).textContent).toBe("El archivo está vacío.");
    const bowtie = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\n0\n70\n1\n10\n0\n20\n0\n10\n10\n20\n10\n10\n10\n20\n0\n10\n0\n20\n10\n0\nENDSEC\n0\nEOF\n`;
    choose(file(bowtie.replace("0\nENDSEC", "0\nENDSEC")));
    // sin unidad: se propone metros y se lee igual, así que el rechazo es el del contorno
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("se cruza consigo mismo"),
    );
  });

  it("un archivo de más de 5 MB se rechaza sin leer su contenido", async () => {
    render(<Harness />);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.dxf");
    const read = vi.spyOn(big, "text");
    choose(big);
    expect((await screen.findByRole("alert")).textContent).toContain("5 MB");
    expect(read).not.toHaveBeenCalled();
  });

  it("no envía el archivo a ningún servidor", async () => {
    const { fetchMock } = mockApi({});
    render(<Harness />);
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin unidad en el archivo pide la unidad (metros por defecto) y recalcula al cambiarla", async () => {
    render(<Harness />);
    choose(file(fixture("rect-8x6-polyline-r12.dxf")));
    const select = (await screen.findByLabelText("Unidad del archivo")) as HTMLSelectElement;
    expect(select.value).toBe("m");
    expect(summary()).toContain("48.00 m²");
    expect(summary()).toContain("metros (elegida por ti)");
    fireEvent.change(select, { target: { value: "cm" } });
    await waitFor(() => expect(summary()).toContain("centímetros (elegida por ti)"));
    expect(summary()).toContain("0.28 m");
  });

  it("con varios contornos los lista, propone el de mayor área y deja elegir otro", async () => {
    render(<Harness />);
    choose(file(fixture("export-terreno-en-L.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    const labels = radios.map((r) => r.closest("label")!.textContent!);
    expect(labels.some((l) => l.includes("PLANO_REF") && l.includes("(mayor área)"))).toBe(true);
    expect(
      (radios[labels.findIndex((l) => l.includes("PLANO_REF"))] as HTMLInputElement).checked,
    ).toBe(true);
    expect(summary()).toContain("100.00 m²");
    fireEvent.click(radios[labels.findIndex((l) => l.includes("CONTORNO"))]);
    await waitFor(() => expect(summary()).toContain("75.00 m²"));
    expect(summary()).toContain("CONTORNO");
  });

  it("lista lo que ignoró del archivo, sin molestar", async () => {
    render(<Harness />);
    choose(file(fixture("export-terreno-en-L.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    const note = screen.getByText(/Se ignoró:/).textContent!;
    expect(note).toContain("capa TRAZO ×1");
    expect(note).toContain("POINT");
  });

  it("«Quitar archivo» deja el selector vacío y avisa con null", async () => {
    const onSource = vi.fn();
    render(<Harness onSource={onSource} />);
    expect(screen.queryByRole("button", { name: "Quitar archivo" })).toBeNull();
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    fireEvent.click(screen.getByRole("button", { name: "Quitar archivo" }));
    expect(onSource).toHaveBeenLastCalledWith(null);
    expect(screen.queryByLabelText("Contorno leído del archivo")).toBeNull();
  });

  it("los controles tienen nombre accesible y el aviso de privacidad está enlazado", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Elegir archivo .dxf");
    const hint = document.getElementById(input.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toContain("no se envía a ningún servidor");
    expect(input.getAttribute("accept")).toContain(".dxf");
  });
});

describe("vista Odometría · plano desde archivo", () => {
  const DEVICE = "cel-621b8d99-aaaa";
  // sin plano propio ni comparación del servidor: el error se calcula con el plano de la consola
  const noPlan = measurement(3, {
    reference: null,
    result: result({
      reference_perimeter_m: null,
      reference_area_m2: null,
      perimeter_m: 31.5,
      area_m2: 56.3,
    }),
  });
  const PAGE = { items: [noPlan], total: 1, limit: 200, offset: 0 };
  const CAL = {
    device_id: DEVICE,
    calibration: { ...noPlan.calibration },
    ready: { steps: true, car: false, gps: true },
    records: {},
  };
  const pick = () =>
    fireEvent.change(screen.getByLabelText("Lugar o contorno"), { target: { value: "dxf" } });
  const kpis = () => screen.getByLabelText("Plano del lugar").textContent!;

  it("la lista tiene la opción nueva y las demás siguen igual", () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    const options = within(screen.getByLabelText("Lugar o contorno")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Aula · plano 8 × 6 m",
      "Patio en L · plano 12 × 10 m",
      "Cancha · plano 40 × 20 m",
      "Plano a escala (dibujo en papel)",
      "Plano desde archivo (.dxf)",
      "Otro (casa, calle, terreno…)",
    ]);
  });

  it("sin archivo elegido, «Siguiente: calibrar» da «Elige un archivo .dxf.» y no avanza", async () => {
    mockApi({ "GET /measurements": PAGE, [`GET /calibrations/${DEVICE}`]: CAL });
    render(<Odometry />);
    pick();
    expect(kpis()).toContain("—");
    fireEvent.click(screen.getByRole("button", { name: /Siguiente: calibrar/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Elige un archivo .dxf.");
    expect(document.querySelector(".odo-flow")?.getAttribute("data-step")).toBe("1");
  });

  it("al cargar un DXF, «Qué vas a medir» muestra el perímetro y el área del plano", async () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    pick();
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await waitFor(() => expect(kpis()).toContain("28.0"));
    expect(kpis()).toContain("48.0");
    expect(kpis()).not.toContain("—");
  });

  it("un archivo inválido deja el plano vacío y el avance bloqueado con el motivo del archivo", async () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    pick();
    choose(file("nada"));
    await screen.findByText(/no es un DXF válido/);
    expect(kpis()).toContain("—");
    fireEvent.click(screen.getByRole("button", { name: /Siguiente: calibrar/ }));
    expect(
      (await screen.findAllByRole("alert")).some((a) => a.textContent === "Elige un archivo .dxf."),
    ).toBe(true);
  });

  it("en el paso 4 el error de la medición se calcula frente al plano importado", async () => {
    mockApi({ "GET /measurements": PAGE, "GET /measurements/3": noPlan });
    render(<Odometry />);
    pick();
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await waitFor(() => expect(kpis()).toContain("28.0"));
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Aula 204 #3" }));
    await waitFor(() =>
      expect(document.querySelector(".odo-flow")?.getAttribute("data-step")).toBe("4"),
    );
    const medidas = screen.getByLabelText("Medidas del resultado").textContent!;
    expect(medidas).toContain("plano 28.0 m"); // perímetro del DXF
    expect(medidas).toContain("+12.5 %"); // (31.5 − 28) / 28
    expect(medidas).toContain("plano 48.0 m²");
    expect(medidas).toContain("+17.3 %"); // (56.3 − 48) / 48
  });

  it("quitar el archivo vuelve a dejar el plano vacío", async () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    pick();
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await waitFor(() => expect(kpis()).toContain("28.0"));
    fireEvent.click(screen.getByRole("button", { name: "Quitar archivo" }));
    await waitFor(() => expect(kpis()).toContain("—"));
  });

  it("las otras opciones de plano no cambian: aula sigue dando 28.0 m y 48.0 m²", () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    expect(kpis()).toContain("28.0");
    expect(kpis()).toContain("48.0");
    expect(screen.queryByLabelText("Elegir archivo .dxf")).toBeNull();
  });
});
