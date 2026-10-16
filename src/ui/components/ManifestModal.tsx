// Modal del manifiesto del robot (EN-02): lo que el robot envía al conectarse. Del prototipo.
import { useConsole } from "@/application/state/ConsoleContext";
import { Close } from "@/ui/components/UiIcons";
import { manifest, manifestPanels, robotById } from "@/domain/rules";

export function ManifestModal() {
  const c = useConsole();
  const r = c.manifestId ? robotById(c.robots, c.manifestId) : null;
  const abierto = !!r;
  const m = r ? manifest(r, c.catalog, c.applied.controller, c.comp) : null;
  const panels = m ? manifestPanels(m) : [];
  const json = m ? JSON.stringify(m, null, 2) : "";
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(json);
      c.showToast("JSON copiado.");
    } catch {
      c.showToast("No se pudo copiar.");
    }
  };
  return (
    <div
      className={`modal ${abierto ? "on" : ""}`}
      role="dialog"
      aria-modal={abierto}
      aria-label="Manifiesto del robot"
      aria-hidden={!abierto}
    >
      {r && (
        <>
          <div className="dh">
            <div>
              <span className="lbl">Contrato de mensajes · EN-02</span>
              <h3>Manifiesto · {r.name}</h3>
            </div>
            <button type="button" className="x" aria-label="Cerrar" onClick={c.closeManifest}>
              <Close />
            </button>
          </div>
          <div className="mb">
            <p className="note" style={{ margin: 0 }}>
              El robot lo envía al conectarse. La consola arma sus paneles y el panel Setup a partir
              de este mensaje.
            </p>
            <p className="sub" style={{ margin: "12px 0 6px" }}>
              Paneles del robot
            </p>
            <div
              aria-label="Paneles del robot"
              style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
            >
              {panels.map((panel) => (
                <span key={panel.id} className="tag">
                  {panel.nombre}
                </span>
              ))}
              {panels.length === 0 && <span>Sin dispositivos declarados.</span>}
            </div>
            <pre className="json" style={{ marginTop: 12 }}>
              {json}
            </pre>
          </div>
          <div className="mf">
            <button type="button" className="sb" onClick={copiar}>
              Copiar JSON
            </button>
            <button type="button" className="sb red" onClick={c.closeManifest}>
              Listo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
