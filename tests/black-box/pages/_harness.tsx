import { vi } from "vitest";
import type { ReactNode } from "react";
import { ConsoleProvider } from "@/application/state/ConsoleContext";
import { ROBOTS } from "@/shared/data/robots";

/** Browser APIs that jsdom lacks and the console uses while drawing. */
export function stubBrowser() {
  localStorage.clear();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("scrollTo", vi.fn());
}

/** Page rendered the way production does, with the local fixtures as data. */
export function WithConsole({ children }: { children: ReactNode }) {
  return <ConsoleProvider initialRobots={ROBOTS}>{children}</ConsoleProvider>;
}
