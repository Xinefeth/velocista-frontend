// Recorrido guiado por plano: elegir el plano (.dxf a 1:100) y la esquina de inicio, el plano guía durante
// el recorrido (hitos y esquina interior) y el contorno medido sobre el plano al terminar.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GuidedPlanPicker } from "@/celular/GuidedPlanPicker";
import { GuidedLive } from "@/celular/GuidedLive";
import { measurementBody } from "@/celular/tabs/Measure";
import { GuidedResult } from "@/ui/components/measurement/GuidedResult";
import { EMPTY_GUIDE, guidePlanOf, type GuideSetup } from "@/domain/measurement/guidedSetup";
import type { GuidedPlan } from "@/domain/measurement/guidedPlan";
import { stubBrowser } from "../pages/_harness";
import { measurement, mockApi, result } from "./_api";
import { Odometry } from "@/ui/pages/measurement/Odometry";
import { stubCanvas } from "./_canvas";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/fixtures/dxf", name), "utf8");
const file = (text: string, name = "L.dxf") => new File([text], name);

// L real: 12 × 4 en la base y 4 × 6 hacia arriba; la esquina interior es D = (4, 4)
const L = [
  { x: 0, y: 0 },
  { x: 12, y: 0 },
  { x: 12, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 10 },
  { x: 0, y: 10 },
];
const PLAN: GuidedPlan = { name: "L", points: L, scaleN: 100, startIndex: 0, direction: "ccw" };
const rot = (p: { x: number; y: number }, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
};
const FORM = {
  method: "steps" as const,
  place: "Patio",
  hasRef: false,
  length: "",
  width: "",
  tape: "",
  scaleN: "1",
};

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

function Harness({ onSetup }: { onSetup?: (g: GuideSetup) => void }) {
  const [g, setG] = useState<GuideSetup>(EMPTY_GUIDE);
  onSetup?.(g);
  return <GuidedPlanPicker value={g} onChange={setG} />;
}
const chooseDxf = (text: string) =>
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
    target: { files: [file(text)] },
  });
const pickSource = () =>
  fireEvent.change(screen.getByLabelText("Plano para guiar el recorrido"), {
    target: { value: "dxf" },
  });

