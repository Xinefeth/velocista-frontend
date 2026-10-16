// Filtro de una sola opción con chips (.chips del prototipo).
import type { CSSProperties } from "react";

export interface ChipOption {
  valor: string;
  etiqueta: string;
  /** Cantidad de elementos de esta opción (se muestra pequeña). */
  cantidad?: number;
}

export interface ChipsFiltroProps {
  opciones: readonly ChipOption[];
  /** Valor elegido; null significa "Todos". */
  valor: string | null;
  alCambiar: (valor: string | null) => void;
  /** Nombre accesible del grupo de filtros. */
  etiqueta: string;
  etiquetaTodos?: string;
  cantidadTodos?: number;
  style?: CSSProperties;
}

export function FilterChips({
  opciones,
  valor,
  alCambiar,
  etiqueta,
  etiquetaTodos = "Todos",
  cantidadTodos,
  style,
}: ChipsFiltroProps) {
  return (
    <div className="chips" role="group" aria-label={etiqueta} style={style}>
      <button type="button" aria-pressed={valor === null} onClick={() => alCambiar(null)}>
        {etiquetaTodos} {cantidadTodos !== undefined && <small>{cantidadTodos}</small>}
      </button>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => alCambiar(o.valor)}
        >
          {o.etiqueta} {o.cantidad !== undefined && <small>{o.cantidad}</small>}
        </button>
      ))}
    </div>
  );
}
