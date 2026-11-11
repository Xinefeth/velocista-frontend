// Pulido del DXF: el aviso «Elige un archivo .dxf.» desaparece al cargar un plano válido, el botón de
// elegir archivo usa el estilo de los botones de la consola y «Comparar con el plano» de Áreas y planos
// acepta un plano .dxf.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Areas, PRESETS } from "@/ui/pages/measurement/Areas";
import { Odometry } from "@/ui/pages/measurement/Odometry";
import type { PolygonApi } from "@/infrastructure/contracts/measurements";
import { stubBrowser } from "../pages/_harness";
import { measurement, mockApi } from "./_api";

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
  vi.unstubAllGlobals();
});

function choose(f: File) {
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
    target: { files: [f] },
  });
}

describe("Odometría: el aviso «Elige un archivo .dxf.»", () => {
  const PAGE = { items: [measurement(3)], total: 1, limit: 200, offset: 0 };
  const pick = () =>
    fireEvent.change(screen.getByLabelText("Lugar o contorno"), { target: { value: "dxf" } });
  const next = () => fireEvent.click(screen.getByRole("button", { name: /Siguiente: calibrar/ }));

  it("aparece al avanzar sin archivo y desaparece al cargar un DXF válido", async () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    pick();
    next();
    expect((await screen.findByRole("alert")).textContent).toBe("Elige un archivo .dxf.");
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    await waitFor(() => expect(screen.queryByText("Elige un archivo .dxf.")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("también desaparece si se cambia a otro lugar sin cargar archivo", async () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    pick();
    next();
    await screen.findByText("Elige un archivo .dxf.");
    fireEvent.change(screen.getByLabelText("Lugar o contorno"), { target: { value: "aula" } });
    await waitFor(() => expect(screen.queryByText("Elige un archivo .dxf.")).toBeNull());
  });

  it("un archivo inválido no borra el aviso y muestra además su propio motivo", async () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    pick();
    next();
    await screen.findByText("Elige un archivo .dxf.");
    choose(file("esto no es un dxf"));
    await screen.findByText(/no es un DXF válido/);
    expect(screen.getByText("Elige un archivo .dxf.")).toBeTruthy();
  });

  it("al quitar el archivo y volver a avanzar, el aviso vuelve", async () => {
    mockApi({ "GET /measurements": PAGE });
    render(<Odometry />);
    pick();
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await screen.findByLabelText("Contorno leído del archivo");
    fireEvent.click(screen.getByRole("button", { name: "Quitar archivo" }));
    next();
    expect((await screen.findByRole("alert")).textContent).toBe("Elige un archivo .dxf.");
  });
});

describe("estilo del botón de elegir archivo", () => {
  const css = readFileSync(join(process.cwd(), "src/ui/styles/measurement.css"), "utf8");
  const rules = [...css.matchAll(/(\.importdxf[^{]*::file-selector-button[^{]*)\{([^}]*)\}/g)];

  it("hay una regla para el botón nativo con la forma de los botones de la consola", () => {
    expect(rules.length).toBeGreaterThanOrEqual(1);
    const body = rules.map((r) => r[2]).join("\n");
    for (const prop of [
      "border-radius: 9px",
      "border: 1px solid var(--line2)",
      "background: var(--panel3)",
      "color: var(--ink)",
    ])
      expect(body).toContain(prop);
  });

  it("usa solo tokens de la paleta: sin colores sueltos ni --dim", () => {
    const all = css.slice(css.indexOf(".importdxf"));
    expect(all).not.toContain("--dim");
    expect(all).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(all).not.toMatch(/rgba?\(/i);
  });

  it("el selector de archivo conserva su nombre accesible", () => {
    mockApi({ "GET /measurements": { items: [], total: 0, limit: 200, offset: 0 } });
    render(<Odometry />);
    fireEvent.change(screen.getByLabelText("Lugar o contorno"), { target: { value: "dxf" } });
    expect(screen.getByLabelText("Elegir archivo .dxf").className).toContain("inp");
    expect(document.querySelector(".importdxf")).toBeTruthy();
  });
});

describe("Áreas y planos · Comparar con el plano con un archivo .dxf", () => {
  const shape: PolygonApi = {
    points: PRESETS.L.points,
    sides_m: [12, 3, 9, 7, 3, 10],
    angles_deg: [90, 90, 90, 270, 90, 90],
    perimeter_m: 44,
    area_m2: 57,
    concave: true,
    self_crossing: false,
    closure_error_m: 0,
    angle_sum_error_deg: 0,
    closes: true,
    computed_sides: [],
    computed_angles: [],
    warnings: [],
  };
  const open = async () => {
    mockApi({ "POST /polygons/from-points": shape });
    render(<Areas />);
    await screen.findByText("57.00");
  };
  const card = () =>
    screen.getByRole("heading", { name: "Comparar con el plano" }).closest(".card")!;

  it("por defecto sigue comparando con el rectángulo de 8 × 6 m", async () => {
    await open();
    const table = screen.getByRole("table", { name: "Plano frente a figura" });
    expect(table.textContent).toContain("28.00 m");
    expect(table.textContent).toContain("48.00 m²");
    expect(screen.queryByLabelText("Elegir archivo .dxf")).toBeNull();
  });

  it("la tabla tiene sus 4 cabeceras accesibles y es compacta (sin el ancho mínimo de 820 px)", async () => {
    await open();
    const check = () => {
      const table = screen.getByRole("table", { name: "Plano frente a figura" });
      const heads = within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent);
      expect(heads).toEqual(["Dato", "Plano", "Figura", "Diferencia"]);
      expect(table.classList.contains("compact")).toBe(true);
    };
    check(); // el rectángulo por defecto
    fireEvent.change(screen.getByLabelText("Fuente del plano"), { target: { value: "dxf" } });
    choose(file(fixture("rect-8x6-lwpolyline-m-r2000.dxf")));
    await screen.findByRole("table", { name: "Plano frente a figura" });
    check(); // el plano desde archivo
    // la regla compacta quita el min-width de table.t y no usa --dim ni colores sueltos
    const css = readFileSync(join(process.cwd(), "src/ui/styles/measurement.css"), "utf8");
    const block = css.slice(css.indexOf("table.t.compact"));
    expect(block).toMatch(/min-width:\s*0/);
    expect(block).not.toContain("--dim");
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("al elegir «Archivo .dxf» pide el archivo y no muestra la tabla hasta tenerlo", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Fuente del plano"), { target: { value: "dxf" } });
    expect(screen.getByLabelText("Elegir archivo .dxf")).toBeTruthy();
    expect(within(card() as HTMLElement).getByText("Elige un archivo .dxf.")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Plano frente a figura" })).toBeNull();
    expect(screen.getByText("Plano DXF")).toBeTruthy();
  });

  it("con un DXF cargado compara su perímetro y área con la figura", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Fuente del plano"), { target: { value: "dxf" } });
    choose(file(fixture("rect-8x6-lines-mm-r2010.dxf"), "aula.dxf")); // 8 × 6 m en milímetros
    const table = await screen.findByRole("table", { name: "Plano frente a figura" });
    expect(table.textContent).toContain("28.00 m");
    expect(table.textContent).toContain("48.00 m²");
    expect(table.textContent).toContain("44.00 m"); // la figura
    expect(table.textContent).toContain("+18.8 %"); // área 57 frente a 48
    expect(within(card() as HTMLElement).queryByText("Elige un archivo .dxf.")).toBeNull();
  });

  it("el Terreno en L exportado se compara con su CONTORNO (75 m²)", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Fuente del plano"), { target: { value: "dxf" } });
    choose(file(fixture("export-terreno-en-L.dxf")));
    const table = await screen.findByRole("table", { name: "Plano frente a figura" });
    expect(table.textContent).toContain("75.00 m²");
    expect(table.textContent).toContain("40.00 m");
  });

  it("un archivo inválido muestra su motivo y no la tabla", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Fuente del plano"), { target: { value: "dxf" } });
    choose(file("nada"));
    await screen.findByText(/no es un DXF válido/);
    expect(screen.queryByRole("table", { name: "Plano frente a figura" })).toBeNull();
  });

  it("volver al rectángulo restablece la comparación con largo, ancho y escala", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Fuente del plano"), { target: { value: "dxf" } });
    fireEvent.change(screen.getByLabelText("Fuente del plano"), { target: { value: "rect" } });
    expect(screen.getByRole("table", { name: "Plano frente a figura" }).textContent).toContain(
      "48.00 m²",
    );
    expect(screen.getByLabelText("Largo del plano")).toBeTruthy();
  });
});

