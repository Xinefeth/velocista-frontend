import { describe, expect, it } from "vitest";
import {
  normalizeText,
  parseNumber,
  validateFields,
  type FieldDef,
} from "@/ui/components/management";

describe("parseNumber", () => {
  it.each([
    ["12", 12],
    ["12.5", 12.5],
    ["12,5", 12.5],
    [" 7 ", 7],
    ["-3", -3],
  ])("parses %j", (text, value) => expect(parseNumber(text)).toBe(value));

  it.each(["", "abc", "1.2.3", "1e5", "--1"])("rejects %j", (text) =>
    expect(parseNumber(text)).toBeNull(),
  );
});

describe("normalizeText", () => {
  it("removes accents and lowercases so searches ignore them", () => {
    expect(normalizeText("  Batería LiPo ")).toBe("bateria lipo");
  });
});

const FIELDS: FieldDef[] = [
  { nombre: "name", etiqueta: "Nombre", tipo: "text", requerido: true },
  { nombre: "price", etiqueta: "Precio", tipo: "number", requerido: true, minExclusivo: 0 },
  { nombre: "stock", etiqueta: "Stock", tipo: "number", entero: true, min: 0, max: 100 },
  {
    nombre: "kind",
    etiqueta: "Tipo",
    tipo: "select",
    opciones: [{ valor: "a", etiqueta: "A" }],
  },
];

describe("validateFields", () => {
  it("returns no errors for valid values", () => {
    expect(validateFields(FIELDS, { name: "ESP32", price: "10", stock: "3", kind: "a" })).toEqual(
      {},
    );
  });

  it("requires mandatory fields with a Spanish message", () => {
    const errors = validateFields(FIELDS, { name: " ", price: "" });
    expect(errors.name).toBe("Este campo es obligatorio.");
    expect(errors.price).toBe("Este campo es obligatorio.");
  });

  it("does not complain about empty optional fields", () => {
    expect(validateFields(FIELDS, { name: "x", price: "1" })).toEqual({});
  });

  it("rejects invalid numbers, zero price, decimals in integers and out of range", () => {
    expect(validateFields(FIELDS, { name: "x", price: "abc" }).price).toMatch(/número válido/);
    expect(validateFields(FIELDS, { name: "x", price: "0" }).price).toMatch(/mayor que 0/);
    expect(validateFields(FIELDS, { name: "x", price: "1", stock: "1.5" }).stock).toMatch(/entero/);
    expect(validateFields(FIELDS, { name: "x", price: "1", stock: "-1" }).stock).toMatch(
      /mayor o igual/,
    );
    expect(validateFields(FIELDS, { name: "x", price: "1", stock: "101" }).stock).toMatch(
      /menor o igual/,
    );
  });

  it("rejects an option that is not in the list", () => {
    expect(validateFields(FIELDS, { name: "x", price: "1", kind: "z" }).kind).toMatch(/opción/);
  });

  it("accepts a decimal comma", () => {
    expect(validateFields(FIELDS, { name: "x", price: "1,5" })).toEqual({});
  });

  it("uses custom messages when provided", () => {
    const custom: FieldDef[] = [
      {
        nombre: "n",
        etiqueta: "N",
        tipo: "text",
        requerido: true,
        mensajes: { obligatorio: "Falta" },
      },
    ];
    expect(validateFields(custom, {}).n).toBe("Falta");
  });
});
