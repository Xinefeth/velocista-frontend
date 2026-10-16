// Pestañas del prototipo (.tabs) con navegación por teclado.
import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  etiqueta: ReactNode;
  /** Alcance por sprint para la capa del backlog (data-sprint). */
  sprint?: string;
}

export interface PestanasProps {
  pestanas: readonly TabItem[];
  activa: string;
  alCambiar: (id: string) => void;
  /** Nombre accesible del grupo de pestañas. */
  etiqueta: string;
  style?: CSSProperties;
}

export function Tabs({ pestanas, activa, alCambiar, etiqueta, style }: PestanasProps) {
  const botones = useRef<Array<HTMLButtonElement | null>>([]);

  function alTeclear(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const total = pestanas.length;
    let destino = -1;
    if (e.key === "ArrowRight") destino = (indice + 1) % total;
    else if (e.key === "ArrowLeft") destino = (indice - 1 + total) % total;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = total - 1;
    if (destino < 0) return;
    e.preventDefault();
    alCambiar(pestanas[destino].id);
    botones.current[destino]?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label={etiqueta} style={style}>
      {pestanas.map((p, i) => (
        <button
          key={p.id}
          ref={(el) => {
            botones.current[i] = el;
          }}
          type="button"
          role="tab"
          aria-selected={p.id === activa}
          tabIndex={p.id === activa ? 0 : -1}
          data-sprint={p.sprint}
          onClick={() => alCambiar(p.id)}
          onKeyDown={(e) => alTeclear(e, i)}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );
}
