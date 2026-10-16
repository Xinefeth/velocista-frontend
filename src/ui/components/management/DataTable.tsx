// Tabla genérica del prototipo (.table > table.ct): encabezado, filas clicables y estado vacío.
import type { KeyboardEvent, ReactNode } from "react";

export interface Column<T> {
  id: string;
  encabezado: string;
  /** Qué se dibuja en la celda de esta columna para una fila. */
  celda: (fila: T) => ReactNode;
  /** Alinea a la derecha (cifras: precio, masa, cantidades). */
  derecha?: boolean;
  /** Clases extra de la celda del prototipo: "nm" (nombre), "sp" (detalle), "m" (monoespaciada). */
  clase?: string;
}

export interface TablaDatosProps<T> {
  columnas: readonly Column<T>[];
  filas: readonly T[];
  /** Identificador estable de cada fila. */
  clave: (fila: T) => string;
  /** Nombre accesible de la tabla. */
  etiqueta: string;
  /** Si se pasa, cada fila es clicable y se activa también con Enter o Espacio. */
  alHacerClic?: (fila: T) => void;
  /** Mensaje cuando no hay filas. */
  vacio?: ReactNode;
  /** Ancho mínimo antes de que aparezca el desplazamiento horizontal. */
  anchoMinimo?: number;
}

const unir = (...partes: Array<string | false | undefined>) =>
  partes.filter(Boolean).join(" ") || undefined;

export function DataTable<T>({
  columnas,
  filas,
  clave,
  etiqueta,
  alHacerClic,
  vacio = "No hay datos para mostrar.",
  anchoMinimo,
}: TablaDatosProps<T>) {
  function alTeclear(e: KeyboardEvent<HTMLTableRowElement>, fila: T) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      alHacerClic?.(fila);
    }
  }

  return (
    <div className="table">
      <table
        className="ct"
        aria-label={etiqueta}
        style={anchoMinimo ? { minWidth: anchoMinimo } : undefined}
      >
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.id} scope="col" className={c.derecha ? "r" : undefined}>
                {c.encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={columnas.length} className="empty" style={{ padding: "18px 10px" }}>
                {vacio}
              </td>
            </tr>
          ) : (
            filas.map((fila) => (
              <tr
                key={clave(fila)}
                tabIndex={alHacerClic ? 0 : undefined}
                onClick={alHacerClic ? () => alHacerClic(fila) : undefined}
                onKeyDown={alHacerClic ? (e) => alTeclear(e, fila) : undefined}
              >
                {columnas.map((c) => (
                  <td key={c.id} className={unir(c.clase, c.derecha && "r")}>
                    {c.celda(fila)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
