import { afterEach, expect, it, vi } from "vitest";
import { changeModeLine, storeSetup, applyStoredSetup } from "@/infrastructure/http/robot";

afterEach(() => vi.unstubAllGlobals());
it("stores a setup against the selected version and applies the persisted ID", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 7, seq: 4 })));
  vi.stubGlobal("fetch", fetchMock);
  await storeSetup("r/1", 3, { controller: "pid", parameters: { kp: 0.5 } });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/robots/r%2F1/setups");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    version_id: 3,
    controller_id: "pid",
    parameters: { kp: 0.5 },
  });
  await applyStoredSetup("r/1", 7);
  expect(fetchMock.mock.calls[1][0]).toBe("/api/robots/r%2F1/setups/7/apply");
});
it("uses the robot-specific endpoints that persist mode and line", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ seq: 1 })));
  vi.stubGlobal("fetch", fetchMock);
  await changeModeLine("r1", "mode", { mode: "competition" });
  await changeModeLine("r1", "line", { color: "white" });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/robots/r1/mode-line/mode");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ color: "white" });
});
