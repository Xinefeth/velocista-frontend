// Navegación inferior para pantallas angostas (Protoripo.html).
import { useConsole, type Tab } from "@/application/state/ConsoleContext";
import { icons } from "@/ui/components/Icons";

const SECCIONES: [Tab, string][] = [
  ["control", "Control"],
  ["telemetry", "Telemetría"],
  ["runs", "Corridas"],
  ["map", "Mapa"],
  ["catalog", "Catálogo"],
  ["builder", "Armador"],
  ["rules", "Reglamento"],
  ["tracer", "Pistas"],
];

export function BottomNav() {
  const { tab, goTab, blOpen, setBlOpen } = useConsole();
  return (
    <nav className="bottom-nav" aria-label="Secciones">
      {SECCIONES.map(([id, titulo]) => (
        <button
          key={id}
          type="button"
          aria-current={tab === id ? "page" : undefined}
          onClick={() => goTab(id)}
        >
          {icons[id]}
          {titulo}
        </button>
      ))}
      <button type="button" onClick={() => setBlOpen(!blOpen)}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path d="M4 6h16M4 12h10M4 18h13" />
        </svg>
        Backlog
      </button>
    </nav>
  );
}
