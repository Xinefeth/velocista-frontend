// Estructura de la consola (Protoripo.html): riel, franja superior, la vista activa, navegación
// móvil, capa del backlog, modales y avisos. La navegación la lleva el store (ConsoleContext).
import type { ReactElement } from "react";
import { Rail } from "@/ui/components/Rail";
import { Strip } from "@/ui/components/Strip";
import { BottomNav } from "@/ui/components/BottomNav";
import { BacklogLayer } from "@/ui/components/BacklogLayer";
import { Layers } from "@/ui/components/Layers";
import { Toast } from "@/ui/components/Toast";
import { useConsole, type Tab } from "@/application/state/ConsoleContext";
import { Control } from "@/ui/pages/Control";
import { Telemetry } from "@/ui/pages/Telemetry";
import { Runs } from "@/ui/pages/Runs";
import { MapView } from "@/ui/pages/MapView";
import { Catalog } from "@/ui/pages/Catalog";
import { Builder } from "@/ui/pages/Builder";
import { Rules } from "@/ui/pages/Rules";

const PAGINAS: Record<Tab, () => ReactElement> = {
  control: Control,
  telemetry: Telemetry,
  runs: Runs,
  map: MapView,
  catalog: Catalog,
  builder: Builder,
  rules: Rules,
};

export default function App() {
  const { tab } = useConsole();
  const Pagina = PAGINAS[tab];
  return (
    <>
      <div className="shell">
        <Rail />
        <div className="main">
          <Strip />
          <p className="simline only-v note" style={{ margin: "-6px 4px 10px" }}>
            Maqueta con datos simulados. Toca el enlace WiFi para simular una caída, la batería para
            cambiarla o el cronómetro de meta para desconectarlo.
          </p>
          <Pagina />
        </div>
      </div>
      <BottomNav />
      <BacklogLayer />
      <Layers />
      <Toast />
    </>
  );
}
