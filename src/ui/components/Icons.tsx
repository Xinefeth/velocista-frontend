// Íconos tomados del prototipo (Prototipo.html).
import type { ReactElement } from "react";

export const Brand = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 34 34" fill="none">
    <path d="M3 26h6v-6h6v-6h6V8h6v6h4" stroke="#FF2D55" strokeWidth="2.4" strokeLinejoin="round" />
    <circle cx="29" cy="14" r="2.4" fill="#ECEEF4" />
  </svg>
);

export const icons: Record<string, ReactElement> = {
  control: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
    </svg>
  ),
  telemetry: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 13h4l3-7 4 12 3-5h4" />
    </svg>
  ),
  runs: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="13" r="7" />
      <path d="M12 13V9M10 3h4" />
    </svg>
  ),
  map: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 18c1-7 4-11 8-11 5 0 3 7 6 7" />
      <circle cx="5" cy="18" r="1.6" />
    </svg>
  ),
  catalog: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <path d="M16.5 13v7M13 16.5h7" />
    </svg>
  ),
  builder: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="6" y="7" width="12" height="10" rx="2" />
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="17" r="2.2" />
      <path d="M9 4h6M12 4v3" />
    </svg>
  ),
  rules: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};
