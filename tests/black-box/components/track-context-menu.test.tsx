import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ContextMenu } from "@/ui/components/track/ContextMenu";
import type { MenuItem } from "@/ui/components/track/contextItems";

afterEach(cleanup);

function setup(items: MenuItem[], x = 40, y = 60) {
  const onClose = vi.fn();
  render(<ContextMenu items={items} x={x} y={y} onClose={onClose} />);
  return { onClose, menu: screen.getByRole("menu", { name: "Menú del plano" }) };
}

describe("menú contextual del plano", () => {
  it("muestra encabezados, acciones con su atajo y separadores", () => {
    const { menu } = setup([
      { kind: "header", label: "Punto 2" },
      { kind: "action", label: "Borrar punto", kbd: "Supr", danger: true, run: () => {} },
      { kind: "separator" },
      { kind: "action", label: "Ajustar vista", run: () => {} },
    ]);
    expect(within(menu).getByText("Punto 2")).toBeTruthy();
    const del = within(menu).getByRole("menuitem", { name: /Borrar punto/ });
    expect(del.className).toContain("danger");
    expect(del.textContent).toContain("Supr");
    expect(menu.querySelectorAll("hr")).toHaveLength(1);
  });

  it("elegir una acción cierra el menú y la ejecuta", () => {
    const run = vi.fn();
    const { onClose } = setup([{ kind: "action", label: "Seleccionar todo", run }]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Seleccionar todo" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("Escape y un clic fuera cierran el menú; un clic dentro no", () => {
    const { onClose, menu } = setup([{ kind: "action", label: "Algo", run: () => {} }]);
    fireEvent.pointerDown(menu);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("un campo aplica su valor con Enter o con el botón, aceptando coma decimal", () => {
    const run = vi.fn();
    const { onClose } = setup([{ kind: "field", label: "Radio", value: 15, unit: "cm", run }]);
    const input = screen.getByRole("textbox", { name: "Radio" }) as HTMLInputElement;
    expect(input.value).toBe("15");
    fireEvent.change(input, { target: { value: "22,5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(run).toHaveBeenCalledWith(22.5);
    expect(onClose).toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(run).toHaveBeenLastCalledWith(30);
  });

  it("un valor que no es número no se aplica", () => {
    const run = vi.fn();
    const { onClose } = setup([{ kind: "field", label: "Radio", value: 15, unit: "cm", run }]);
    const input = screen.getByRole("textbox", { name: "Radio" });
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("los campos con varios botones (girar ↺ ↻) pasan el valor a cada uno", () => {
    const left = vi.fn();
    const right = vi.fn();
    setup([
      {
        kind: "field",
        label: "Girar",
        value: 15,
        unit: "°",
        run: left,
        buttons: [
          { text: "↺", title: "Izquierda", run: left },
          { text: "↻", title: "Derecha", run: right },
        ],
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "↻" }));
    expect(right).toHaveBeenCalledWith(15);
    fireEvent.click(screen.getByRole("button", { name: "↺" }));
    expect(left).toHaveBeenCalledWith(15);
  });

  it("los grupos de botones (plantillas, espejo) ejecutan y cierran", () => {
    const horizontal = vi.fn();
    const { onClose } = setup([
      {
        kind: "buttons",
        label: "Espejo",
        buttons: [
          { text: "↔", title: "Horizontal", run: horizontal },
          { text: "↕", title: "Vertical", run: () => {} },
        ],
      },
    ]);
    const group = screen.getByRole("group", { name: "Espejo" });
    fireEvent.click(within(group).getByRole("button", { name: "↔" }));
    expect(horizontal).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("el foco entra al primer control y la posición se ajusta a la ventana", () => {
    setup([{ kind: "action", label: "Primero", run: () => {} }], 5000, 5000);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Primero" }));
    const menu = screen.getByRole("menu");
    expect(parseFloat(menu.style.left)).toBeLessThan(window.innerWidth);
    expect(parseFloat(menu.style.top)).toBeLessThan(window.innerHeight);
  });

  it("las teclas escritas en un campo no se propagan a los atajos del plano", () => {
    const onDocKey = vi.fn();
    document.addEventListener("keydown", onDocKey);
    setup([{ kind: "field", label: "Radio", value: 15, unit: "cm", run: () => {} }]);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Radio" }), { key: "p" });
    document.removeEventListener("keydown", onDocKey);
    expect(onDocKey).not.toHaveBeenCalled();
  });
});
