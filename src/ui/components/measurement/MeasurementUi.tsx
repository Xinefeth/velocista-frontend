// Piezas de interfaz comunes a las vistas de Medición: semáforo, KPIs y encabezado de página,
// con el mismo marcado del prototipo (APAEC_Lab_consola_con_medicion.html).
import type { ReactNode } from "react";
import type { Tone } from "@/domain/measurement/labels";

export function Semaforo({
  tone,
  title,
  sub,
}: {
  tone?: Tone | null;
  title: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className={`semaforo ${tone ?? ""}`.trim()} role="status">
      <span className="dotl" />
      <div>
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

export interface Kpi {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: Tone | "purple" | "";
}

export function Kpis({ items, label }: { items: Kpi[]; label?: string }) {
  return (
    <div className="kpis" aria-label={label}>
      {items.map((k) => (
        <div key={k.label}>
          <div className="lbl">{k.label}</div>
          <div className={`v ${k.tone ?? ""}`.trim()}>
            {k.value}
            {k.unit && <small> {k.unit}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pagehead s12">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

/** Mensaje de error o de ayuda bajo un formulario (rol `alert` cuando es error). */
export function Hint({ text, error = false }: { text: string; error?: boolean }) {
  if (!text) return null;
  return (
    <p className={error ? "hint" : "note"} role={error ? "alert" : undefined}>
      {text}
    </p>
  );
}
