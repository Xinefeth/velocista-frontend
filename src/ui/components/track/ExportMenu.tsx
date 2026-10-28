// Exportaciones disponibles en S2: SVG 1:1 (imprenta), SVG con zonas marcadas y JSON.
// "SVG con cotas" y PNG llegan después (decisión pendiente del PO / siguiente fase).
import type { ExportKind } from "@/domain/track/files";

const OPTIONS: { kind: ExportKind; label: string; title: string }[] = [
  { kind: "svg", label: "SVG 1:1", title: "Plano a escala real para imprimir, negro sobre blanco" },
  {
    kind: "svg-zonas",
    label: "SVG con zonas",
    title: "Igual que el SVG 1:1 pero con las zonas prohibidas marcadas",
  },
  { kind: "json", label: "JSON", title: "Datos de la pista" },
];

export function ExportMenu({
  disabled,
  message,
  onExport,
}: {
  disabled: boolean;
  message: string;
  onExport: (kind: ExportKind) => void;
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
      <p className="note" role="status">
        {message}
      </p>
    </>
  );
}
