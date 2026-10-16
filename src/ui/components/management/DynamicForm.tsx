// Dibuja campos a partir de su descripción (FieldDef). Sirve para el registro de componentes (HU-02),
// donde los campos cambian según el tipo. No guarda estado: quien lo usa controla valores y errores.
import { Fragment } from "react";
import { InputField, SelectField } from "@/ui/components/management/Field";
import type { FieldDef, Errores, Valores } from "@/ui/components/management/validation";

export interface FormularioDinamicoProps {
  campos: readonly FieldDef[];
  valores: Valores;
  errores?: Errores;
  alCambiar: (nombre: string, valor: string) => void;
  /** Con 2 o 3 columnas usa las grillas .g2 y .g3 del prototipo; con 1 no agrega contenedor. */
  columnas?: 1 | 2 | 3;
}

export function DynamicForm({
  campos,
  valores,
  errores = {},
  alCambiar,
  columnas = 2,
}: FormularioDinamicoProps) {
  const Contenedor = columnas === 1 ? Fragment : "div";
  const props = columnas === 1 ? {} : { className: `g${columnas}` };
  return (
    <Contenedor {...props}>
      {campos.map((c) =>
        c.tipo === "select" ? (
          <SelectField
            key={c.nombre}
            etiqueta={c.etiqueta}
            opciones={c.opciones ?? []}
            value={valores[c.nombre] ?? ""}
            error={errores[c.nombre]}
            onChange={(e) => alCambiar(c.nombre, e.target.value)}
          />
        ) : (
          <InputField
            key={c.nombre}
            etiqueta={c.etiqueta}
            numerico={c.tipo === "number"}
            placeholder={c.marcador}
            value={valores[c.nombre] ?? ""}
            error={errores[c.nombre]}
            onChange={(e) => alCambiar(c.nombre, e.target.value)}
          />
        ),
      )}
    </Contenedor>
  );
}