describe("celular · elegir el plano guía", () => {
  it("un .dxf a 1:100 muestra la conversión, los vértices y el inicio con su sentido", async () => {
    let last = EMPTY_GUIDE;
    render(<Harness onSetup={(g) => (last = g)} />);
    pickSource();
    chooseDxf(fixture("L-12x4-4x6-1a100-mm.dxf"));
    await screen.findByLabelText("Contorno leído del archivo");
    fireEvent.change(screen.getByLabelText(/Escala del dibujo 1:N/), { target: { value: "100" } });
    expect((await screen.findAllByText(/10 m en el terreno = 10[.,]0 cm en el plano/)).length).toBe(
      1,
    );
    const start = screen.getByRole("group", { name: "Esquina de inicio" });
    expect(
      within(start)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(screen.getByText(/Empiezas en A y caminas hacia B/)).toBeTruthy();
    fireEvent.click(within(start).getByRole("button", { name: "D" }));
    expect(screen.getByText(/Empiezas en D y caminas hacia E/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Horario" }));
    expect(screen.getByText(/Empiezas en D y caminas hacia C/)).toBeTruthy();
    const plan = guidePlanOf(last) as GuidedPlan;
    expect(plan.points[1]).toEqual({ x: 12, y: 0 }); // 120 mm × 100 = 12 m
    expect(plan.startIndex).toBe(3);
    expect(plan.direction).toBe("cw");
  });

  it("un archivo inválido no rompe la pantalla y no deja empezar con ese plano", async () => {
    let last = EMPTY_GUIDE;
    render(<Harness onSetup={(g) => (last = g)} />);
    pickSource();
    chooseDxf("esto no es un dxf");
    await screen.findByText(/no es un DXF válido/);
    expect(screen.queryByRole("group", { name: "Esquina de inicio" })).toBeNull();
    expect(typeof guidePlanOf(last)).toBe("string");
  });

  it("escala inválida: lo dice y no hay plano", async () => {
    let last = EMPTY_GUIDE;
    render(<Harness onSetup={(g) => (last = g)} />);
    pickSource();
    chooseDxf(fixture("L-12x4-4x6-1a100-mm.dxf"));
    await screen.findByLabelText("Contorno leído del archivo");
    fireEvent.change(screen.getByLabelText(/Escala del dibujo 1:N/), { target: { value: "0" } });
    await waitFor(() =>
      expect(guidePlanOf(last)).toBe("La escala 1:N debe ser un número mayor que 0."),
    );
  });
});

describe("cuerpo de la medición guiada", () => {
  it("manda el plano a tamaño real con el inicio y el sentido", () => {
    const body = measurementBody(FORM, "cel-1", { ...PLAN, startIndex: 2, direction: "cw" });
    expect(typeof body).toBe("object");
    const ref = (body as { reference: Record<string, unknown> }).reference;
    expect(ref).toMatchObject({ scale_n: 1, name: "L", start_index: 2, direction: "cw" });
    expect((ref.points as unknown[]).length).toBe(6);
  });
  it("sin plano guía queda como antes", () => {
    expect(measurementBody(FORM, "cel-1")).not.toHaveProperty("reference");
  });
});

describe("celular · durante el recorrido", () => {
  // el celular camina en su propio marco (girado 37°); el plano no se mueve
  const walk = (pts: { x: number; y: number }[]) => pts.map((p) => rot(p, 37));

  it("a 1:100 muestra la conversión de escala y la distancia recorrida en el plano", () => {
    stubCanvas(320, 250);
    const path = walk([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ]);
    render(<GuidedLive plan={PLAN} path={path} marks={[]} walked={6} />);
    expect(screen.getByText(/10 m en el terreno = 10[.,]0 cm en el plano/)).toBeTruthy();
    expect(screen.getByText(/6[.,]0 m recorridos = 6[.,]0 cm en el plano \(1:100\)/)).toBeTruthy();
    expect(screen.getByText(/Siguiente esquina: B \(1 de 5\)/)).toBeTruthy();
  });

  it("antes de moverse no inventa una alineación", () => {
    stubCanvas(320, 250);
    render(<GuidedLive plan={PLAN} path={[{ x: 0, y: 0 }]} marks={[]} walked={0} />);
    expect(screen.getByText(/Empieza a caminar/)).toBeTruthy();
  });

  it("cada esquina marcada es un hito numerado y avisa de la esquina interior que sigue", () => {
    const log = stubCanvas(320, 250);
    // marcadas B (12, 0) y C (12, 4): sigue D, la interior
    const path = walk([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 4 },
    ]);
    render(<GuidedLive plan={PLAN} path={path} marks={[path[1], path[2]]} walked={16} />);
    const next = screen.getByText(/Siguiente esquina: D \(3 de 5\)/);
    expect(next.textContent).toMatch(/esquina interior \(D\): márcala/);
    expect(log.texts).toEqual(expect.arrayContaining(["1", "2", "A", "B", "C", "D", "E", "F"]));
    expect(log.texts).not.toContain("3");
  });

  it("con todas marcadas dice que vuelva al inicio", () => {
    stubCanvas(320, 250);
    const pts = walk(L);
    render(<GuidedLive plan={PLAN} path={pts} marks={pts.slice(1)} walked={44} />);
    expect(screen.getByText(/vuelve al inicio y termina/)).toBeTruthy();
  });
});

describe("contorno medido sobre el plano (resultado)", () => {
  const withPolygon = (poly: { x: number; y: number }[]) =>
    measurement(5, {
      reference: { points: L, scale_n: 1, name: "L", start_index: 0, direction: "ccw" },
      result: result({ polygon: poly, corrected_path: poly, perimeter_m: 46.2, area_m2: 75.6 }),
    });
  // medido: el mismo contorno 5 % más grande y girado (el celular camina en su marco)
  const measured = L.map((p) => rot({ x: p.x * 1.05, y: p.y * 1.05 }, -60));

  it("dibuja plano y contorno con leyenda y el error en % frente al plano", () => {
    const log = stubCanvas(320, 280);
    render(<GuidedResult m={withPolygon(measured)} />);
    const legend = screen.getByRole("list", { name: "Leyenda del gráfico" });
    expect(legend.textContent).toMatch(/Plano/);
    expect(legend.textContent).toMatch(/Contorno medido/);
    expect(legend.textContent).toMatch(/Esquina marcada/);
    expect(legend.textContent).toMatch(/Esquina interior/);
    const stats = screen.getByLabelText("Medido frente al plano").textContent!;
    expect(stats).toMatch(/46[.,]2 m \/ 44[.,]0 m/);
    expect(stats).toMatch(/\+5[.,]0 %/);
    expect(stats).toMatch(/75[.,]6 m² \/ 72[.,]0 m²/);
    expect(log.texts).toEqual(expect.arrayContaining(["1", "2", "3", "4", "5"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si falta la esquina interior (D) avisa cuál es", () => {
    stubCanvas(320, 280);
    render(<GuidedResult m={withPolygon(measured.filter((_, i) => i !== 3))} />);
    const alert = screen.getByRole("alert").textContent!;
    expect(alert).toMatch(/esquina interior \(D\)/);
    expect(alert).toMatch(/sin marcar \(D\)/);
  });

  it("sin inicio y sentido (recorrido no guiado) no muestra el gráfico", () => {
    stubCanvas(320, 280);
    const m = withPolygon(measured);
    delete m.reference!.start_index;
    delete m.reference!.direction;
    const { container } = render(<GuidedResult m={m} />);
    expect(container.textContent).toBe("");
  });

  it("con inicio y sentido de la sesión también lo dibuja", () => {
    stubCanvas(320, 280);
    const m = withPolygon(measured);
    delete m.reference!.start_index;
    delete m.reference!.direction;
    render(<GuidedResult m={m} saved={{ startIndex: 0, direction: "ccw" }} />);
    expect(screen.getByLabelText("Medido frente al plano")).toBeTruthy();
  });
});

describe("consola · Odometría paso 4 con un recorrido guiado", () => {
  const open = async (extra: Record<string, unknown>) => {
    stubCanvas(700, 300);
    const poly = L.map((p) => rot({ x: p.x * 1.05, y: p.y * 1.05 }, -60));
    const m = measurement(3, {
      reference: { points: L, scale_n: 1, name: "L", ...extra },
      result: result({ polygon: poly, corrected_path: poly, raw_path: poly }),
    });
    mockApi({
      "GET /measurements": { items: [m], total: 1, limit: 200, offset: 0 },
      "GET /measurements/3": m,
    });
    render(<Odometry />);
    fireEvent.click(await screen.findByRole("button", { name: /^Abrir .* #3$/ }));
    await waitFor(() =>
      expect(document.querySelector(".odo-flow")?.getAttribute("data-step")).toBe("4"),
    );
  };

  it("muestra el contorno medido sobre el plano con su leyenda", async () => {
    await open({ start_index: 0, direction: "ccw" });
    expect(screen.getByLabelText("Medido frente al plano")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Leyenda del gráfico" })).toBeTruthy();
  });

  it("un recorrido sin plano guía no cambia: no hay gráfico guiado", async () => {
    await open({});
    expect(screen.queryByLabelText("Medido frente al plano")).toBeNull();
  });
});
