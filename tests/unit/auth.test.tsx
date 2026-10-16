import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api, request } from "@/infrastructure/http/api";
import { accessToken, AUTH_EVENT, setAccessToken, socketUrl } from "@/infrastructure/config";
import { AuthGate } from "@/ui/components/AuthGate";

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("authenticated backend", () => {
  it("adds the session token to REST requests", async () => {
    setAccessToken("qa-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    await request("/robots");
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe(
      "Bearer qa-token",
    );
  });
  it("clears an expired token and requests login on HTTP 401", async () => {
    setAccessToken("expired");
    const onAuth = vi.fn();
    window.addEventListener(AUTH_EVENT, onAuth);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }),
        ),
    );
    try {
      await expect(request("/robots")).rejects.toMatchObject({ status: 401 });
      expect(accessToken()).toBeNull();
      expect(onAuth).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(AUTH_EVENT, onAuth);
    }
  });
  it("authenticates the console websocket on the configured backend", () => {
    setAccessToken("qa-token");
    const url = new URL(
      socketUrl(
        { protocol: "https:", host: "front.example.com" },
        "https://back.example.com/api",
        "",
      ),
    );
    expect(url.origin).toBe("wss://back.example.com");
    expect(url.searchParams.get("token")).toBe("qa-token");
  });
  it("returns to the console after successful login", async () => {
    vi.spyOn(api, "login").mockResolvedValue({ access_token: "new-token" });
    render(
      <AuthGate>
        <p>Consola conectada</p>
      </AuthGate>,
    );
    act(() => window.dispatchEvent(new Event(AUTH_EVENT)));
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "example" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByText("Consola conectada")).toBeTruthy());
    expect(accessToken()).toBe("new-token");
  });
});
