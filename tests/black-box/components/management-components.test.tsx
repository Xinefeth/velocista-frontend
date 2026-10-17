import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  DataTable,
  DynamicForm,
  FilterChips,
  InputField,
  SearchBox,
  Tabs,
  type FieldDef,
} from "@/ui/components/management";

afterEach(cleanup);

describe("SearchBox", () => {
  it("shows the typed value and reports every change", () => {
    const onChange = vi.fn();
    render(<SearchBox valor="ab" alCambiar={onChange} etiqueta="Buscar componentes" />);
    const input = screen.getByLabelText("Buscar componentes") as HTMLInputElement;
    expect(input.value).toBe("ab");
    fireEvent.change(input, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });
});

describe("FilterChips", () => {
  const options = [
    { valor: "mcu", etiqueta: "MCU", cantidad: 3 },
    { valor: "bat", etiqueta: "Batería", cantidad: 1 },
  ];

  it("marks the selected chip and reports the new one", () => {
    const onChange = vi.fn();
    render(<FilterChips opciones={options} valor="mcu" alCambiar={onChange} etiqueta="Filtrar" />);
    const group = screen.getByRole("group", { name: "Filtrar" });
    expect(within(group).getByRole("button", { name: /MCU/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(within(group).getByRole("button", { name: /Batería/ }));
    expect(onChange).toHaveBeenCalledWith("bat");
  });

  it("the 'Todos' chip clears the filter with null", () => {
    const onChange = vi.fn();
    render(
      <FilterChips
        opciones={options}
        valor="mcu"
        alCambiar={onChange}
        etiqueta="Filtrar"
        cantidadTodos={4}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Todos/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "a", etiqueta: "Componentes" },
    { id: "b", etiqueta: "Inventario" },
    { id: "c", etiqueta: "Otro" },
  ];

  it("selects a tab on click", () => {
    const onChange = vi.fn();
    render(<Tabs pestanas={tabs} activa="a" alCambiar={onChange} etiqueta="Secciones" />);
    expect(screen.getByRole("tab", { name: "Componentes" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Inventario" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it.each([
    ["ArrowRight", "a", "b"],
    ["ArrowLeft", "a", "c"],
    ["End", "a", "c"],
    ["Home", "c", "a"],
  ])("keyboard %s from %s goes to %s", (key, from, to) => {
    const onChange = vi.fn();
    render(<Tabs pestanas={tabs} activa={from} alCambiar={onChange} etiqueta="Secciones" />);
    const tab = screen.getAllByRole("tab")[tabs.findIndex((t) => t.id === from)];
    fireEvent.keyDown(tab, { key });
    expect(onChange).toHaveBeenCalledWith(to);
  });
});

describe("DataTable", () => {
  type Row = { id: string; name: string };
  const rows: Row[] = [
    { id: "1", name: "ESP32" },
    { id: "2", name: "Nano" },
  ];
  const columns = [{ id: "name", encabezado: "Nombre", celda: (r: Row) => r.name }];

  it("renders headers and rows", () => {
    render(<DataTable columnas={columns} filas={rows} clave={(r) => r.id} etiqueta="Tabla" />);
    const table = screen.getByRole("table", { name: "Tabla" });
    expect(within(table).getByRole("columnheader", { name: "Nombre" })).toBeTruthy();
    expect(within(table).getByText("ESP32")).toBeTruthy();
    expect(within(table).getByText("Nano")).toBeTruthy();
  });

  it("shows the empty message when there are no rows", () => {
    render(
      <DataTable
        columnas={columns}
        filas={[]}
        clave={(r: Row) => r.id}
        etiqueta="Tabla"
        vacio="Sin datos"
      />,
    );
    expect(screen.getByText("Sin datos")).toBeTruthy();
  });

  it("activates a row with click, Enter and Space", () => {
    const onClick = vi.fn();
    render(
      <DataTable
        columnas={columns}
        filas={rows}
        clave={(r) => r.id}
        etiqueta="Tabla"
        alHacerClic={onClick}
      />,
    );
    const row = screen.getByText("ESP32").closest("tr")!;
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(3);
    expect(onClick).toHaveBeenCalledWith(rows[0]);
  });
});

describe("InputField / DynamicForm", () => {
  const fields: FieldDef[] = [
    { nombre: "name", etiqueta: "Nombre", tipo: "text" },
    { nombre: "price", etiqueta: "Precio", tipo: "number" },
    {
      nombre: "kind",
      etiqueta: "Tipo",
      tipo: "select",
      opciones: [{ valor: "a", etiqueta: "Opción A" }],
    },
  ];

  it("labels the input and announces the error to assistive technology", () => {
    render(<InputField etiqueta="Precio" error="Obligatorio" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Precio");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Obligatorio");
  });

  it("renders one control per field and reports typed values by field name", () => {
    const onChange = vi.fn();
    render(
      <DynamicForm
        campos={fields}
        valores={{ name: "", price: "", kind: "a" }}
        alCambiar={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "ESP32" } });
    fireEvent.change(screen.getByLabelText("Precio"), { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith("name", "ESP32");
    expect(onChange).toHaveBeenCalledWith("price", "12");
    expect(screen.getByRole("option", { name: "Opción A" })).toBeTruthy();
  });

  it("shows each field error next to its field", () => {
    render(
      <DynamicForm
        campos={fields}
        valores={{}}
        errores={{ name: "Falta nombre" }}
        alCambiar={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Falta nombre");
  });
});
