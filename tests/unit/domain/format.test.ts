import { describe, expect, it } from "vitest";
import { clamp, clone, fmt, money, num, VERSION_STATUS_LABEL } from "@/domain/format";

describe("format helpers", () => {
  it("fmt rounds to a fixed number of decimals", () => {
    expect(fmt(1.2345, 2)).toBe("1.23");
    expect(fmt(2, 3)).toBe("2.000");
  });

  it("money shows soles with two decimals", () => {
    expect(money(12)).toBe("S/ 12.00");
    expect(money(0.5)).toBe("S/ 0.50");
  });

  it.each([
    [5, 0, 10, 5],
    [-1, 0, 10, 0],
    [11, 0, 10, 10],
  ])("clamp(%s, %s, %s) = %s", (x, a, b, expected) => {
    expect(clamp(x, a, b)).toBe(expected);
  });

  it("num converts text specs to numbers", () => {
    expect(num("3.5")).toBe(3.5);
    expect(Number.isNaN(num("abc"))).toBe(true);
  });

  it("clone produces an independent deep copy", () => {
    const original = { a: { b: 1 } };
    const copy = clone(original);
    copy.a.b = 2;
    expect(original.a.b).toBe(1);
  });

  it("version statuses are shown in Spanish to the user", () => {
    expect(VERSION_STATUS_LABEL.current).toBe("Actual");
    expect(VERSION_STATUS_LABEL.previous).toBe("Anterior");
    expect(VERSION_STATUS_LABEL.draft).toBe("Borrador");
  });
});
