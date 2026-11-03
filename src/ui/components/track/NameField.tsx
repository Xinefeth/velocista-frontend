// Nombre de la pista: se escribe libremente y se aplica con Enter o al salir del campo, para que una
// edición larga sea UN paso del historial y no uno por tecla. Escape cancela.
import { useEffect, useId, useRef, useState } from "react";
import { TRACK_LIMITS } from "@/domain/track/limits";

export function NameField({
  value,
  error,
  label = "Nombre de la pista",
  maxLength = TRACK_LIMITS.nameLength[1],
  onCommit,
}: {
  value: string;
  /** Texto de la etiqueta del campo. */
  label?: string;
  maxLength?: number;
  /** Error de guardado asociado al nombre (local o del servidor). */
  error?: string;
  onCommit: (name: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="inp"
        maxLength={maxLength}
        value={text}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          if (cancelled.current) {
            cancelled.current = false;
            setText(value);
            return;
          }
          if (text !== value) onCommit(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      {error && (
        <span id={`${id}-err`} className="note" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