describe("tablas de medición: sin columnas tapadas por el ancho mínimo de 820 px", () => {
  const root = process.cwd();
  const SOURCES = [
    "src/ui/pages/measurement/Odometry.tsx",
    "src/ui/pages/measurement/Areas.tsx",
    "src/ui/components/measurement/GpsTrials.tsx",
    "src/ui/components/measurement/PrecisionModel.tsx",
    "src/ui/components/measurement/TrackComparison.tsx",
    "src/ui/components/measurement/SidesTable.tsx",
    "src/celular/tabs/Measure.tsx",
    "src/celular/tabs/GpsError.tsx",
    "src/celular/tabs/Model.tsx",
  ];

  it("ninguna tabla de las vistas de medición ni del celular usa `table.t` sin la clase compact", () => {
    for (const f of SOURCES) {
      const code = readFileSync(join(root, f), "utf8");
      expect(code, f).not.toMatch(/<table className="t"[ >]/);
      expect(code.match(/<table /g)?.length ?? 0, f).toBeGreaterThan(0);
    }
  });

  it("el celular también tiene la regla compacta, con tokens y sin --dim ni colores sueltos", () => {
    const css = readFileSync(join(root, "src/celular/phone.css"), "utf8");
    const block = css.slice(css.indexOf("table.t.compact"), css.indexOf("#histBody"));
    expect(block).toContain("padding");
    expect(block).not.toContain("--dim");
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("Odometría: «Mediciones guardadas» muestra todas sus cabeceras", async () => {
    mockApi({ "GET /measurements": { items: [measurement(3)], total: 1, limit: 200, offset: 0 } });
    render(<Odometry />);
    const table = await screen.findByRole("table", { name: "Mediciones guardadas" });
    expect(table.classList.contains("compact")).toBe(true);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "#",
      "Fuente",
      "Lugar",
      "Calibrado",
      "Perímetro",
      "Área",
      "Cierre",
      "Error vs plano",
      "Corrección",
      "Calidad",
    ]);
  });

  it("Áreas: «Datos conocidos» muestra Lado y Ángulo interior", async () => {
    mockApi({
      "POST /polygons/from-points": {
        points: [],
        sides_m: [],
        angles_deg: [],
        perimeter_m: 0,
        area_m2: 0,
        concave: false,
        self_crossing: false,
        closure_error_m: 0,
        angle_sum_error_deg: 0,
        closes: true,
        computed_sides: [],
        computed_angles: [],
        warnings: [],
      },
    });
    render(<Areas />);
    fireEvent.click(screen.getByRole("button", { name: "Lados y ángulos" }));
    const table = screen.getByRole("table", { name: "Datos conocidos" });
    expect(table.classList.contains("compact")).toBe(true);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["#", "Lado (m)", "Ángulo interior (°)"]);
  });
});
