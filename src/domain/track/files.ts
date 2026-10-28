// Nombres de archivo de las exportaciones (igual que `baseName` del prototipo).

/** Nombre base: minúsculas, sin tildes, con guiones; `pista` si queda vacío. */
export function baseName(name: string): string {
  return (
    (name || "pista")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "pista"
  );
}

export type ExportKind = "svg" | "svg-zonas" | "json";

/** Nombre del archivo exportado: `<base>-1a1.svg`, `<base>-1a1-zonas.svg` o `<base>.json`. */
export function exportFilename(name: string, kind: ExportKind): string {
  const base = baseName(name);
  if (kind === "svg") return `${base}-1a1.svg`;
  if (kind === "svg-zonas") return `${base}-1a1-zonas.svg`;
  return `${base}.json`;
}
