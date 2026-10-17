import { describe, expect, it } from "vitest";
import { EMPTY_STATUS, robotStatusFromMessages } from "@/domain/robotStatus";
import type { MensajeConsola } from "@/infrastructure/contracts/messages";

const message = (sender: string, type: string, data: Record<string, unknown>): MensajeConsola =>
  ({ sender, type, data, seq: 1, ts: 1, received_ms: 1 }) as unknown as MensajeConsola;

const status = (extra: Record<string, unknown> = {}) =>
  message("robot", "status", {
    state: "ready",
    loop_hz: 1000,
    rssi_dbm: -40,
    channels: { bateria_v: 7.4 },
    ...extra,
  });

describe("robotStatusFromMessages", () => {
  it("returns the empty status when there are no messages", () => {
    expect(robotStatusFromMessages([])).toEqual(EMPTY_STATUS);
  });

  it("reads state, battery, rssi and loop frequency from the newest status", () => {
    const result = robotStatusFromMessages([status(), status({ state: "running" })]);
    expect(result).toMatchObject({
      state: "ready",
      battery: 7.4,
      rssiDbm: -40,
      loopHz: 1000,
      connected: true,
    });
  });

  it("considers the robot disconnected when the newest link message says so", () => {
    const link = message("api", "link", { device: "robot", connected: false });
    expect(robotStatusFromMessages([link, status()]).connected).toBe(false);
  });

  it("uses the hello message to know the initial connection state", () => {
    const hello = message("api", "hello", { devices: { robot: true, timer: false } });
    expect(robotStatusFromMessages([hello]).connected).toBe(true);
  });

  it("ignores link messages that belong to the timer", () => {
    const link = message("api", "link", { device: "timer", connected: true });
    expect(robotStatusFromMessages([link]).connected).toBe(false);
  });

  it("keeps battery null when the status has no battery channel", () => {
    expect(robotStatusFromMessages([status({ channels: {} })]).battery).toBeNull();
  });
});
