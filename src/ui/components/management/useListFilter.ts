// Búsqueda por texto y filtro por categoría para una lista en memoria (HU-01).
import { useMemo, useState } from "react";

/** Quita tildes y pasa a minúsculas para que "bateria" encuentre "Batería". */
export function normalizeText(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface OpcionesFiltroLista<T> {
  /** Texto en el que se busca (nombre, tipo, especificaciones…). */
  texto: (item: T) => string;
  /** Categoría del elemento para el filtro de chips (por ejemplo, el tipo de componente). */
  categoria?: (item: T) => string;
}

/**
 * Filtra `items` por texto y por categoría. Los conteos por categoría salen de la lista completa,
 * como en el prototipo. Pasa funciones estables (definidas fuera del componente).
 */
export function useListFilter<T>(items: readonly T[], opciones: OpcionesFiltroLista<T>) {
  const { texto, categoria } = opciones;
  const [consulta, setConsulta] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const conteos = useMemo(() => {
    const mapa: Record<string, number> = {};
    if (categoria) for (const it of items) mapa[categoria(it)] = (mapa[categoria(it)] ?? 0) + 1;
    return mapa;
  }, [items, categoria]);

  const filtradas = useMemo(() => {
    const q = normalizeText(consulta);
    return items.filter(
      (it) =>
        (categoria === undefined ||
          categoriaActiva === null ||
          categoria(it) === categoriaActiva) &&
        (q === "" || normalizeText(texto(it)).includes(q)),
    );
  }, [items, consulta, categoriaActiva, texto, categoria]);

  return {
    consulta,
    setConsulta,
    categoria: categoriaActiva,
    setCategoria: setCategoriaActiva,
    filtradas,
    conteos,
  };
}
