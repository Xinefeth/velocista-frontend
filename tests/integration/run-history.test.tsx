import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, act } from "@testing-library/react";
import { api } from "@/infrastructure/http/api";
import { loadRunHistory, toRun } from "@/infrastructure/http/runs";
import { ConsoleProvider, useConsole, type ConsoleState } from "@/application/state/ConsoleContext";
import type { CorridaApi } from "@/infrastructure/contracts/api";
import { ROBOTS } from "@/shared/data/robots";
import { CAT } from "@/shared/data/catalog";

const run: CorridaApi = {
  id: 17,
  number: 3,
  robot_id: "v001",
  version_id: 1,
  setup_id: 1,
  profile_id: "mr4s",
  controller_id: "pid",
  parameters: { kp: 0.8, kd: 1 },
  date: "2026-10-15T00:00:00Z",
  source: "sim",
  mode: "test",
  line: "black",
  battery_compensation: true,
  turbine_power_pct: 0,
  time_s: 5,
  finished: true,
  accumulated_error: 0.2,
  battery_v: 8.1,
  sectors_s: [1, 2, 2],
  time_source: "finish",
  note: "Desde BD",
  j: 5.4,
};
let state: ConsoleState;
function Probe() {
  state = useConsole();
  return null;
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("persisted runs", () => {
  it("maps database IDs and metrics without changing notes", () => {
    expect(toRun(run, [{ ...ROBOTS[0], currentVersionId: 1 }])).toMatchObject({
      id: 17,
      n: 3,
      J: 5.4,
      fin: true,
      note: "Desde BD",
      ver: ROBOTS[0].versions.at(-1)!.v,
      src: "Meta",
    });
  });
  it("loads all pages and orders chart points by run number", async () => {
    const list = vi
      .spyOn(api.runs, "list")
      .mockResolvedValueOnce({ items: [run], total: 2, limit: 200, offset: 0 })
      .mockResolvedValueOnce({
        items: [{ ...run, id: 18, number: 2 }],
        total: 2,
        limit: 200,
        offset: 1,
      });
    const history = await loadRunHistory(ROBOTS);
    expect(list.mock.calls[1][0]).toBe("?limit=200&offset=1");
    expect(history.map((r) => r.n)).toEqual([2, 3]);
  });
  it("loads backend history when the production console mounts", async () => {
    vi.spyOn(api.catalog, "list").mockResolvedValue(CAT);
    vi.spyOn(api.robots, "selection").mockResolvedValue(ROBOTS);
    vi.spyOn(api.runs, "list").mockResolvedValue({ items: [run], total: 1, limit: 200, offset: 0 });
    render(
      <ConsoleProvider>
        <Probe />
      </ConsoleProvider>,
    );
    await waitFor(() => expect(state?.runs[0]?.id).toBe(17));
    expect(state.runsError).toBeNull();
    expect(state.lastRun?.note).toBe("Desde BD");
  });
  it("does not ask the backend to generate a simulated run", async () => {
    let calibrationFrame: FrameRequestCallback | undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        calibrationFrame = callback;
        return 1;
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ConsoleProvider initialRobots={ROBOTS}>
        <Probe />
      </ConsoleProvider>,
    );
    act(() => state.calibrate());
    act(() => calibrationFrame?.(performance.now() + 2000));
    await waitFor(() => expect(state.calibrated).toBe(true));
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    act(() => state.toggleRunning());
    expect(state.running).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("exposes a failed history request and allows retry", async () => {
    vi.spyOn(api.catalog, "list").mockResolvedValue(CAT);
    vi.spyOn(api.robots, "selection").mockResolvedValue(ROBOTS);
    const list = vi.spyOn(api.runs, "list").mockRejectedValue(new Error("offline"));
    render(
      <ConsoleProvider>
        <Probe />
      </ConsoleProvider>,
    );
    await waitFor(() => expect(state?.runsError).toContain("historial"));
    list.mockResolvedValue({ items: [run], total: 1, limit: 200, offset: 0 });
    act(() => state.refreshRuns());
    await waitFor(() => expect(state.runsError).toBeNull());
    expect(state.runs[0].id).toBe(17);
  });
  it("persists notes before reporting success", async () => {
    let stored = { ...run };
    vi.spyOn(api.catalog, "list").mockResolvedValue(CAT);
    vi.spyOn(api.robots, "selection").mockResolvedValue(ROBOTS);
    vi.spyOn(api.runs, "list").mockImplementation(async () => ({
      items: [stored],
      total: 1,
      limit: 200,
      offset: 0,
    }));
    const fetchMock = vi.fn().mockImplementation(async (_url, options) => {
      stored = { ...stored, note: JSON.parse(options.body).note };
      return new Response(JSON.stringify(stored));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ConsoleProvider>
        <Probe />
      </ConsoleProvider>,
    );
    await waitFor(() => expect(state?.lastRun?.id).toBe(17));
    await act(async () => {
      expect(await state.saveNote("Nueva nota")).toBe(true);
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/runs/17");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(state.lastRun?.note).toBe("Desde BD. Nueva nota");
  });
});
