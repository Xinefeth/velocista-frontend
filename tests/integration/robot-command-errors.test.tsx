import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { ConsoleProvider, useConsole, type ConsoleState } from "@/application/state/ConsoleContext";
import { api, ErrorApi } from "@/infrastructure/http/api";
import { ROBOTS } from "@/shared/data/robots";
import type { MensajeConsola } from "@/infrastructure/contracts/messages";

const { connection } = vi.hoisted(() => ({
  connection: { tiempoReal: "ok", mensajes: [] as MensajeConsola[] },
}));
vi.mock("@/application/state/ConnectionContext", () => ({
  useOptionalConnection: () => connection,
}));
let state: ConsoleState;
function Probe() {
  state = useConsole();
  return null;
}
const frame = (type: string, data: Record<string, unknown>): MensajeConsola => ({
  sender: "robot",
  type,
  data,
  received_ms: 1,
});
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  connection.tiempoReal = "ok";
  connection.mensajes = [
    frame("status", {
      state: "ready",
      calibrated: false,
      mode: "test",
      line: "black",
      controller: "pid",
      loop_hz: 1000,
      rssi_dbm: -50,
      channels: {},
    }),
    frame("manifest", { id: "v001" }),
  ];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserves real state and reports backend rejection for start, calibration, mode and line", async () => {
  const command = vi
    .spyOn(api, "command")
    .mockRejectedValue(new ErrorApi(409, "device_busy", "Device is busy"));
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ reason: "device_busy", detail: "Device is busy" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>,
  );
  act(() => state.setSource("robot"));
  await waitFor(() => expect(state.source).toBe("robot"));
  await act(async () => {
    state.toggleRunning();
    state.calibrate();
    state.setMode("competition");
    state.setLine("white");
  });
  expect(command).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/robots/v001/mode-line/mode"),
    expect.any(Object),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/robots/v001/mode-line/line"),
    expect.any(Object),
  );
  expect(state.running).toBe(false);
  expect(state.calibrating).toBe(false);
  expect(state.calibrated).toBe(false);
  expect(state.mode).toBe("test");
  expect(state.line).toBe("black");
  expect(state.toast).toContain("Device is busy");
});

it("does not claim setup applied when the gateway rejects delivery", async () => {
  vi.spyOn(api, "command").mockRejectedValue(
    new ErrorApi(503, "device_offline", "Device is offline"),
  );
  render(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>,
  );
  act(() => state.setSource("robot"));
  await waitFor(() => expect(state.source).toBe("robot"));
  const previous = state.applied;
  act(() => state.setParam("kp", state.draft.parameters.kp + 0.1));
  await act(async () => state.sendSetup());
  expect(state.applied).toEqual(previous);
  expect(state.toast).toContain("Device is offline");
});

it("clears real connection after a gateway disconnect and blocks command delivery", async () => {
  const command = vi.spyOn(api, "command").mockResolvedValue({ seq: 1 });
  const content = (
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>
  );
  const view = render(content);
  act(() => state.setSource("robot"));
  await waitFor(() => expect(state.source).toBe("robot"));
  connection.mensajes = [
    { sender: "api", type: "link", data: { device: "robot", connected: false }, received_ms: 2 },
  ];
  view.rerender(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>,
  );
  await waitFor(() => expect(state.connected).toBe(false));
  act(() => state.toggleRunning());
  expect(command).not.toHaveBeenCalled();
});
