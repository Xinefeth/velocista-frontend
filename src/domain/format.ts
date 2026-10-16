// Utilidades de formato y cálculo, portadas del prototipo (Protoripo.html).

/** Redondea a `d` decimales como texto fijo. */
export const fmt = (v: number, d: number): string => Number(v).toFixed(d);

/** Limita `x` al rango [a, b]. */
export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

/** Formato de precio en soles. */
export const money = (v: number): string => `S/ ${Number(v).toFixed(2)}`;

/** Convierte una spec (número o texto) a número para los cálculos. */
export const num = (v: unknown): number => Number(v);

/** Copia profunda por serialización, como el `clone` del prototipo. */
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

/** Etiquetas visibles de los estados internos de una versión. */
export const VERSION_STATUS_LABEL: Record<string, string> = {
  current: "Actual",
  draft: "Borrador",
  previous: "Anterior",
  concept: "Concepto",
  discarded: "Descartada",
};
