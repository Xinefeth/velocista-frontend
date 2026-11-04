// Página del celular (HU-37, HU-40, EN-35, SP-06, SP-07): datos reales de los sensores de este
// celular. Pestañas: 1. Conexión · 2. Calibrar · 3. Medir · 4. Error GPS · 5. Modelo.
// Las pestañas quedan montadas (solo se ocultan) para no cortar una medición al cambiar de pestaña.
import { useState } from "react";
import { usePhone } from "@/celular/context";
import { Connection } from "@/celular/tabs/Connection";
import { Calibrate } from "@/celular/tabs/Calibrate";
import { Measure } from "@/celular/tabs/Measure";
import { GpsError } from "@/celular/tabs/GpsError";
import { Model } from "@/celular/tabs/Model";

type TabId = "conexion" | "calibrar" | "medir" | "gps" | "modelo";
const TABS: [TabId, string][] = [
  ["conexion", "1. Conexión"],
  ["calibrar", "2. Calibrar"],
  ["medir", "3. Medir"],
  ["gps", "4. Error GPS"],
  ["modelo", "5. Modelo"],
];

export function PhoneApp() {
  const [tab, setTab] = useState<TabId>("conexion");
  const { toast } = usePhone();
  return (
    <main>
      <div className="brand">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 17l5-5 4 4 8-8" />
          <circle cx="20" cy="8" r="1.5" fill="currentColor" />
        </svg>
        <h1>Medición · Celular</h1>
      </div>
      <p className="hint">APAEC Lab · datos reales de los sensores de este celular</p>
      <nav id="tabs" aria-label="Pasos">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" aria-current={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "conexion"}>
        <Connection />
      </div>
      <div hidden={tab !== "calibrar"}>
        <Calibrate active={tab === "calibrar"} />
      </div>
      <div hidden={tab !== "medir"}>
        <Measure active={tab === "medir"} onOpenGpsTab={() => setTab("gps")} />
      </div>
      <div hidden={tab !== "gps"}>
        <GpsError active={tab === "gps"} />
      </div>
      <div hidden={tab !== "modelo"}>
        <Model active={tab === "modelo"} />
      </div>
      <div className={`toast ${toast ? "on" : ""}`.trim()} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  );
}
