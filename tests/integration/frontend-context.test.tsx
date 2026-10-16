import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ConsoleProvider, useConsole, type ConsoleState } from "@/application/state/ConsoleContext";
import { ROBOTS } from "@/shared/data/robots";
import { Builder } from "@/ui/pages/Builder";

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
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("exposes renamed context actions and English navigation/mode values", () => {
  render(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Probe />
    </ConsoleProvider>,
  );
  expect(state.mode).toBe("test");
  expect(state.line).toBe("black");
  act(() => {
    state.goTab("builder");
    state.setMode("competition");
    state.setLine("white");
    state.openManifest("v001");
    state.log("Prueba", "Evento");
  });
  expect(state.tab).toBe("builder");
  expect(state.mode).toBe("competition");
  expect(state.line).toBe("white");
  expect(state.manifestId).toBe("v001");
  expect(state.events.some((event) => event.msg === "Evento")).toBe(true);
  act(() => state.closeManifest());
  expect(state.manifestId).toBeNull();
});

it("renders version labels in Spanish in the builder", () => {
  render(
    <ConsoleProvider initialRobots={ROBOTS}>
      <Builder />
    </ConsoleProvider>,
  );
  expect(screen.getAllByText("Actual").length).toBeGreaterThan(0);
  expect(screen.queryByText("current")).toBeNull();
});
