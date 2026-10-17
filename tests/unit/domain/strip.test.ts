import { describe, expect, it } from "vitest";
import {
  ACTIVE_THRESHOLD,
  STRIP_CHANNELS,
  stripFromMessages,
  stripFromSignals,
} from "@/domain/strip";
import type { Senales } from "@/infrastructure/contracts/contract";

const signals = (readings: unknown): Senales =>
  ({ channels: { regleta: readings } }) as unknown as Senales;

const readings = (hot: number[]) =>
  Array.from({ length: STRIP_CHANNELS }, (_, i) => (hot.includes(i) ? 1000 : 0));

describe("line strip view", () => {
  it("returns null without signals or with a malformed channel", () => {
    expect(stripFromSignals(null)).toBeNull();
    expect(stripFromSignals(signals([1, 2, 3]))).toBeNull();
    expect(stripFromSignals(signals(Array(16).fill("x")))).toBeNull();
    expect(stripFromSignals(signals(Array(16).fill(Number.NaN)))).toBeNull();
  });

  it("detects a centered line", () => {
    const view = stripFromSignals(signals(readings([7, 8])))!;
    expect(view.centered).toBe(true);
    expect(view.lost).toBe(false);
    expect(Math.abs(view.positionNorm)).toBeLessThan(0.01);
    expect(view.active).toBe(2);
  });

  it("detects a line to the right (positive) and to the left (negative)", () => {
    expect(stripFromSignals(signals(readings([14, 15])))!.positionNorm).toBeGreaterThan(0.8);
    expect(stripFromSignals(signals(readings([0, 1])))!.positionNorm).toBeLessThan(-0.8);
  });

  it("reports a lost line when no bar is active", () => {
    const view = stripFromSignals(signals(readings([])))!;
    expect(view).toMatchObject({ lost: true, centered: false, positionNorm: 0, active: 0 });
  });

  it("clamps readings above the full scale and digits stay within 0..9", () => {
    const view = stripFromSignals(signals(Array(16).fill(5000)))!;
    expect(Math.max(...view.bars)).toBe(1);
    expect(Math.max(...view.digits)).toBeLessThanOrEqual(9);
    expect(ACTIVE_THRESHOLD).toBeGreaterThan(0);
  });

  it("uses the newest robot signals message", () => {
    const old = { sender: "robot", type: "signals", data: signals(readings([0])) };
    const fresh = { sender: "robot", type: "signals", data: signals(readings([15])) };
    const view = stripFromMessages([fresh, old] as never)!;
    expect(view.positionNorm).toBeGreaterThan(0);
    expect(stripFromMessages([])).toBeNull();
  });
});
