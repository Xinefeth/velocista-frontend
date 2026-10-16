// Franja superior de la consola (Protoripo.html): selector de robot con manifiesto, batería y
// enlace simulados, tiempos de vuelta, fuente de datos (EN-05) y chip del perfil de reglamento.
import { useEffect, useMemo, useRef, useState } from "react";
import { useConsole } from "@/application/state/ConsoleContext";
import { useOptionalConnection } from "@/application/state/ConnectionContext";
import { robotStatusFromMessages } from "@/domain/robotStatus";
import { complies, currentVersion, facts } from "@/domain/rules";
import { clamp, fmt } from "@/domain/format";
import { themeColors } from "@/domain/canvas";
import { Chevron, Shield } from "@/ui/components/UiIcons";
import { PbiChip } from "@/ui/components/Card";

const TITULOS: Record<string, [string, string]> = {
  catalog: ["Catálogo de componentes", "Specs reales, precios e inventario del club"],
  builder: [
    "Armador de robots",
    "Arma un robot desde el catálogo: costo, masa, compatibilidad y reglamento",
  ],
  rules: ["Perfiles de reglamento", "Reglas como datos: qué permite cada competencia y categoría"],
};

export function Strip() {
  const c = useConsole();
  // HU-14: estado real del robot por WebSocket; si hay robot enlazado, la barra usa sus
  // valores (batería, enlace, lazo, estado); si no, cae a los datos simulados.
  const conexion = useOptionalConnection();
  const live = useMemo(
    () => robotStatusFromMessages(conexion?.mensajes ?? []),
    [conexion?.mensajes],
  );
  const useReal = live.connected && live.state != null;
  const connected = useReal ? live.connected : c.connected;
  const vbat = useReal && live.battery != null ? live.battery : c.vbat;
  const [menu, setMenu] = useState(false);
  const rsel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => {
      if (!rsel.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("click", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  // Frescura del enlace en segundos (visible): mientras hay enlace cuenta desde la última
  // actualización —nunca pasa de ~1 s— y al perderlo cuenta desde la caída (criterios HU-14).
  const [ahora, setAhora] = useState(() => Date.now());
  const updStampRef = useRef(Date.now());
  const prevLinkRef = useRef(c.link);
  const dropStampRef = useRef<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  if (connected) {
    // c.link es un objeto nuevo en cada actualización del enlace; su identidad marca el refresco.
    if (prevLinkRef.current !== c.link) {
      prevLinkRef.current = c.link;
      updStampRef.current = Date.now();
    }
    dropStampRef.current = null;
  } else if (dropStampRef.current == null) {
    dropStampRef.current = Date.now();
  }
  const edadEnlace = (ahora - updStampRef.current) / 1000;
  const edadCaida = (ahora - (dropStampRef.current ?? ahora)) / 1000;

  const col = themeColors();
  const fins = c.laps.filter((l) => l.fin);
  const best = fins.length ? Math.min(...fins.map((l) => l.t)) : null;
  let gap = "—";
  if (best != null && c.lastLap?.fin) {
    const g = c.lastLap.t - best;
    gap = g <= 1e-9 ? "Mejor" : `+${fmt(g, 3)}`;
  }
  const rec = c.mapRef.current.recording;
  const liveTxt = !connected
    ? "SIN ENLACE"
    : c.running
      ? rec
        ? "MAPEANDO · EN VIVO"
        : "EN PISTA · EN VIVO"
      : c.source === "sim"
        ? "EN REPOSO · SIMULADO"
        : "EN REPOSO";

  const pct = clamp((vbat - 6.8) / (8.4 - 6.8), 0, 1);
  const batColor = pct < 0.3 ? col["--red"] : pct < 0.55 ? col["--yellow"] : col["--green"];
  const ok = complies(c.robot, c.profile, c.catalog);
  const titulo = TITULOS[c.tab];

  return (
    <header className="strip">
      <div className="rsel only-v" ref={rsel} data-pbi="HU-13" data-sprint="1">
        <PbiChip pbi="HU-13" sprint="1" inl />
        <button
          type="button"
          className="rbtn"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          <b>
            <span>{c.robot.name}</span>
            <Chevron />
          </b>
          <span className={`live ${!c.running || !connected ? "off" : ""}`}>
            <i />
            <span>{liveTxt}</span>
          </span>
        </button>
        {menu && (
          <div className="menu" role="menu">
            {c.robots.map((r) => {
              const v = currentVersion(r),
                f = facts(v.parts, c.catalog),
                esVelo = r.type === "racer",
                cumple = complies(r, c.profile, c.catalog);
              return (
                <button
                  key={r.id}
                  type="button"
                  className="mi"
                  role="menuitemradio"
                  aria-checked={r.id === c.robotId}
                  disabled={!esVelo}
                  onClick={() => {
                    setMenu(false);
                    c.selectRobot(r.id);
                  }}
                >
                  <b>
                    {r.name}{" "}
                    <span className="dimt m" style={{ fontSize: 11, fontWeight: 400 }}>
                      {v.v}
                    </span>
                  </b>
                  <span className={`tag ${cumple ? "good" : "red"}`} style={{ fontSize: 9 }}>
                    {cumple ? "Cumple" : "No cumple"}
                  </span>
                  <small>
                    {esVelo
                      ? `${f.mcu ? f.mcu.name.split(" ")[0] : "—"} · ${f.sensors} sensores${f.enc ? " · encoders" : ""}${
                          f.turbine ? " · turbina" : ""
                        } · ${r.fw ? "firmware " + r.fw : "sin firmware: solo simulado"}`
                      : "Sin consola para MiniSumo todavía"}
                  </small>
                </button>
              );
            })}
            <hr />
            <button
              type="button"
              className="mi"
              onClick={() => {
                setMenu(false);
                c.openManifest(c.robotId);
              }}
            >
              <b>Ver manifiesto</b>
              <small>Lo que el robot envía al conectarse (EN-02)</small>
            </button>
            <button
              type="button"
              className="mi"
              onClick={() => {
                setMenu(false);
                c.openInBuilder(c.robotId);
              }}
            >
              <b>Abrir en el armador</b>
              <small>Parts, costo y versiones</small>
            </button>
          </div>
        )}
      </div>

      <div className="ptitle only-g">
        <h1>{titulo ? titulo[0] : "Gestión"}</h1>
        <p>{titulo ? titulo[1] : ""}</p>
      </div>

      <div className="stats only-v" data-pbi="HU-14" data-sprint="1">
        <PbiChip pbi="HU-14" sprint="1" inl />
        <button
          type="button"
          className="st"
          title="Toca para simular un cambio de batería"
          onClick={c.changeBattery}
        >
          <span className="lbl">Batería</span>
          <span className="v">
            <span className="batbar">
              <i style={{ width: `${pct * 100}%`, background: batColor }} />
            </span>
            <span>{fmt(vbat, 2)} V</span>
          </span>
        </button>
        <button
          type="button"
          className="st"
          title="Toca para simular una caída del enlace"
          onClick={c.toggleConnected}
        >
          <span className="lbl">Enlace WiFi</span>
          <span className="v" style={{ color: connected ? "" : col["--red-hi"] }}>
            {!connected ? (
              <>
                Sin enlace <small>· {fmt(edadCaida, 1)} s</small>
              </>
            ) : useReal ? (
              <>−{live.rssiDbm} dBm</>
            ) : (
              <>
                −{c.link.dbm} dBm <small>{c.link.ms} ms</small>{" "}
                <small className="dimt">· hace {fmt(edadEnlace, 1)} s</small>
              </>
            )}
          </span>
        </button>
        <div className="st hide-m">
          <span className="lbl">Lazo</span>
          <span className="v">{useReal && live.loopHz != null ? live.loopHz : 1000} Hz</span>
        </div>
        <div className="divv" />
        <div className="st" data-sprint="2">
          <span className="lbl">Vuelta</span>
          <span className="v">{c.lapCount || "—"}</span>
        </div>
        <div className="st" data-sprint="2">
          <span className="lbl">Última</span>
          <span className="v">{c.lastLap?.fin ? fmt(c.lastLap.t, 3) : "—"}</span>
        </div>
        <div className="st" data-sprint="2">
          <span className="lbl">Mejor</span>
          <span className="v purple">{best != null ? fmt(best, 3) : "—"}</span>
        </div>
        <div className="st hide-m" data-sprint="2">
          <span className="lbl">Dif. a la mejor</span>
          <span className="v" style={{ color: gap === "Mejor" ? col["--purple"] : "" }}>
            {gap}
          </span>
        </div>
      </div>

      <div className="spacer" />
      <div className="stripR">
        <div
          className="seg only-v"
          role="group"
          aria-label="Fuente de datos"
          data-pbi="EN-05"
          data-sprint="1"
        >
          <button
            type="button"
            aria-pressed={c.source === "sim"}
            onClick={() => c.setSource("sim")}
          >
            Simulado
          </button>
          <button
            type="button"
            aria-pressed={c.source === "robot"}
            onClick={() => c.setSource("robot")}
          >
            Robot
          </button>
        </div>
        <button
          type="button"
          className={`regchip ${ok ? "ok" : "bad"}`}
          title={`${c.profile.comp} · ${c.profile.cat}: ${c.robot.name} ${ok ? "cumple" : "no cumple"} el reglamento`}
          onClick={() => c.goTab("rules")}
        >
          <Shield />
          <span>
            <b>{c.profile.tag}</b> · {c.profile.cat}
          </span>
        </button>
      </div>
    </header>
  );
}
