// Descripción y validación de campos de formulario (EN-06). Sin dependencias de React.
// Los formularios de gestión (registro de componentes, HU-02) describen sus campos con FieldDef
// y validan con validateFields; así cada tipo de componente reutiliza el mismo código.

export type TipoCampo = "text" | "number" | "select";

export interface FieldOption {
  valor: string;
  etiqueta: string;
}

type ClaveMensaje = "obligatorio" | "numero" | "entero" | "minimo" | "maximo" | "opcion";

export interface FieldDef {
  nombre: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  /** Valor mínimo permitido (incluido). */
  min?: number;
  /** El valor debe ser estrictamente mayor que este número (por ejemplo, precio > 0). */
  minExclusivo?: number;
  max?: number;
  /** Solo enteros (cantidades). */
  entero?: boolean;
  opciones?: readonly FieldOption[];
  marcador?: string;
  /** Mensajes propios para reemplazar los de por defecto. */
  mensajes?: Partial<Record<ClaveMensaje, string>>;
}

export type Valores = Record<string, string>;
export type Errores = Record<string, string>;

/** Lee un número escrito con punto o con coma decimal. Devuelve null si no es un número válido. */
export function parseNumber(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return null;
  return Number(t);
}

/** Valida obligatorios, números, rangos y opciones. Devuelve un mensaje por cada campo con error. */
export function validateFields(campos: readonly FieldDef[], valores: Valores): Errores {
  const errores: Errores = {};
  for (const c of campos) {
    const msg = (clave: ClaveMensaje, porDefecto: string) => c.mensajes?.[clave] ?? porDefecto;
    const valor = (valores[c.nombre] ?? "").trim();
    if (valor === "") {
      if (c.requerido) errores[c.nombre] = msg("obligatorio", "Este campo es obligatorio.");
      continue;
    }
    if (c.tipo === "number") {
      const n = parseNumber(valor);
      if (n === null) errores[c.nombre] = msg("numero", "Escribe un número válido.");
      else if (c.entero && !Number.isInteger(n))
        errores[c.nombre] = msg("entero", "Debe ser un número entero.");
      else if (c.minExclusivo !== undefined && n <= c.minExclusivo)
        errores[c.nombre] = msg("minimo", `Debe ser mayor que ${c.minExclusivo}.`);
      else if (c.min !== undefined && n < c.min)
        errores[c.nombre] = msg("minimo", `Debe ser mayor o igual a ${c.min}.`);
      else if (c.max !== undefined && n > c.max)
        errores[c.nombre] = msg("maximo", `Debe ser menor o igual a ${c.max}.`);
    } else if (c.tipo === "select" && c.opciones && !c.opciones.some((o) => o.valor === valor)) {
      errores[c.nombre] = msg("opcion", "Elige una opción de la lista.");
    }
  }
  return errores;
}
