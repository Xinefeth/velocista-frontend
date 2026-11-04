import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Rail } from "@/ui/components/Rail";
import { BottomNav } from "@/ui/components/BottomNav";
import App from "@/app/App";
import { stubBrowser, WithConsole } from "../pages/_harness";

beforeEach(() => {
  stubBrowser();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("grupo Medición en la navegación", () => {
  it("el riel muestra el grupo entre Robot y Gestión", () => {
    render(
      <WithConsole>
        <Rail />
      </WithConsole>,
    );
    const groups = [...document.querySelectorAll(".rail .gl")].map((g) => g.textContent);
    expect(groups).toEqual(["Robot", "Medición", "Gestión"]);
  });

  it.each(["Odometría · Medir terreno", "Áreas y planos", "Precisión del GPS"])(
    "al pulsar «%s» la consola muestra su vista",
    (name) => {
      render(
        <WithConsole>
          <App />
        </WithConsole>,
      );
      fireEvent.click(screen.getAllByRole("button", { name })[0]);
      expect(screen.getByRole("region", { name })).toBeTruthy();
      expect(screen.getAllByRole("button", { name })[0].getAttribute("aria-current")).toBe("page");
    },
  );

  it("la navegación inferior (móvil) también tiene las tres", () => {
    render(
      <WithConsole>
        <BottomNav />
      </WithConsole>,
    );
    for (const name of ["Odometría", "Áreas", "GPS"])
      expect(screen.getByRole("button", { name })).toBeTruthy();
  });
});
