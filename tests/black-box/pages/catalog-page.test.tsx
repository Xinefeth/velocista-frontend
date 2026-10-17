import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Catalog } from "@/ui/pages/Catalog";
import { CAT } from "@/shared/data/catalog";
import { stubBrowser, WithConsole } from "./_harness";

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = () =>
  render(
    <WithConsole>
      <Catalog />
    </WithConsole>,
  );

describe("Catalog page (HU-01..HU-05)", () => {
  it("lists every catalog component in a table", () => {
    open();
    const table = screen.getByRole("table", { name: "Componentes del catálogo" });
    expect(within(table).getAllByRole("row").length).toBe(CAT.length + 1);
  });

  it("filters by text ignoring accents", () => {
    open();
    const target = CAT.find((c) => /[áéíóú]/i.test(c.name)) ?? CAT[0];
    const query = target.name.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 5);
    fireEvent.change(screen.getByLabelText("Buscar componentes"), { target: { value: query } });
    const table = screen.getByRole("table", { name: "Componentes del catálogo" });
    expect(within(table).getAllByRole("row").length).toBeLessThan(CAT.length + 1);
    expect(within(table).getByText(target.name)).toBeTruthy();
  });

  it("shows the empty message when nothing matches the search", () => {
    open();
    fireEvent.change(screen.getByLabelText("Buscar componentes"), {
      target: { value: "zzzz-no-existe" },
    });
    expect(screen.getByText(/Nada coincide con/)).toBeTruthy();
  });

  it("filters by component type with the chips", () => {
    open();
    const group = screen.getByRole("group", { name: "Filtrar por tipo" });
    const chips = within(group).getAllByRole("button");
    fireEvent.click(chips[1]);
    expect(chips[1].getAttribute("aria-pressed")).toBe("true");
    const table = screen.getByRole("table", { name: "Componentes del catálogo" });
    expect(within(table).getAllByRole("row").length).toBeLessThan(CAT.length + 1);
  });

  it("switches to the club inventory tab", () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: /Inventario del club/ }));
    expect(screen.getByRole("heading", { name: "Inventario del club" })).toBeTruthy();
  });

  it("offers the component registration action", () => {
    open();
    expect(screen.getByRole("button", { name: /Registrar|Nuevo|Agregar/i })).toBeTruthy();
  });
});
