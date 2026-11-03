// Menú contextual del plano. Usa los botones de la consola (`.sb`, `.sb.ghost`) y los campos `.inp`;
// se cierra con Escape, al hacer clic fuera o al elegir una acción.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MenuItem } from "@/ui/components/track/contextItems";

function FieldRow({
  item,
  onDone,
}: {
  item: Extract<MenuItem, { kind: "field" }>;
  onDone: () => void;
}) {
  const [text, setText] = useState(String(item.value).replace(".", ","));
  const read = () => {
    const v = Number(text.trim().replace(",", "."));
    return Number.isFinite(v) ? v : null;
  };
  const apply = (run: (v: number) => void) => {
    const v = read();
    if (v === null) return;
    onDone();
    run(v);
  };
  const buttons = item.buttons ?? [{ text: "Aplicar", title: item.label, run: item.run }];
  return (
    <div className="trk-ctx-field">
      <span>{item.label}</span>
      <input
        className="inp m"
        inputMode="decimal"
        aria-label={item.label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") apply(item.run);
          else if (e.key === "Escape") onDone();
        }}
      />
      <em>{item.unit}</em>
      {buttons.map((b) => (
        <button
          key={b.text}
          type="button"
          className="sb"
          title={b.title}
          onClick={() => apply(b.run)}
        >
          {b.text}
        </button>
      ))}
    </div>
  );
}

export function ContextMenu({
  items,
  x,
  y,
  onClose,
}: {
  items: MenuItem[];
  /** Posición pedida en la ventana; se ajusta para que el menú no se salga. */
  x: number;
  y: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
  }, [x, y, items]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="trk-ctx"
      role="menu"
      aria-label="Menú del plano"
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {items.map((item, i) => {
        if (item.kind === "header")
          return (
            <div key={i} className="trk-ctx-hd">
              {item.label}
            </div>
          );
        if (item.kind === "separator") return <hr key={i} />;
        if (item.kind === "action")
          return (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`sb ghost trk-ctx-item${item.danger ? " danger" : ""}`}
              onClick={() => {
                onClose();
                item.run();
              }}
            >
              <span>{item.label}</span>
              {item.kbd && <kbd>{item.kbd}</kbd>}
            </button>
          );
        if (item.kind === "field") return <FieldRow key={i} item={item} onDone={onClose} />;
        return (
          <div key={i} className="trk-ctx-field" role="group" aria-label={item.label}>
            <span>{item.label}</span>
            {item.buttons.map((b) => (
              <button
                key={b.text}
                type="button"
                className="sb"
                title={b.title}
                onClick={() => {
                  onClose();
                  b.run();
                }}
              >
                {b.text}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
