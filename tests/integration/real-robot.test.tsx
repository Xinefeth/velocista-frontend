import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { ConsoleProvider, useConsole, type ConsoleState } from "@/application/state/ConsoleContext";
import { api } from "@/infrastructure/http/api";
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
      calibrated: true,
      mode: "test",
      line: "black",
      controller: "pid",
      loop_hz: 1000,
      rssi_dbm: -50,
      channels: { bateria_v: 8.1 },
    }),
    frame("manifest", { id: "v001" }),
  ];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses real status and sends commands through the backend instead of starting the local simulator", async () => {
  const command = vi.spyOn(api, "command").mockResolvedValue({ seq: 1 });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ seq: 1 })));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>,
  );
  act(() => state.setSource("robot"));
  await waitFor(() => expect(state.source).toBe("robot"));
  expect(state.connected).toBe(true);
  expect(state.calibrated).toBe(true);
  expect(state.vbat).toBe(8.1);
  act(() => state.toggleRunning());
  await waitFor(() => expect(command).toHaveBeenCalledWith("start", {}));
  expect(state.running).toBe(false);
  act(() => state.setMode("competition"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock.mock.calls[0][0]).toBe("/api/robots/v001/mode-line/mode");
  expect(state.mode).toBe("test");
  act(() => state.setLine("white"));
  await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ color: "white" });
});

it("does not control a connected robot with a different database ID", () => {
  connection.mensajes = [frame("manifest", { id: "another-robot" })];
  render(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>,
  );
  act(() => state.setSource("robot"));
  expect(state.source).toBe("sim");
  expect(state.toast).toContain("seleccionado");
});

it("keeps the manifest after it leaves the telemetry buffer", async () => {
  const rendered = render(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>,
  );
  connection.mensajes = [
    frame("status", {
      state: "ready",
      calibrated: true,
      mode: "test",
      line: "black",
      controller: "pid",
      loop_hz: 1000,
      rssi_dbm: -50,
      channels: {},
    }),
  ];
  rendered.rerender(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>,
  );
  act(() => state.setSource("robot"));
  await waitFor(() => expect(state.source).toBe("robot"));
});
