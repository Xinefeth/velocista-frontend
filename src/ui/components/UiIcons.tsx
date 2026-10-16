// Íconos de interfaz usados por los paneles, tomados del prototipo (Protoripo.html).
import type { ReactElement } from "react";

const s = (d: string, w = 2): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}>
    <path d={d} />
  </svg>
);

/** Íconos por severidad y uso general (equivalen al objeto ICO del prototipo). */
export const ICO: Record<string, ReactElement> = {
  ok: s("M5 12.5l4.5 4.5L19 7.5", 2.2),
  warn: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  ),
  bad: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  ),
  lock: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  ),
  info: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.5" />
    </svg>
  ),
  cap: s("M4 12h4l2-5 4 10 2-5h4", 1.8),
  velo: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M4 14h16l-2-5H7z" />
      <circle cx="7.5" cy="16.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
    </svg>
  ),
  sumo: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="5" y="6" width="14" height="11" rx="2" />
      <path d="M3 18h18" />
    </svg>
  ),
};

export const Chevron = (): ReactElement => s("M7 10l5 5 5-5");
export const Play = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
);
export const Stop = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);
export const Shield = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
export const Gate = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M5 20V5M19 20V5" />
    <path d="M5 9h14" strokeDasharray="2 2.5" />
  </svg>
);
export const Search = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);
export const Plus = (): ReactElement => s("M12 5v14M5 12h14", 2.2);
export const Close = (): ReactElement => s("M6 6l12 12M18 6L6 18");
export const Spark = (): ReactElement =>
  s("M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z", 1.8);
