// Exportaciones: SVG 1:1 (imprenta), SVG con zonas marcadas, PNG del plano y JSON; y la importación de JSON.
// «SVG con cotas» NO existe: es una decisión pendiente del PO (pregunta abierta 3).
import type { ExportKind } from "@/domain/track/files";
import { ImportButton } from "@/ui/components/track/ImportButton";

const OPTIONS: { kind: ExportKind; label: string; title: string }[] = [
  { kind: "svg", label: "SVG 1:1", title: "Plano a escala real para imprimir, negro sobre blanco" },
  {
    kind: "svg-zonas",
    label: "SVG con zonas",
    title: "Igual que el SVG 1:1 pero con las zonas prohibidas marcadas",
  },
  {
    kind: "png",
    label: "PNG",
    title: "Imagen del plano con título y resumen, con los colores de la consola",
  },
  { kind: "json", label: "JSON", title: "Datos de la pista" },
];

export function ExportMenu({
  disabled,
  message,
  onExport,
  onImport,
}: {
  disabled: boolean;
  message: string;
  onExport: (kind: ExportKind) => void;
  /** Se llama con el archivo JSON elegido para importar. */
  onImport: (file: File) => void;
}) {
  return (
    <>
      <div className="trk-menu" role="group" aria-label="Exportar">
        {OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            className="sb"
            title={o.title}
            disabled={disabled}
            onClick={() => onExport(o.kind)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="trk-menu" role="group" aria-label="Importar">
        <ImportButton onFile={onImport} />
      </div>
      <p className="note" role="status">
        {message}
      </p>
    </>
  );
}
