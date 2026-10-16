import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, consoleUrl } from "@/infrastructure/config/urls";
import { api, request } from "@/infrastructure/http/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("deployment URLs", () => {
  it("keeps same-origin development URLs", () => {
    expect(apiUrl("/health", "/api")).toBe("/api/health");
    expect(consoleUrl({ protocol: "http:", host: "localhost:5173" }, "/api", "")).toBe(
      "ws://localhost:5173/ws/console",
    );
  });
  it("targets a separately deployed backend for both HTTP and WebSocket", () => {
    const base = "https://backend.example.com/api/";
    expect(apiUrl("/robots", base)).toBe("https://backend.example.com/api/robots");
    expect(consoleUrl({ protocol: "https:", host: "frontend.example.com" }, base, "")).toBe(
      "wss://backend.example.com/ws/console",
    );
  });
  it("preserves a reverse-proxy path prefix", () => {
    expect(consoleUrl({ protocol: "https:", host: "example.com" }, "/backend/api", "")).toBe(
      "wss://example.com/backend/ws/console",
    );
  });
  it("allows a dedicated WebSocket endpoint", () => {
    expect(
      consoleUrl(
        { protocol: "https:", host: "front.example.com" },
        "/api",
        "wss://live.example.com/ws/console",
      ),
    ).toBe("wss://live.example.com/ws/console");
  });
  it("rejects an insecure WebSocket from an HTTPS frontend", () => {
    expect(() =>
      consoleUrl(
        { protocol: "https:", host: "front.example.com" },
        "http://backend.example.com/api",
        "",
      ),
    ).toThrow("WebSocket seguro");
  });
  it("rejects accidental credentials in public build variables", () => {
    expect(() => apiUrl("/health", "https://user:secret@example.com/api")).toThrow(
      "sin credenciales",
    );
  });
});

describe("HTTP requests against the deployed contract", () => {
  it("uses the configured backend and sends base_version_id", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://backend.example.com/api");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 })));
    vi.stubGlobal("fetch", fetchMock);
    await api.robots.createVersion("robot", {
      baseVersionId: null,
      note: "Primera versión",
      status: "current",
      parts: {},
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://backend.example.com/api/robots/robot/versions",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      base_version_id: null,
      note: "Primera versión",
      status: "current",
      parts: {},
    });
  });
  it("merges Headers correctly without dropping Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await request("/events", {
      method: "POST",
      headers: new Headers({ "X-Request-ID": "qa" }),
      body: "{}",
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Request-ID")).toBe("qa");
  });
});
