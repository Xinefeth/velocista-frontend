// Nombres en español de las rutas de campo que devuelven la validación local y el servidor
// (`points[3].radius`, `board.width_cm`…), para mostrar los errores al guardar.

const FIXED: Record<string, string> = {
  name: "Nombre",
  board: "Tablero",
  "board.width_cm": "Ancho del tablero",
  "board.height_cm": "Alto del tablero",
  points: "Puntos",
  zones: "Zonas",
  closed: "Circuito cerrado",
  start: "Salida",
  "start.edge": "Tramo de salida",
  "start.t": "Posición de la salida",
  profile_id: "Perfil",
  length_cm: "Largo",
  perimeter_cm: "Perímetro",
  area_cm2: "Área",
};

const POINT_FIELDS: Record<string, string> = { x: "X", y: "Y", radius: "radio", gap: "corte" };
const ZONE_FIELDS: Record<string, string> = {
  x: "X",
  y: "Y",
  width: "ancho",
  height: "alto",
  name: "nombre",
};

/** «Punto 4 · radio», «Ancho del tablero»… Si la ruta no se conoce, se devuelve tal cual. */
export function describePath(path: string): string {
  if (FIXED[path]) return FIXED[path];
  const point = /^points\[(\d+)\](?:\.(\w+))?$/.exec(path);
  if (point) {
    const field = point[2] ? POINT_FIELDS[point[2]] : undefined;
    return `Punto ${Number(point[1]) + 1}${field ? ` · ${field}` : ""}`;
  }
  const zone = /^zones\[(\d+)\](?:\.(\w+))?$/.exec(path);
  if (zone) {
    const field = zone[2] ? ZONE_FIELDS[zone[2]] : undefined;
    return `Zona ${Number(zone[1]) + 1}${field ? ` · ${field}` : ""}`;
  }
  return path || "Pista";
}

/** Primer mensaje de error cuyo campo es `path` o cuelga de él (`board` cubre `board.width_cm`). */
export function messageFor(
  fields: { path: string; message: string }[],
  ...paths: string[]
): string | undefined {
  return fields.find((f) =>
    paths.some((p) => f.path === p || f.path.startsWith(`${p}.`) || f.path.startsWith(`${p}[`)),
  )?.message;
}
