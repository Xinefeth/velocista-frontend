import { describe, expect, it } from "vitest";
import { ErrorApi, toApiError } from "@/infrastructure/http/api";
import { TRACK_REASONS, messageForType, pathOf } from "@/infrastructure/http/trackErrors";

describe("422 forma A: lista de Pydantic", () => {
  const body = {
    detail: [
      { type: "less_than_equal", loc: ["body", "points", 3, "radius"], msg: "Input should be less than or equal to 200", input: 250, ctx: { le: 200 } },
      { type: "missing", loc: ["body", "board", "width_cm"], msg: "Field required", input: { height_cm: 250 } },
      { type: "extra_forbidden", loc: ["body", "pts"], msg: "Extra inputs are not permitted", input: [] },
    ],
  };

  it("conserva todas las entradas con su ruta y un mensaje en español", () => {
    const e = toApiError(422, body);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e.status).toBe(422);
    expect(e.reason).toBe("validacion");
    expect(e.fields).toEqual([
      { path: "points[3].radius", message: "Debe ser como máximo 200" },
      { path: "board.width_cm", message: "Falta este dato" },
      { path: "pts", message: "Campo no permitido" },
    ]);
  });

  it("los llamadores existentes siguen recibiendo el mensaje genérico", () => {
    expect(toApiError(422, body).message).toBe("Hay datos inválidos en la solicitud");
  });

  it("un `type` desconocido usa el `msg` del servidor", () => {
    const e = toApiError(422, { detail: [{ type: "algo_raro", loc: ["body", "name"], msg: "Texto del servidor" }] });
    expect(e.fields).toEqual([{ path: "name", message: "Texto del servidor" }]);
  });

  it("tolera entradas incompletas y no deja pasar HTML", () => {
    const e = toApiError(422, { detail: [null, { loc: "x" }] });
    expect(e.fields).toEqual([
      { path: "", message: "Dato no válido" },
      { path: "", message: "Dato no válido" },
    ]);
  });

  it("arma rutas con índices y puntos", () => {
    expect(pathOf(["body", "zones", 0, "width"])).toBe("zones[0].width");
    expect(pathOf(["body", "points", 2, "x"])).toBe("points[2].x");
    expect(pathOf(["query", "limit"])).toBe("query.limit");
    expect(pathOf("no es lista")).toBe("");
  });

  it("traduce los tipos más comunes", () => {
    expect(messageForType("greater_than_equal", { ge: 50 }, "")).toBe("Debe ser como mínimo 50");
    expect(messageForType("greater_than", { gt: 0 }, "")).toBe("Debe ser mayor que 0");
    expect(messageForType("string_too_long", { max_length: 80 }, "")).toBe("Máximo 80 caracteres");
    expect(messageForType("too_long", { max_length: 500 }, "")).toBe("Máximo 500 elementos");
    expect(messageForType("too_short", { min_length: 2 }, "")).toBe("Mínimo 2 elementos");
    expect(messageForType("int_parsing", undefined, "")).toBe("Tipo de dato no válido");
    expect(messageForType("less_than_equal", undefined, "")).toBe("Debe ser como máximo ?");
  });
});

describe("422/404 forma B: {reason, detail}", () => {
  const reasons = [
    "track_not_found",
    "track_profile_unknown",
    "track_name_invalid",
    "track_points_count",
    "track_zones_count",
    "track_board_size",
    "track_radius_range",
    "track_coordinate_range",
    "track_zone_size",
    "track_zone_name",
    "track_not_finite",
    "track_length_invalid",
    "track_start_invalid",
    "track_closed_needs_three_points",
  ];

  it("están las 14 razones del contrato", () => {
    expect(Object.keys(TRACK_REASONS).sort()).toEqual([...reasons].sort());
  });

  it.each(reasons)("%s conserva la razón y muestra un mensaje en español", (reason) => {
    const e = toApiError(reason === "track_not_found" ? 404 : 422, {
      detail: { reason, detail: "English text from the server" },
    });
    expect(e.reason).toBe(reason);
    expect(e.message).toBe(TRACK_REASONS[reason].message);
    expect(e.message).not.toMatch(/server/);
    expect(e.fields).toHaveLength(TRACK_REASONS[reason].path ? 1 : 0);
  });

  it("track_profile_unknown apunta al selector de perfil", () => {
    const e = toApiError(422, { detail: { reason: "track_profile_unknown", detail: "Profile does not exist" } });
    expect(e.fields).toEqual([{ path: "profile_id", message: "El perfil elegido no existe" }]);
  });

  it("una razón que no es de pistas sigue como antes", () => {
    const e = toApiError(409, { detail: { reason: "conflict", detail: "Duplicado" } });
    expect(e.reason).toBe("conflict");
    expect(e.message).toBe("Duplicado");
    expect(e.fields).toBeUndefined();
  });
});

describe("otros cuerpos", () => {
  it("un cuerpo que no es JSON da un error genérico", () => {
    const e = toApiError(502, null);
    expect(e.reason).toBe("error_http");
    expect(e.message).toBe("La API respondió 502");
    expect(e.fields).toBeUndefined();
  });

  it("el formato plano {reason, detail} sigue funcionando", () => {
    const e = toApiError(401, { reason: "unauthorized", detail: "Sesión inválida" });
    expect(e.reason).toBe("unauthorized");
    expect(e.message).toBe("Sesión inválida");
  });
});
