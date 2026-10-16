// Barra lateral de navegación, igual a la del prototipo (Protoripo.html): grupos Robot y Gestión,
// más el botón de la capa del backlog.
import { useConsole, type Tab } from "@/application/state/ConsoleContext";
import { icons, Brand } from "@/ui/components/Icons";

const ROBOT: [Tab, string][] = [
  ["control", "Control"],
  ["telemetry", "Telemetría"],
  ["runs", "Corridas y optimización"],
  ["map", "Mapa de pista"],
];
const GESTION: [Tab, string][] = [
  ["catalog", "Catálogo de componentes"],
  ["builder", "Armador de robots"],
  ["rules", "Perfiles de reglamento"],
];

export function Rail() {
  const { tab, goTab, blOpen, setBlOpen } = useConsole();
  const boton = ([id, titulo]: [Tab, string]) => (
    <button
      key={id}
      type="button"
      className="nb"
      aria-label={titulo}
      aria-current={tab === id ? "page" : undefined}
      onClick={() => goTab(id)}
    >
      {icons[id]}
      <span className="tip">{titulo}</span>
    </button>
  );
  return (
    <nav className="rail" aria-label="Secciones">
      <div className="mark" aria-hidden="true">
        <Brand />
      </div>
      <span className="gl">Robot</span>
      {ROBOT.map(boton)}
      <span className="sep" />
      <span className="gl">Gestión</span>
      {GESTION.map(boton)}
      <div className="grow" />
      <button
        type="button"
        className="blbtn"
        aria-pressed={blOpen}
        title="Capa del backlog: IDs y alcance por sprint"
        onClick={() => setBlOpen(!blOpen)}
      >
        BACK
        <br />
        LOG
      </button>
    </nav>
  );
}
