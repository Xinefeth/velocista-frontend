import { describe, expect, it } from "vitest";
import { apiUrl, consoleUrl } from "@/infrastructure/config/urls";

describe("apiUrl", () => {
  it("defaults to the same-origin /api prefix", () => {
    expect(apiUrl("/robots", undefined)).toMatch(/\/robots$/);
  });
  it("joins base and path without duplicated slashes", () => {
    expect(apiUrl("/robots", "https://api.example.com/api/")).toBe(
      "https://api.example.com/api/robots",
    );
  });
  it("rejects bases with credentials or query strings", () => {
    expect(() => apiUrl("/x", "https://user:pw@api.example.com")).toThrow();
    expect(() => apiUrl("/x", "https://api.example.com?a=1")).toThrow();
  });
});

describe("consoleUrl", () => {
  it("derives ws:// from an http origin", () => {
    expect(consoleUrl({ protocol: "http:", host: "localhost:5173" }, "/api", "")).toBe(
      "ws://localhost:5173/ws/console",
    );
  });
  it("derives wss:// from an https origin", () => {
    expect(consoleUrl({ protocol: "https:", host: "app.example.com" }, "/api", "")).toBe(
      "wss://app.example.com/ws/console",
    );
  });
  it("refuses insecure websockets from an https console", () => {
    expect(() =>
      consoleUrl({ protocol: "https:", host: "app.example.com" }, "/api", "ws://x.example.com/ws"),
    ).toThrow(/wss/);
  });
});
