import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "@/app/App";
import { ConsoleProvider } from "@/application/state/ConsoleContext";
import { api } from "@/infrastructure/http/api";
import { ROBOTS } from "@/shared/data/robots";

const nativeFetch = globalThis.fetch.bind(globalThis);
const enabled = process.env.RUN_LIVE_QA === "1";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", (input: string | URL, options?: RequestInit) =>
    nativeFetch(new URL(String(input), "http://127.0.0.1:5173"), options),
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "measureText") return () => ({ width: 20 });
        if (key === "createLinearGradient" || key === "createRadialGradient")
          return () => ({ addColorStop() {} });
        return () => {};
      },
      set() {
        return true;
      },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.runIf(enabled)("live frontend/backend contract via Vite", () => {
  it("reads health and PostgreSQL through the actual frontend proxy", async () => {
    const health = await api.health();
    expect(health.api).toBe("ok");
    expect(health.database).toBe("ok");
  });

  it("loads real robot and component lists", async () => {
    expect(Array.isArray(await api.robots.selection())).toBe(true);
    expect(Array.isArray(await api.catalog.list())).toBe(true);
  });

  it("renders the first-robot screen against an empty actual database", async () => {
    render(
      <ConsoleProvider>
        <App />
      </ConsoleProvider>,
    );
    expect(await screen.findByRole("button", { name: /registrar|crear/i })).toBeTruthy();
  });

  it("sends a version body accepted by the backend schema", async () => {
    // A valid body reaches the nonexistent-robot guard (404), without writing any data.
    await expect(
      api.robots.createVersion("__qa_missing_robot__", {
        baseVersionId: null,
        note: "Contract verification",
        status: "draft",
        parts: {},
      }),
    ).rejects.toMatchObject({ status: 404, reason: "robot_not_found" });
  });

  it("has a working runs endpoint consumed by the frontend", async () => {
    const page = await api.runs.list();
    expect(Array.isArray(page.items)).toBe(true);
  });
});

describe.runIf(enabled)("all seven views render with fixture data", () => {
  it.each([
    "Control",
    "Telemetría",
    "Corridas y optimización",
    "Mapa de pista",
    "Catálogo de componentes",
    "Armador de robots",
    "Perfiles de reglamento",
  ])("opens %s", (name) => {
    render(
      <ConsoleProvider initialRobots={ROBOTS}>
        <App />
      </ConsoleProvider>,
    );
    const navigation = screen
      .getAllByRole("navigation", { name: "Secciones" })
      .find((element) => element.classList.contains("rail"))!;
    const button = within(navigation).getByRole("button", { name });
    fireEvent.click(button);
    expect(button.getAttribute("aria-current")).toBe("page");
    expect(document.querySelector(".main")?.textContent?.length).toBeGreaterThan(20);
  });
});
