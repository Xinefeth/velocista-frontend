// Campos de formulario del prototipo (.fld + .lbl + .inp) con error y accesibilidad.
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import type { FieldOption } from "@/ui/components/management/validation";

interface BaseCampo {
  etiqueta: string;
  /** Mensaje de error de este campo; se anuncia a lectores de pantalla. */
  error?: string;
}

function Envoltura({
  id,
  etiqueta,
  error,
  children,
}: BaseCampo & { id: string; children: ReactNode }) {
  return (
    <div className="fld">
      <label htmlFor={id} className="lbl">
        {etiqueta}
      </label>
      {children}
      {error && (
        <span id={`${id}-error`} className="hint warn" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export interface CampoEntradaProps
  extends BaseCampo,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  /** Cifras: teclado decimal y fuente monoespaciada (precio, masa, cantidades). */
  numerico?: boolean;
}

export function InputField({ etiqueta, error, numerico, ...entrada }: CampoEntradaProps) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error}>
      <input
        id={id}
        className={numerico ? "inp m" : "inp"}
        inputMode={numerico ? "decimal" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...entrada}
      />
    </Envoltura>
  );
}

export interface CampoSelectorProps
  extends BaseCampo,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className"> {
  opciones: readonly FieldOption[];
}

export function SelectField({ etiqueta, error, opciones, ...selector }: CampoSelectorProps) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error}>
      <select
        id={id}
        className="inp"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...selector}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}
