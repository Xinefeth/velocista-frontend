import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Rules } from "@/ui/pages/Rules";
import { Builder } from "@/ui/pages/Builder";
import { Control } from "@/ui/pages/Control";
import { Telemetry } from "@/ui/pages/Telemetry";
import { MapView } from "@/ui/pages/MapView";
import { stubBrowser, WithConsole } from "./_harness";

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = (page: React.ReactElement) => render(<WithConsole>{page}</WithConsole>);

describe("Rules page (HU-10)", () => {
  it("lists the competition profiles and the club profile", () => {
    show(<Rules />);
    expect(screen.getByRole("heading", { name: "Perfiles" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Amateur/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Senior/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Master/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pruebas del club/ })).toBeTruthy();
  });

  it("shows the rules table and compliance of each robot", () => {
    show(<Rules />);
    expect(screen.getByRole("heading", { name: /Reglas por categoría/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cumplimiento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Velocista 001/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Qué bloquea en la consola/ })).toBeTruthy();
  });

  it("changing the selected profile keeps the page working", () => {
    show(<Rules />);
    fireEvent.click(screen.getByRole("button", { name: /Master/ }));
    expect(screen.getByRole("heading", { name: /Reglas por categoría/ })).toBeTruthy();
  });
});

describe("Builder page (HU-06..HU-09)", () => {
  it("lists the robots with the Spanish label of their current version", () => {
    show(<Builder />);
    expect(screen.getByRole("heading", { name: "Robots" })).toBeTruthy();
    expect(screen.getAllByText(/Velocista 001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Actual").length).toBeGreaterThan(0);
    expect(screen.queryByText("current")).toBeNull();
  });

  it("shows the parts table with required/optional slots", () => {
    show(<Builder />);
    expect(screen.getAllByText("obligatorio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("opcional").length).toBeGreaterThan(0);
  });

  it("offers compatibility, regulation and manifest tools", () => {
    show(<Builder />);
    expect(screen.getByRole("heading", { name: "Compatibilidad" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reglamento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver manifiesto esperado/ })).toBeTruthy();
  });

  it("selecting another robot changes the detail heading", () => {
    show(<Builder />);
    fireEvent.click(screen.getByRole("button", { name: /MiniSumo RC/ }));
    expect(screen.getByRole("heading", { name: "MiniSumo RC" })).toBeTruthy();
  });
});

describe("Control page (HU-16..HU-18)", () => {
  it("asks to calibrate before starting", () => {
    show(<Control />);
    expect(screen.getByText(/Calibra los sensores antes de arrancar/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Calibrar/ })).toBeTruthy();
  });

  it("offers test/competition mode and black/white line", () => {
    show(<Control />);
    expect(screen.getByRole("button", { name: "Prueba" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Competencia" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Negra" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Blanca" })).toBeTruthy();
  });

  it("shows the PID setup with presets", () => {
    show(<Control />);
    expect(screen.getByRole("heading", { name: /Setup PID/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Base" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Agresivo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Seguro" })).toBeTruthy();
  });

  it("explains the competition mode lock", () => {
    show(<Control />);
    expect(screen.getByText(/mientras corre solo responde a Detener/)).toBeTruthy();
  });
});

describe("Telemetry page (HU-21, HU-25)", () => {
  it("shows empty states until a lap is completed", () => {
    show(<Telemetry />);
    expect(screen.getByText(/Aún no hay una vuelta completa/)).toBeTruthy();
    expect(screen.getByText(/Completa una vuelta para ver sus tramos/)).toBeTruthy();
  });

  it("lists the signal channels", () => {
    show(<Telemetry />);
    expect(screen.getByRole("button", { name: "Error" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PWM izquierdo" })).toBeTruthy();
  });
});

describe("Map page (HU-30)", () => {
  it("explains how the map is built from the first lap", () => {
    show(<MapView />);
    expect(screen.getByText(/Esperando vuelta/)).toBeTruthy();
    expect(screen.getByText(/Arranca el robot desde la meta/)).toBeTruthy();
    expect(within(document.body).getByRole("button", { name: /Ir al tablero/ })).toBeTruthy();
  });
});
