/** Integration: System page + ConnectionProvider + health polling + console WebSocket (simulated). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { ConnectionProvider } from "@/application/state/ConnectionContext";
import { System } from "@/ui/pages/System";

class FakeSocket {
  static last: FakeSocket;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  close() {
    this.onclose?.();
  }
}

const health = (database: string) =>
  vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", database, environment: "test" })),
    );

beforeEach(() => vi.stubGlobal("WebSocket", FakeSocket));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("System page", () => {
  it("shows everything connected when API, database and websocket are up", async () => {
    vi.stubGlobal("fetch", health("ok"));
    render(
      <ConnectionProvider>
        <System />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText("Entorno · test")).toBeTruthy());
    act(() => FakeSocket.last.onopen?.());
    await waitFor(() => expect(screen.getByText("Listo para trabajar")).toBeTruthy());
    expect(screen.getAllByText("conectada")).toHaveLength(3);
  });

  it("explains how to fix the database when it is down", async () => {
    vi.stubGlobal("fetch", health("down"));
    render(
      <ConnectionProvider>
        <System />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText(/docker compose up/)).toBeTruthy());
    expect(screen.getByText("Revisa lo que falta")).toBeTruthy();
  });

  it("reports the API as down when the health request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(
      <ConnectionProvider>
        <System />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("sin conexión").length).toBeGreaterThan(0));
  });

  it("lists live websocket messages as they arrive", async () => {
    vi.stubGlobal("fetch", health("ok"));
    render(
      <ConnectionProvider>
        <System />
      </ConnectionProvider>,
    );
    expect(screen.getByText("Aún no llegan mensajes.")).toBeTruthy();
    act(() => {
      FakeSocket.last.onopen?.();
      FakeSocket.last.onmessage?.({
        data: JSON.stringify({
          type: "status",
          sender: "robot",
          data: { state: "ready" },
          seq: 1,
          ts: 1,
          received_ms: 1,
        }),
      });
    });
    await waitFor(() => expect(screen.getByText(/status ·/)).toBeTruthy());
  });
});
