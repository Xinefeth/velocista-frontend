// Textos de los avisos del servidor: los códigos nuevos de figuras cóncavas con GPS y los desconocidos.
import { describe, expect, it } from "vitest";
import { warningText, WARNINGS } from "@/domain/measurement/labels";

describe("warningText", () => {
  it("traduce los códigos de figuras cóncavas con GPS", () => {
    for (const code of ["gps_narrow_section", "gps_smoothing_adjusted", "corner_area_mismatch"])
      expect(warningText(code)).toBe(WARNINGS[code]);
    expect(warningText("gps_narrow_section")).toMatch(/zona muy angosta/);
    expect(warningText("gps_smoothing_adjusted")).toMatch(/suavizado más fuerte/);
    expect(warningText("corner_area_mismatch")).toMatch(/esquina interior/);
  });
  it("un código desconocido se muestra tal cual", () => {
    expect(warningText("algo_nuevo")).toBe("algo_nuevo");
  });
  it("nombres heredados de Object no devuelven funciones", () => {
    for (const k of ["constructor", "toString", "__proto__"]) expect(warningText(k)).toBe(k);
  });
  it("valores raros no rompen", () => {
    expect(warningText(undefined)).toBe("undefined");
    expect(warningText(null)).toBe("null");
  });
});
