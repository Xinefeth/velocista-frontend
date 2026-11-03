import { describe, expect, it } from "vitest";
import { describePath, messageFor } from "@/ui/components/track/fieldLabels";

describe("describePath", () => {
  it("nombra los campos fijos", () => {
    expect(describePath("name")).toBe("Nombre");
    expect(describePath("board.width_cm")).toBe("Ancho del tablero");
    expect(describePath("board.height_cm")).toBe("Alto del tablero");
    expect(describePath("profile_id")).toBe("Perfil");
    expect(describePath("length_cm")).toBe("Largo");
    expect(describePath("perimeter_cm")).toBe("Perímetro");
    expect(describePath("area_cm2")).toBe("Área");
    expect(describePath("start.edge")).toBe("Tramo de salida");
    expect(describePath("closed")).toBe("Circuito cerrado");
  });

  it("numera los puntos y zonas desde 1 y nombra su campo", () => {
    expect(describePath("points[0].radius")).toBe("Punto 1 · radio");
    expect(describePath("points[3].x")).toBe("Punto 4 · X");
    expect(describePath("points[2]")).toBe("Punto 3");
    expect(describePath("zones[1].width")).toBe("Zona 2 · ancho");
    expect(describePath("zones[0].name")).toBe("Zona 1 · nombre");
  });

  it("deja tal cual lo que no conoce", () => {
    expect(describePath("algo.raro")).toBe("algo.raro");
    expect(describePath("points[1].otro")).toBe("Punto 2");
    expect(describePath("")).toBe("Pista");
  });
});

describe("messageFor", () => {
  const fields = [
    { path: "board.width_cm", message: "ancho mal" },
    { path: "points[3].radius", message: "radio mal" },
    { path: "name", message: "nombre mal" },
  ];

  it("busca por ruta exacta o por prefijo", () => {
    expect(messageFor(fields, "name")).toBe("nombre mal");
    expect(messageFor(fields, "board")).toBe("ancho mal");
    expect(messageFor(fields, "points")).toBe("radio mal");
    expect(messageFor(fields, "board.width_cm", "board")).toBe("ancho mal");
  });

  it("no confunde campos parecidos y devuelve undefined si no hay", () => {
    expect(messageFor(fields, "board.height_cm")).toBeUndefined();
    expect(messageFor(fields, "nam")).toBeUndefined();
    expect(messageFor([], "name")).toBeUndefined();
  });
});
