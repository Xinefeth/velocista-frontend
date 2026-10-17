import { describe, expect, it } from "vitest";
import { ErrorApi, toApiError } from "@/infrastructure/http/api";

describe("toApiError", () => {
  it("reads the standard business error { detail: { reason, detail } }", () => {
    const error = toApiError(409, { detail: { reason: "version_stale", detail: "Consulta" } });
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ status: 409, reason: "version_stale", message: "Consulta" });
  });

  it("reads the flat device format { reason, detail }", () => {
    expect(toApiError(503, { reason: "device_unavailable", detail: "Off" })).toMatchObject({
      reason: "device_unavailable",
    });
  });

  it("maps FastAPI validation arrays to a generic validation error", () => {
    expect(toApiError(422, { detail: [{ loc: ["body"], msg: "x" }] }).reason).toBe("validacion");
  });

  it("falls back to a generic http error for unknown bodies", () => {
    const error = toApiError(500, null);
    expect(error.reason).toBe("error_http");
    expect(error.message).toContain("500");
  });
});
