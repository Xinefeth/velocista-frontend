import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { api, request } from "@/infrastructure/http/api";
import { AUTH_EVENT, accessToken, setAccessToken } from "@/infrastructure/config";
import { AuthGate } from "@/ui/components/AuthGate";
import { listenConsole } from "@/infrastructure/realtime/ws";

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("sends the authenticated session token without unnecessary preflight headers on public GET", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await request("/health");
  expect(fetch.mock.calls[0][1].headers.has("Content-Type")).toBe(false);
  setAccessToken("test-session-token");
  await request("/robots");
  expect(fetch.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer test-session-token");
});

it("expires rejected sessions and asks for login", async () => {
  const required = vi.fn();
  window.addEventListener(AUTH_EVENT, required);
  setAccessToken("expired");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
  await expect(request("/robots")).rejects.toMatchObject({ status: 401 });
  expect(accessToken()).toBeNull();
  expect(required).toHaveBeenCalledOnce();
  window.removeEventListener(AUTH_EVENT, required);
});

it("shows the login form when a protected request requires authentication", () => {
  render(
    <AuthGate>
      <p>Console</p>
    </AuthGate>,
  );
  act(() => window.dispatchEvent(new Event(AUTH_EVENT)));
  expect(screen.getByLabelText("Usuario")).toBeTruthy();
  expect(screen.getByLabelText("Contraseña")).toBeTruthy();
  expect(screen.queryByText("Console")).toBeNull();
});

it("authenticates WebSocket console with the current session", () => {
  const urls: string[] = [];
  class Socket {
    constructor(url: string) {
      urls.push(url);
    }
    close() {}
  }
  vi.stubGlobal("WebSocket", Socket);
  setAccessToken("abc+/=");
  const subscription = listenConsole(vi.fn(), vi.fn());
  expect(new URL(urls[0]).searchParams.get("token")).toBe("abc+/=");
  subscription.close();
});

it("translates component specs to the English backend schema and back", async () => {
  const fetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    return Promise.resolve(new Response(JSON.stringify({ ...body, id: "c1" })));
  });
  vi.stubGlobal("fetch", fetch);
  const result = await api.catalog.create({
    typeId: "motor",
    name: "Motor",
    price: 1,
    mass: 2,
    store: "Club",
    specs: { rpm: 100, red: 30 },
    stock: 1,
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body as string).specs).toEqual({
    no_load_rpm: 100,
    gear_ratio: 30,
  });
  expect(result.specs).toEqual({ rpm: 100, red: 30 });
});
