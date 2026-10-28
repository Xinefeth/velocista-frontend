import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Rail } from "@/ui/components/Rail";
import { BottomNav } from "@/ui/components/BottomNav";
import { stubBrowser, WithConsole } from "../pages/_harness";

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("entrada «Trazador de pistas» en la navegación", () => {
  it("el Rail la lista en Gestión, después de Perfiles de reglamento", () => {
    render(
      <WithConsole>
        <Rail />
      </WithConsole>,
    );
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    const labels = [...nav.querySelectorAll("button.nb")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Control",
      "Telemetría",
      "Corridas y optimización",
      "Mapa de pista",
      "Catálogo de componentes",
      "Armador de robots",
      "Perfiles de reglamento",
      "Trazador de pistas",
    ]);
    expect(labels.indexOf("Trazador de pistas")).toBe(labels.indexOf("Perfiles de reglamento") + 1);
  });

  it("al pulsarla queda como la sección activa", () => {
    render(
      <WithConsole>
        <Rail />
      </WithConsole>,
    );
    const button = screen.getByRole("button", { name: "Trazador de pistas" });
    expect(button.getAttribute("aria-current")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Trazador de pistas" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Control" }).getAttribute("aria-current")).toBeNull();
  });

  it("la navegación inferior (móvil) también la ofrece", () => {
    render(
      <WithConsole>
        <BottomNav />
      </WithConsole>,
    );
    const button = screen.getByRole("button", { name: "Pistas" });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Pistas" }).getAttribute("aria-current")).toBe("page");
  });
});
