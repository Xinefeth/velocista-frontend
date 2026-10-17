/**
 * Integration: the HTTP layer against a simulated backend (fetch is replaced by a fake API
 * that answers like the real one: pagination, error format, English JSON fields).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, request } from "@/infrastructure/http/api";
import { loadRunHistory, annotateRun } from "@/infrastructure/http/runs";
import { applyStoredSetup, changeModeLine, storeSetup } from "@/infrastructure/http/robot";

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown };

function fakeApi(handler: Handler) {
  const calls: { path: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input, "http://localhost");
      calls.push({
        path: url.pathname + url.search,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      const { status = 200, body = {} } = handler(url, init);
      return new Response(status === 204 ? null : JSON.stringify(body), { status });
    }),
  );
  return calls;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const component = (id: number) => ({
  id: `c${id}`,
  type_id: "mcu",
  name: `Comp ${id}`,
  price: 10,
  mass_g: 5,
  store: "Tienda",
  current_a: null,
  specs: { clock_mhz: 240 },
  stock: 1,
  archived: false,
});

describe("request", () => {
  it("returns null for 204 and throws ErrorApi with reason for business errors", async () => {
    fakeApi((url) =>
      url.pathname.endsWith("/ok")
        ? { status: 204 }
        : { status: 409, body: { detail: { reason: "version_stale", detail: "Consulta" } } },
    );
    await expect(request("/ok")).resolves.toBeNull();
    await expect(request("/bad")).rejects.toMatchObject({ status: 409, reason: "version_stale" });
  });

  it("sends JSON content type only when there is a body", async () => {
    const spy = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", spy);
    await request("/x");
    await request("/x", { method: "POST", body: "{}" });
    expect((spy.mock.calls[0][1].headers as Headers).has("Content-Type")).toBe(false);
    expect((spy.mock.calls[1][1].headers as Headers).get("Content-Type")).toBe("application/json");
  });
});

describe("catalog.list", () => {
  it("walks every page and maps API fields to the console model", async () => {
    const all = Array.from({ length: 3 }, (_, i) => component(i + 1));
    const calls = fakeApi((url) => {
      const offset = Number(url.searchParams.get("offset"));
      return { body: { items: all.slice(offset, offset + 2), total: 3, limit: 2, offset } };
    });
    const list = await api.catalog.list();
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ id: "c1", typeId: "mcu", mass: 5, price: 10 });
    expect(list[0].specs).toEqual({ mhz: 240 });
    expect(calls.map((c) => c.path)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("offset=0"),
        expect.stringContaining("offset=2"),
      ]),
    );
  });
});

describe("catalog.create", () => {
  it("posts English field names and translates specs to the API vocabulary", async () => {
    const calls = fakeApi(() => ({ status: 201, body: component(9) }));
    await api.catalog.create({
      typeId: "mcu",
      name: "ESP32",
      price: 48,
      mass: 9,
      store: "X",
      specs: { mhz: 240 },
      stock: 2,
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({
      type_id: "mcu",
      mass_g: 9,
      current_a: null,
      specs: { clock_mhz: 240 },
      stock: 2,
    });
  });
});

describe("robots", () => {
  it("creates a robot with snake_case fields", async () => {
    const calls = fakeApi(() => ({ status: 201, body: { id: "r1" } }));
    await api.robots.create({ name: "Flash", shortCode: "FL", type: "racer" });
    expect(calls[0].body).toEqual({
      name: "Flash",
      short_code: "FL",
      type: "racer",
      firmware: null,
    });
  });

  it("creates a version translating parts to component_id/quantity", async () => {
    const calls = fakeApi(() => ({ status: 201, body: { id: 1 } }));
    await api.robots.createVersion("r 1", {
      baseVersionId: null,
      note: "n",
      status: "current",
      parts: { mcu: { componentId: "c1", quantity: 1 } },
    });
    expect(calls[0].path).toBe("/api/robots/r%201/versions");
    expect(calls[0].body).toEqual({
      base_version_id: null,
      note: "n",
      status: "current",
      parts: { mcu: { component_id: "c1", quantity: 1 } },
    });
  });

  it("selection joins each robot with its current version and handles robots without one", async () => {
    fakeApi((url) => {
      if (url.pathname === "/api/robots")
        return {
          body: {
            items: [
              {
                id: "a",
                name: "A",
                short_code: "A",
                type: "racer",
                firmware: "1",
                current_version_id: 7,
                archived: false,
              },
              {
                id: "b",
                name: "B",
                short_code: "B",
                type: "racer",
                firmware: null,
                current_version_id: null,
                archived: false,
              },
            ],
            total: 2,
            limit: 200,
            offset: 0,
          },
        };
      return {
        body: {
          id: 7,
          robot_id: "a",
          label: "v3",
          date: "2026-10-01",
          note: "n",
          status: "current",
          parts: { mcu: { component_id: "c1", quantity: 2 } },
        },
      };
    });
    const robots = await api.robots.selection();
    expect(robots[0].versions[0]).toMatchObject({
      v: "v3",
      status: "current",
      parts: { mcu: { id: "c1", qty: 2 } },
    });
    expect(robots[1].versions[0].v).toBe("Sin versión");
  });
});

describe("runs", () => {
  const run = (id: number, number: number) => ({
    id,
    number,
    robot_id: "a",
    version_id: 7,
    setup_id: 1,
    profile_id: "club",
    controller_id: "pid",
    parameters: { kp: 1 },
    date: "2026-10-01T00:00:00Z",
    source: "sim",
    mode: "test",
    line: "black",
    battery_compensation: true,
    turbine_power_pct: 0,
    time_s: 10,
    finished: true,
    accumulated_error: 0.5,
    battery_v: 7.4,
    sectors_s: [4, 6],
    time_source: "finish",
    note: "",
    j: 11,
  });

  it("loads every page, removes duplicates and orders by run number", async () => {
    fakeApi((url) => {
      const offset = Number(url.searchParams.get("offset"));
      const items = [run(2, 2), run(1, 1), run(2, 2)].slice(offset, offset + 2);
      return { body: { items, total: 3, limit: 2, offset } };
    });
    const runs = await loadRunHistory([]);
    expect(runs.map((r) => r.n)).toEqual([1, 2]);
  });

  it("annotates a run with PATCH /runs/{id}", async () => {
    const calls = fakeApi(() => ({ body: run(5, 5) }));
    await annotateRun(5, "Buena");
    expect(calls[0]).toMatchObject({
      path: "/api/runs/5",
      method: "PATCH",
      body: { note: "Buena" },
    });
  });
});

describe("robot commands", () => {
  it("stores a setup, applies it and changes mode/line through the API", async () => {
    const calls = fakeApi(() => ({ status: 202, body: { seq: 1, id: 3 } }));
    await storeSetup("r1", 7, { controller: "pid", parameters: { kp: 1 } });
    await applyStoredSetup("r1", 3);
    await changeModeLine("r1", "mode", { mode: "competition" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /api/robots/r1/setups",
      "POST /api/robots/r1/setups/3/apply",
      "POST /api/robots/r1/mode-line/mode",
    ]);
    expect(calls[0].body).toMatchObject({
      version_id: 7,
      controller_id: "pid",
      parameters: { kp: 1 },
    });
  });

  it("surfaces device errors such as not_calibrated to the caller", async () => {
    fakeApi(() => ({
      status: 409,
      body: { detail: { reason: "not_calibrated", detail: "Calibra" } },
    }));
    await expect(api.command("start")).rejects.toMatchObject({ reason: "not_calibrated" });
  });
});

describe("login and health", () => {
  it("login posts credentials and health reads the environment", async () => {
    const calls = fakeApi((url) =>
      url.pathname.endsWith("login")
        ? { body: { access_token: "t" } }
        : { body: { status: "ok", database: "ok", environment: "test" } },
    );
    expect((await api.login("u", "p")).access_token).toBe("t");
    expect((await api.health()).database).toBe("ok");
    expect(calls[0].body).toEqual({ username: "u", password: "p" });
  });
});
