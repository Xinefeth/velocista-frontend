// Glifos de severidad: la gravedad nunca depende solo del color (en la consola el acento rojo
// también es el color de error). Usan `currentColor`, así heredan el de `.tag.red` / `.tag.warn`.
import type { ReactElement } from "react";
import type { IssueSeverity } from "@/domain/track/types";

export function SeverityGlyph({ sev }: { sev: IssueSeverity }): ReactElement {
  return sev === "error" ? (
    <svg
      className="trk-glyph"
      aria-hidden="true"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="6" cy="6" r="5" />
      <path d="M6 3.2v3.4M6 8.4v.2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg
      className="trk-glyph"
      aria-hidden="true"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <path d="M6 1.4 11 10.4H1z" />
      <path d="M6 5v2.6M6 9v.1" strokeLinecap="round" />
    </svg>
  );
}

/** Etiqueta con glifo y texto: `.tag.red` para errores, `.tag.warn` para avisos. */
export function SeverityTag({ sev }: { sev: IssueSeverity }): ReactElement {
  return (
    <span className={sev === "error" ? "tag red" : "tag warn"}>
      <SeverityGlyph sev={sev} />
      {sev === "error" ? "Error" : "Aviso"}
    </span>
  );
}
