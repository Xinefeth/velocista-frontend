// Campo numérico del inspector: se escribe libremente y se aplica con Enter o al salir del campo.
// Si el valor no es un número válido o está fuera de rango, se restaura el anterior y se marca el error.
import { useEffect, useId, useRef, useState } from "react";
import { fmt } from "@/domain/track/rules";

export function NumberField({
  label,
  value,
  unit,
  min,
  max,
  error,
  onCommit,
}: {
  label: string;
  /** Valor actual; `null` si varios objetos tienen valores distintos. */
  value: number | null;
  unit?: string;
  min?: number;
  max?: number;
  /** Error de guardado asociado a este campo (local o del servidor). */
  error?: string;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const shown = value === null ? "" : String(Math.round(value * 10) / 10).replace(".", ",");
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  /** Escape cancela: el `blur` que sigue no debe aplicar el texto escrito. */
  const cancelled = useRef(false);

  // Cuando cambia el valor del documento (arrastres, otros campos) y no se está escribiendo, el campo lo sigue.
  useEffect(() => {
    if (!focused.current) {
      setText(shown);
      setInvalid(false);
    }
  }, [shown]);

  const commit = () => {
    const raw = text.trim().replace(",", ".");
    const v = Number(raw);
    const outOfRange = (min !== undefined && v < min) || (max !== undefined && v > max);
    if (raw === "" || !Number.isFinite(v) || outOfRange) {
      setInvalid(true);
      setText(shown);
      return;
    }
    setInvalid(false);
    if (value === null || Math.abs(v - value) > 1e-9) onCommit(v);
  };

  const range =
    min !== undefined && max !== undefined
      ? ` (${fmt(min)} a ${fmt(max)}${unit ? " " + unit : ""})`
      : "";
  return (
    <div className="fld">
      <label htmlFor={id}>
        {label}
        {unit ? ` (${unit})` : ""}
      </label>
      <input
        id={id}
        className="inp m"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={value === null ? "varios" : undefined}
        aria-invalid={invalid || error ? "true" : undefined}
        aria-describedby={invalid || error ? `${id}-err` : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          if (cancelled.current) {
            cancelled.current = false;
            setText(shown);
            setInvalid(false);
            return;
          }
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      {(invalid || error) && (
        <span id={`${id}-err`} className="note" role="alert">
          {invalid ? `Valor no válido${range}.` : error}
        </span>
      )}
    </div>
  );
}
