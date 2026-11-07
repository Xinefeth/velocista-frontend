// Botón «Exportar DXF» (F1 del spec «Exportar e importar DXF»): aparece solo con resultado, descarga el
// archivo con el nombre esperado y no hace ninguna petición al servidor.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PhoneApp } from "@/celular/PhoneApp";
import { PhoneProvider } from "@/celular/context";
import { ExportDxfButton } from "@/ui/components/measurement/ExportDxfButton";
import { Odometry } from "@/ui/pages/measurement/Odometry";
import { stubBrowser } from "../pages/_harness";
import { measurement, mockApi } from "./_api";

const DEVICE = "cel-621b8d99-aaaa";
const CAL = {
  device_id: DEVICE,
  calibration: { ...measurement(1).calibration },
  ready: { steps: true, car: false, gps: true },
  records: {},
};
const PAGE = (items: ReturnType<typeof measurement>[]) => ({
  items,
  total: items.length,
  limit: 200,
  offset: 0,
});

/** Captura lo que se descarga: nombre del enlace, tipo y texto del Blob. */
function captureDownloads() {
  const files: { name: string; type: string; blob: Blob }[] = [];
  let lastBlob: Blob | null = null;
  URL.createObjectURL = vi.fn((b: Blob) => ((lastBlob = b), "blob:test"));
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    files.push({ name: this.download, type: lastBlob?.type ?? "", blob: lastBlob! });
  });
  return files;
}
const readBlob = (b: Blob) =>
  new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.readAsText(b);
  });

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ExportDxfButton", () => {
  it("aparece solo si la medición tiene resultado", () => {
    const { unmount } = render(<ExportDxfButton measurement={measurement(3)} />);
    expect(screen.getByRole("button", { name: /Exportar DXF/ })).toBeTruthy();
    unmount();
    render(<ExportDxfButton measurement={measurement(4, { status: "recording", result: null })} />);
    expect(screen.queryByRole("button", { name: /Exportar DXF/ })).toBeNull();
    expect(document.querySelector(".exportdxf")).toBeNull();
  });

  it("descarga un .dxf con el nombre <lugar>-<id>-<fecha> y avisa con texto", async () => {
    const files = captureDownloads();
    render(<ExportDxfButton measurement={measurement(3, { place_name: "Aula 204 ñ" })} />);
    fireEvent.click(screen.getByRole("button", { name: /Exportar DXF/ }));
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("Aula_204_n-3-2026-11-03.dxf");
    expect(files[0].type).toBe("application/dxf");
    const text = await readBlob(files[0].blob);
    expect(text.startsWith("  0\r\nSECTION\r\n  2\r\nHEADER")).toBe(true);
    expect(text).toContain("$INSUNITS");
    expect(text.trimEnd().endsWith("EOF")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      "Plano descargado: Aula_204_n-3-2026-11-03.dxf",
    );
  });

  it("no hace ninguna petición al servidor", () => {
    const { fetchMock } = mockApi({});
    captureDownloads();
    render(<ExportDxfButton measurement={measurement(3)} />);
    fireEvent.click(screen.getByRole("button", { name: /Exportar DXF/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tiene nombre accesible, una descripción enlazada y no depende del color", () => {
    render(<ExportDxfButton measurement={measurement(3)} />);
    const btn = screen.getByRole("button", { name: "Exportar DXF" });
    const hint = document.getElementById(btn.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toContain("metros");
    expect(btn.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("si falla la generación muestra el aviso en español en vez de romper la pantalla", () => {
    captureDownloads();
    const bad = measurement(3);
    // un polígono con un valor que no es número hace fallar al escritor
    bad.result!.polygon = null as unknown as typeof bad.result.polygon;
    render(<ExportDxfButton measurement={bad} />);
    fireEvent.click(screen.getByRole("button", { name: /Exportar DXF/ }));
    expect(screen.getByRole("status").textContent).toContain("No se pudo generar el plano DXF");
  });
});

describe("en las pantallas de la medición", () => {
  it("celular: el resultado de una medición terminada ofrece «Exportar DXF» y descarga", async () => {
    const files = captureDownloads();
    const { fetchMock } = mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": PAGE([
        measurement(3),
        measurement(4, { status: "recording", result: null }),
      ]),
      "GET /measurements/3": measurement(3),
    });
    render(
      <PhoneProvider initialDevice={DEVICE}>
        <PhoneApp />
      </PhoneProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
    const table = await screen.findByRole("table", { name: "Mis mediciones" });
    // sin abrir ninguna medición no hay resultado ni botón
    expect(screen.queryByRole("button", { name: /Exportar DXF/ })).toBeNull();
    fireEvent.click(await within(table).findByText("Aula 204 #3"));
    const btn = await screen.findByRole("button", { name: /Exportar DXF/ });
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(btn);
    expect(files.map((f) => f.name)).toEqual(["Aula_204-3-2026-11-03.dxf"]);
    expect(fetchMock.mock.calls.length).toBe(calls); // descargar no pide nada
  });

  it("celular: una medición sin terminar no ofrece el botón", async () => {
    captureDownloads();
    mockApi({
      [`GET /calibrations/${DEVICE}`]: CAL,
      "GET /measurements": PAGE([measurement(4, { status: "recording", result: null })]),
    });
    render(
      <PhoneProvider initialDevice={DEVICE}>
        <PhoneApp />
      </PhoneProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "3. Medir" }));
    const table = await screen.findByRole("table", { name: "Mis mediciones" });
    fireEvent.click(await within(table).findByText("Aula 204 #4"));
    expect(screen.queryByRole("button", { name: /Exportar DXF/ })).toBeNull();
  });

  it("consola (Odometría, paso 4): el resultado ofrece «Exportar DXF»; sin medición elegida, no", async () => {
    const files = captureDownloads();
    mockApi({
      "GET /measurements": PAGE([measurement(3)]),
      "GET /measurements/3": measurement(3),
    });
    render(<Odometry />);
    expect(screen.queryByRole("button", { name: /Exportar DXF/ })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Aula 204 #3" }));
    const btn = await screen.findByRole("button", { name: /Exportar DXF/ });
    await waitFor(() => expect(btn.isConnected).toBe(true));
    fireEvent.click(btn);
    expect(files.map((f) => f.name)).toEqual(["Aula_204-3-2026-11-03.dxf"]);
  });
});
