// Interpretación de los errores 422/404 de la API de pistas (EN-28, Requirement 19).
// El backend devuelve DOS formas y no las cambia; el frontend las distingue con Array.isArray(detail):
//   A) lista de Pydantic: {"detail":[{"type","loc":["body","points",3,"radius"],"msg","input","ctx"?}]}
//   B) regla de dominio: {"detail":{"reason","detail"}}
// Los textos del usuario salen en español a partir de `type`/`reason`; `msg` solo es respaldo.

/** Error asociado a un campo (misma ruta que usa la validación local, p. ej. `points[3].radius`). */
export interface FieldError {
  path: string;
  message: string;
}

/** Une los elementos de `loc` sin el `body` inicial: ["body","points",3,"radius"] → points[3].radius. */
export function pathOf(loc: unknown): string {
  if (!Array.isArray(loc)) return "";
  const parts = loc[0] === "body" ? loc.slice(1) : loc;
  return parts.reduce<string>((acc, part) => {
    if (typeof part === "number") return `${acc}[${part}]`;
    return acc ? `${acc}.${String(part)}` : String(part);
  }, "");
}

const ctxNumber = (ctx: unknown, key: string): string => {
  const v = ctx && typeof ctx === "object" ? (ctx as Record<string, unknown>)[key] : undefined;
  return typeof v === "number" || typeof v === "string" ? String(v) : "?";
};

/** Texto en español para un error de Pydantic según su `type`; `msg` solo si no se reconoce. */
export function messageForType(type: unknown, ctx: unknown, msg: unknown): string {
  switch (type) {
    case "missing":
      return "Falta este dato";
    case "extra_forbidden":
      return "Campo no permitido";
    case "less_than_equal":
      return `Debe ser como máximo ${ctxNumber(ctx, "le")}`;
    case "less_than":
      return `Debe ser menor que ${ctxNumber(ctx, "lt")}`;
    case "greater_than_equal":
      return `Debe ser como mínimo ${ctxNumber(ctx, "ge")}`;
    case "greater_than":
      return `Debe ser mayor que ${ctxNumber(ctx, "gt")}`;
    case "string_too_long":
      return `Máximo ${ctxNumber(ctx, "max_length")} caracteres`;
    case "string_too_short":
      return `Mínimo ${ctxNumber(ctx, "min_length")} caracteres`;
    case "too_long":
      return `Máximo ${ctxNumber(ctx, "max_length")} elementos`;
    case "too_short":
      return `Mínimo ${ctxNumber(ctx, "min_length")} elementos`;
    case "finite_number":
      return "Debe ser un número finito";
    case "int_type":
    case "int_parsing":
    case "float_type":
    case "float_parsing":
    case "string_type":
    case "bool_type":
    case "list_type":
    case "dict_type":
      return "Tipo de dato no válido";
    default:
      return typeof msg === "string" && msg ? msg : "Dato no válido";
  }
}

/** Convierte la lista de la forma A en errores por campo; conserva todas las entradas. */
export function fieldErrorsFromList(detail: unknown[]): FieldError[] {
  return detail.map((item) => {
    const e = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return { path: pathOf(e.loc), message: messageForType(e.type, e.ctx, e.msg) };
  });
}

/** Razones de dominio de la forma B: mensaje en español y campo (si lo hay). */
export const TRACK_REASONS: Record<string, { message: string; path: string | null }> = {
  track_not_found: { message: "La pista ya no existe", path: null },
  track_profile_unknown: { message: "El perfil elegido no existe", path: "profile_id" },
  track_name_invalid: { message: "El nombre debe tener entre 1 y 80 caracteres", path: "name" },
  track_points_count: {
    message: "La cantidad de puntos no es válida (de 2 a 500)",
    path: "points",
  },
  track_zones_count: { message: "Hay demasiadas zonas (máximo 100)", path: "zones" },
  track_board_size: {
    message: "El tamaño del tablero no es válido (de 50 a 2000 cm por lado)",
    path: "board",
  },
  track_radius_range: { message: "Un radio está fuera de rango (de 0 a 200 cm)", path: "points" },
  track_coordinate_range: {
    message: "Una coordenada está fuera de rango (±10000 cm)",
    path: "points",
  },
  track_zone_size: { message: "El tamaño de una zona no es válido", path: "zones" },
  track_zone_name: {
    message: "El nombre de una zona es demasiado largo (máximo 80)",
    path: "zones",
  },
  track_not_finite: { message: "Hay un número no finito en la pista", path: null },
  track_length_invalid: { message: "El largo de la pista no es válido", path: "length_cm" },
  track_start_invalid: { message: "La salida no es válida", path: "start" },
  track_closed_needs_three_points: {
    message: "Un circuito cerrado necesita al menos 3 puntos",
    path: "closed",
  },
};

/** Error de dominio conocido para el campo `reason`, o `null` si no es de pistas. */
export function trackReason(reason: string): { message: string; path: string | null } | null {
  return TRACK_REASONS[reason] ?? null;
}
