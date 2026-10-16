// Vista Control (Protoripo.html): tablero del velocista en vivo.
// EN-19, HU-13 a HU-18, HU-21 a HU-24, HU-30, HU-11.
import { useState } from "react";
import { useConsole } from "@/application/state/ConsoleContext";
import { useOptionalConnection } from "@/application/state/ConnectionContext";
import { Card, type Sprint } from "@/ui/components/Card";
import { ICO, Gate, Play, Stop } from "@/ui/components/UiIcons";
import { CTRL, PDEF, differs } from "@/shared/data/controllers";
import { currentVersion, facts } from "@/domain/rules";
import { clamp, fmt } from "@/domain/format";
import { drawChart, drawHealth, drawMap, type MapData } from "@/domain/canvas";
import { ACTIVE_THRESHOLD, stripFromMessages, type StripView } from "@/domain/strip";
import { useCanvas } from "@/application/hooks/useCanvas";

// Alcance de cada controlador: en Sprint 1 solo PID; adaptativo (EN-21) es S2 y difuso (HU-31) es Could.
const CTRL_SPRINT: Record<string, "2" | "C" | undefined> = {
  pid: undefined,
  adapt: "2",
  fuzzy: "C",
};

// Placeholder deshabilitado para los paneles que dependen de telemetría en vivo.
// Se muestra mientras no hay robot conectado (source !== "robot"); al conectarse,
// cada panel renderiza su contenido real de nuevo.
function PanelEnEspera({
  titulo,
  sub,
  className,
  pbi,
  sprint,
}: {
  titulo: string;
  sub?: string;
  className: string;
  pbi: string;
  sprint: Sprint;
}) {
  return (
    <Card className={`${className} panel-espera`} aria-label={titulo} pbi={pbi} sprint={sprint}>
      <div className="hd">
        <h2>
          {titulo} {sub ? <small>{sub}</small> : null}
        </h2>
        <span className="tag">Sin robot</span>
      </div>
      <div className="espera-robot" role="status">
        <p>Disponible al conectar el robot.</p>
        <p className="muted">Estos datos llegan en vivo; se activan al conectarse en modo Robot.</p>
      </div>
    </Card>
  );
}

function Salida() {
  const c = useConsole();
  const calTag = c.calibrating
    ? ["Calibrando", "tag"]
    : c.calibrated
      ? ["Calibrado", "tag good"]
      : ["Sin calibrar", "tag warn"];
  let hint: [string, string];
  if (c.running)
    hint = [
      c.mode === "competition" ? "Intento en curso: una vuelta." : "En pista, modo prueba.",
      "hint",
    ];
  else if (!c.calibrated) hint = ["Calibra los sensores antes de arrancar.", "hint warn"];
  else if (differs(c.draft, c.applied))
    hint = ["Saldrá con el setup enviado, no con los cambios pendientes.", "hint warn"];
  else hint = ["Listo para salir.", "hint"];
  const modeNote =
    c.mode === "test"
      ? "Prueba: vueltas continuas; se detiene si se pierde el enlace."
      : c.profile.rules.mr4
        ? "Competencia: una vuelta y se detiene, como un intento de MR4 (máx. 120 s)."
        : "Competencia: una vuelta y se detiene.";
  return (
    <Card className="a-go" pbi="HU-16 · HU-18" sprint="1">
      <div className="hd">
        <h2>Salida</h2>
        <span className={calTag[1]}>{calTag[0]}</span>
      </div>
      <button type="button" className="go" data-running={c.running} onClick={c.toggleRunning}>
        {c.running ? <Stop /> : <Play />}
        <span>{c.running ? "DETENER" : "ARRANCAR"}</span>
      </button>
      <div className="gosub">
        <span>Arranque inalámbrico</span>
        <span>
          {c.profile.rules.wireless ? `Requerido · ${c.profile.cat}` : "Opcional en este perfil"}
        </span>
      </div>
      <p className={hint[1]}>{hint[0]}</p>
      <div className={`calp ${c.calibrating ? "on" : ""}`}>
        <i style={{ width: `${c.calProgress * 100}%` }} />
      </div>
      <div className="rows">
        <div className="row">
          <span className="lbl">Sensores</span>
          <button
            type="button"
            className="sb"
            disabled={c.running || c.calibrating}
            onClick={c.calibrate}
          >
            {c.calibrating ? "Desliza…" : c.calibrated ? "Recalibrar" : "Calibrar"}
          </button>
        </div>
        <div className="row">
          <span className="lbl">Modo</span>
          <div className="seg" role="group" aria-label="Modo">
            <button
              type="button"
              aria-pressed={c.mode === "test"}
              disabled={c.running}
              onClick={() => c.setMode("test")}
            >
              Prueba
            </button>
            <button
              type="button"
              aria-pressed={c.mode === "competition"}
              disabled={c.running}
              onClick={() => c.setMode("competition")}
            >
              Competencia
            </button>
          </div>
        </div>
        <div className="row">
          <span className="lbl">Línea</span>
          <div className="seg" role="group" aria-label="Color de la línea">
            <button
              type="button"
              aria-pressed={c.line === "black"}
              disabled={c.running}
              onClick={() => c.setLine("black")}
            >
              Negra
            </button>
            <button
              type="button"
              aria-pressed={c.line === "white"}
              disabled={c.running}
              onClick={() => c.setLine("white")}
            >
              Blanca
            </button>
          </div>
        </div>
      </div>
      <p className="note">{modeNote}</p>
      <div className="lock" role="status">
        Modo competencia: mientras corre solo responde a Detener y el setup queda bloqueado. El juez
        verifica que no haya control durante el recorrido.
      </div>
    </Card>
  );
}

function Parametro({ id }: { id: string }) {
  const c = useConsole();
  const d = PDEF[id];
  const same = c.draft.controller === c.applied.controller;
  const ch = !same || Math.abs(c.draft.parameters[id] - c.applied.parameters[id]) > 1e-9;
  return (
    <div className="prm">
      <label className="nm" htmlFor={`n-${id}`} title={d.t}>
        {d.name}
      </label>
      <input
        type="range"
        id={`r-${id}`}
        min={d.min}
        max={d.max}
        step={d.step}
        value={c.draft.parameters[id]}
        aria-label={d.t}
        onChange={(e) => c.setParam(id, +e.target.value)}
      />
      <div className="ctl">
        <button
          type="button"
          aria-label={`Bajar ${d.name}`}
          onClick={() => c.setParam(id, c.draft.parameters[id] - d.step)}
        >
          −
        </button>
        <input
          id={`n-${id}`}
          inputMode="decimal"
          className={ch ? "changed" : ""}
          value={fmt(c.draft.parameters[id], d.dec)}
          onChange={(e) => {
            const v = parseFloat(e.target.value.replace(",", "."));
            if (!isNaN(v)) c.setParam(id, v);
          }}
        />
        <button
          type="button"
          aria-label={`Subir ${d.name}`}
          onClick={() => c.setParam(id, c.draft.parameters[id] + d.step)}
        >
          +
        </button>
      </div>
      <div className="was">
        {ch && same ? `en robot ${fmt(c.applied.parameters[id], d.dec)}` : ""}
      </div>
    </div>
  );
}

function Setup() {
  const c = useConsole();
  const ctrl = CTRL[c.draft.controller];
  const same = c.draft.controller === c.applied.controller;
  const pend = differs(c.draft, c.applied);
  let tag: [string, string];
  if (pend) tag = [same ? "Sin enviar" : `Cambia a ${ctrl.short}`, "tag red"];
  else if (differs(c.applied, c.saved)) tag = ["Sin guardar", "tag warn"];
  else tag = ["Guardado", "tag good"];
  const why = c.profile.rules.speedMap
    ? "Permitido por este perfil, pero la función queda fuera de este curso (HU-33)."
    : `Bloqueado por ${c.profile.comp} · ${c.profile.cat}: el robot solo puede guiarse por la línea, sin movimientos pre-programados.`;
  const eng = c.engineer.vista(c.applied.controller);
  return (
    <Card className="a-setup" pbi="HU-17" sprint="1">
      <div className="hd">
        <h2>
          Setup <small>{ctrl.name}</small>
        </h2>
        <span className={tag[1]}>{tag[0]}</span>
      </div>
      <div className="ctrlsel">
        <span className="lbl">Controller</span>
        <div className="seg" role="group" aria-label="Controller" style={{ marginTop: 6 }}>
          {Object.entries(CTRL).map(([k, v]) => (
            <button
              key={k}
              type="button"
              aria-pressed={c.draft.controller === k}
              disabled={c.locked}
              data-sprint={CTRL_SPRINT[k]}
              onClick={() => c.setCtrl(k)}
            >
              {v.name}
            </button>
          ))}
        </div>
        <p className="ctrldesc">{ctrl.desc}</p>
      </div>
      <div className="presets" role="group" aria-label="Ajustes rápidos">
        {Object.keys(ctrl.presets).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={c.preset === k}
            disabled={c.locked}
            onClick={() => c.setPreset(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <div>
        {ctrl.keys.map((id) => (
          <Parametro key={id} id={id} />
        ))}
      </div>
      <div className="acts">
        <button type="button" className="sb red" disabled={!pend || c.locked} onClick={c.sendSetup}>
          Enviar
        </button>
        <button type="button" className="sb ghost" disabled={c.locked} onClick={c.saveSetup}>
          Guardar en robot
        </button>
      </div>
      <p className="note">
        {pend
          ? same
            ? "Los valores en rojo aún no están en el robot."
            : `El robot sigue con ${CTRL[c.applied.controller].name} hasta que envíes.`
          : ""}
      </p>
      <div className="opts">
        <div className="row">
          <span className="l">Compensar batería</span>
          <button
            type="button"
            className="sw"
            role="switch"
            aria-checked={c.comp}
            onClick={c.toggleComp}
          >
            <i />
          </button>
        </div>
        <div className="row" data-sprint="W">
          <span className="l">Velocidad por mapa</span>
          <button type="button" className="sw" role="switch" aria-checked={false} disabled>
            <i />
          </button>
        </div>
        <div className="lockrow">
          {ICO.lock}
          <span>{why}</span>
        </div>
      </div>
      <div className="eng" data-sprint="2">
        <p dangerouslySetInnerHTML={{ __html: eng.mini }} />
        <button
          type="button"
          className="sb"
          disabled={!eng.hasProp || c.locked}
          onClick={c.loadProposal}
        >
          Cargar
        </button>
      </div>
    </Card>
  );
}

function PistaEnVivo() {
  const c = useConsole();
  const sim = c.simRef.current;
  const m = c.mapRef.current;
  const datos: MapData = {
    recording: m.recording,
    raw: m.raw,
    corr: m.corr,
    path: m.path,
    mapMode: c.mapMode,
    lastBins: c.lastBinsRef.current,
    lastColsSector: c.lastLap && c.lastLap.col.length === 3 ? c.lastLap.col : null,
    trail: c.trailRef.current,
    running: c.running,
    simS: sim.s,
    simE: sim.e,
    short: c.robot.short,
  };
  const ref = useCanvas((cv) => drawMap(cv, datos));
  const lostNow = Math.abs(sim.es) > 1.1;
  const tMean =
    c.running && sim.lapT > 0.2
      ? fmt(sim.iae / sim.lapT, 2)
      : c.lastLap
        ? fmt(c.lastLap.iae / Math.max(0.01, c.lastLap.t), 2)
        : "—";
  return (
    <Card className="a-map" aria-label="Pista en vivo" pbi="HU-22 · HU-24" sprint="2">
      <div className="hd">
        <h2>
          Pista en vivo <small>{m.recording ? "mapeando vuelta 1" : m.source || "sin mapa"}</small>
        </h2>
        <div className="seg" role="group" aria-label="Qué mostrar en el mapa">
          <button
            type="button"
            aria-pressed={c.mapMode === "error"}
            onClick={() => c.setMapMode("error")}
          >
            Error
          </button>
          <button
            type="button"
            aria-pressed={c.mapMode === "sectores"}
            onClick={() => c.setMapMode("sectores")}
          >
            Sectores
          </button>
        </div>
      </div>
      <div className="mapbox">
        <canvas ref={ref} role="img" aria-label="Mapa de pista con la posición del robot" />
        {!(m.path || m.recording) && (
          <div className="mapmsg">
            <div>
              <p>
                El mapa se construye durante la primera vuelta y sirve solo para analizar: el robot
                se guía únicamente por la línea.
              </p>
              <div className="b">
                <button type="button" className="sb" onClick={() => c.goTab("map")}>
                  Ver mapa
                </button>
                <button type="button" className="sb ghost" onClick={c.useExample}>
                  Usar pista de pruebas
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="telem">
        <div>
          <div className="lbl">Sector</div>
          <div className="v">{c.running ? `S${sim.sec + 1}` : "—"}</div>
        </div>
        <div>
          <div className="lbl">Error</div>
          <div className={`v ${Math.abs(sim.p) > 0.6 ? "bad" : ""}`}>{fmt(sim.p, 2)}</div>
        </div>
        <div>
          <div className="lbl">PWM izq / der</div>
          <div className="v">{`${Math.round(sim.pl)} / ${Math.round(sim.pr)}`}</div>
        </div>
        <div>
          <div className="lbl">Error medio</div>
          <div className="v">{tMean}</div>
        </div>
        <div>
          <div className="lbl">Líneas perdidas</div>
          <div className={`v ${lostNow ? "bad" : ""}`}>
            {c.running ? sim.lost : c.lastLap ? c.lastLap.lost : 0}
          </div>
        </div>
      </div>
      <div className="offline" role="status">
        Sin enlace: la telemetría está en pausa. Si el robot sigue corriendo, las vueltas se graban
        en su memoria y se sincronizan al reconectar.
      </div>
    </Card>
  );
}

function Cronometraje() {
  const c = useConsole();
  const sim = c.simRef.current;
  const fins = c.laps.filter((l) => l.fin);
  const best = fins.length ? Math.min(...fins.map((l) => l.t)) : null;
  let gap = "—",
    gapPurple = false;
  if (best != null && c.lastLap?.fin) {
    const g = c.lastLap.t - best;
    gap = g <= 1e-9 ? "Mejor" : `+${fmt(g, 3)}`;
    gapPurple = g <= 1e-9;
  }
  const last16 = c.laps.slice(-16);
  const lf = last16.filter((l) => l.fin);
  const tmax = Math.max(...lf.map((l) => l.t), 1);
  const tmin = Math.min(...lf.map((l) => l.t), tmax);
  const [nota, setNota] = useState("");
  const sec = (i: number): [string, string] => {
    if (c.running && i === sim.sec) return ["live", fmt(sim.lapT - sim.secStart, 2)];
    if (c.running && i < sim.sec) {
      const x = sim.secT[i];
      return [x < c.bestSec[i] ? "purple" : "green", fmt(x, 3)];
    }
    if (c.lastLap?.fin) return [c.lastLap.col[i], fmt(c.lastLap.sec[i], 3)];
    return ["", "—"];
  };
  if (!c.robotConnected)
    return (
      <PanelEnEspera titulo="Cronometraje" className="a-time" pbi="HU-19 · EN-15" sprint="2" />
    );
  return (
    <Card className="a-time" aria-label="Cronometraje" pbi="HU-19 · EN-15" sprint="2">
      <div className="hd">
        <h2>Cronometraje</h2>
        <span className="tag">
          {c.laps.length
            ? `${c.laps.length} vuelta${c.laps.length === 1 ? "" : "s"}`
            : "Sin vueltas"}
        </span>
      </div>
      <button
        type="button"
        className={`gate ${c.gate ? "" : "off"}`}
        title="Cronómetro de meta: toca para simular una desconexión"
        onClick={c.toggleGate}
      >
        <span className="l">
          <Gate />
          <span>{c.gate ? "Meta · barrera OK" : "Meta desconectada"}</span>
        </span>
        <span className={`tag ${c.gate ? "good" : "warn"}`}>
          <span className="dot" />
          {c.gate ? "± 5 ms" : "Telemetría"}
        </span>
      </button>
      <div className="lapbig">
        <div>
          <div className="lbl">Vuelta</div>
          <div className="n">
            {c.lapCount ? (
              <>
                {c.lapCount}
                {c.mode === "competition" && <small> / 1</small>}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <div className="lbl" style={{ textAlign: "right" }}>
            Dif. a la mejor
          </div>
          <div className="gap" style={{ color: gapPurple ? "var(--purple)" : "" }}>
            {gap}
          </div>
        </div>
      </div>
      <div className="now">
        {fmt(sim.lapT, 3)}
        <small>s</small>
      </div>
      <div className="pair">
        <div>
          <div className="lbl">Última</div>
          <div className="v">
            {c.lastLap ? (c.lastLap.fin ? fmt(c.lastLap.t, 3) : "No terminó") : "—"}
          </div>
        </div>
        <div>
          <div className="lbl">Mejor</div>
          <div className="v purple">{best != null ? fmt(best, 3) : "—"}</div>
        </div>
      </div>
      <div className="secs">
        {[0, 1, 2].map((i) => {
          const [cls, val] = sec(i);
          return (
            <div key={i} data-c={cls}>
              <div className="lbl">S{i + 1}</div>
              <div className="v">{val}</div>
            </div>
          );
        })}
      </div>
      <div className="hist" aria-label="Historial de vueltas">
        {last16.map((l, i) => {
          if (!l.fin)
            return (
              <i key={i} className="dnf" style={{ height: "100%" }} title={`V${l.n}: no terminó`} />
            );
          const h = 30 + (1 - (l.t - tmin) / Math.max(0.01, tmax - tmin)) * 70;
          return (
            <i
              key={i}
              className={l.t === best ? "best" : ""}
              style={{ height: `${h}%` }}
              title={`V${l.n}: ${fmt(l.t, 3)} s`}
            />
          );
        })}
      </div>
      <div className="quick">
        <input
          className="inp"
          placeholder="Nota para la última corrida"
          aria-label="Nota para la última corrida"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <button
          type="button"
          className="sb"
          onClick={async () => {
            if (await c.saveNote(nota)) setNota("");
          }}
        >
          Guardar nota
        </button>
      </div>
      <p className="note">Cada vuelta se registra sola como corrida.</p>
    </Card>
  );
}

// Regleta simulada: el bucle de simulación (modo Simulado) mueve la línea con `sim.es`.
// Se usa como respaldo mientras no llega un `senales` real del robot por el WebSocket.
function simulatedStrip(sim: { es: number; p: number }): StripView {
  const pos = -sim.es;
  const vis = Math.abs(sim.es) <= 1.1;
  let active = 0;
  const bars = Array.from({ length: 16 }, (_, i) => {
    const x = -1 + i * (2 / 15);
    const v = clamp(
      (vis ? Math.exp(-((x - pos) ** 2) / (2 * 0.018)) : 0) + Math.random() * 0.04,
      0,
      1,
    );
    if (v >= ACTIVE_THRESHOLD) active++;
    return v;
  });
  return {
    bars,
    digits: bars.map((v) => Math.round(v * 9)),
    positionNorm: pos,
    positionMm: pos * 72,
    error: sim.p,
    centered: vis && Math.abs(pos) < 0.25,
    lost: !vis,
    active,
  };
}

export function Regleta() {
  const c = useConsole();
  const conexion = useOptionalConnection();
  // Datos reales del robot (canal `regleta` de `senales`) si los hay; si no, la simulación.
  const real = conexion ? stripFromMessages(conexion.mensajes) : null;
  const v = real ?? simulatedStrip(c.simRef.current);
  const posTag: [string, string] = v.lost
    ? ["Línea perdida", "tag red"]
    : v.centered
      ? ["Centrada", "tag good"]
      : [v.positionNorm > 0 ? "Hacia la derecha" : "Hacia la izquierda", "tag"];
  return (
    <Card className="a-sens" pbi="HU-15" sprint="1">
      <div className="hd">
        <h2>
          Regleta <small>16 canales · 2 × QTR-8A</small>
        </h2>
        <span className={posTag[1]}>{posTag[0]}</span>
      </div>
      <div className="bars">
        {v.bars.map((b, i) => (
          <div className="bar" key={i}>
            <div className="tb">
              <i
                className={b >= ACTIVE_THRESHOLD ? "hot" : ""}
                style={{ height: `${8 + b * 92}%` }}
              />
            </div>
            <div className="n">{v.digits[i]}</div>
          </div>
        ))}
      </div>
      <div className="modl">
        <span>QTR-8A · izquierda</span>
        <span>QTR-8A · derecha</span>
      </div>
      <div className="sread">
        <div>
          <div className="lbl">Posición</div>
          <div className={`v ${v.lost ? "bad" : ""}`}>
            {v.lost ? "Perdida" : `${v.positionMm > 0 ? "+" : ""}${fmt(v.positionMm, 1)} mm`}
          </div>
        </div>
        <div>
          <div className="lbl">Error</div>
          <div className="v">{fmt(v.error, 2)}</div>
        </div>
        <div>
          <div className="lbl">Sobre la línea</div>
          <div className="v">{v.active} / 16</div>
        </div>
      </div>
    </Card>
  );
}

function Senales() {
  const c = useConsole();
  const ref = useCanvas((cv) => drawChart(cv, c.histRef.current, c.show));
  const keys: [keyof typeof c.show, string, string][] = [
    ["err", "var(--red)", "Error"],
    ["pl", "var(--ink)", "Izq"],
    ["pr", "var(--dim)", "Der"],
  ];
  if (!c.robotConnected)
    return (
      <PanelEnEspera titulo="Señales" sub="6 s · 20 Hz" className="a-sig" pbi="HU-21" sprint="2" />
    );
  return (
    <Card className="a-sig" pbi="HU-21" sprint="2">
      <div className="hd">
        <h2>
          Señales <small>6 s · 20 Hz</small>
        </h2>
        <div className="keys">
          {keys.map(([k, col, t]) => (
            <button
              key={k}
              type="button"
              aria-pressed={c.show[k]}
              onClick={() => c.toggleSignal(k)}
            >
              <i style={{ background: col }} />
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="cbox">
        <canvas ref={ref} role="img" aria-label="Error y PWM de cada motor" />
      </div>
    </Card>
  );
}

function Registro() {
  const c = useConsole();
  return (
    <Card className="flat a-log" pbi="HU-23" sprint="2">
      <div className="hd">
        <h2>Registro de eventos</h2>
        <span className="tag">{c.events.length}</span>
      </div>
      <div className="logs">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Sistema</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {c.events.map((e, i) => (
              <tr key={i} className={e.lv}>
                <td>{e.t}</td>
                <td>{e.sys}</td>
                <td>{e.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ErrorPista() {
  const c = useConsole();
  const sim = c.simRef.current;
  const ref = useCanvas((cv) =>
    drawHealth(
      cv,
      c.running,
      sim.s,
      c.curBinsRef.current,
      c.curCntRef.current,
      c.lastBinsRef.current,
    ),
  );
  if (!c.robotConnected)
    return (
      <PanelEnEspera
        titulo="Error a lo largo de la pista"
        sub="vuelta actual sobre la anterior"
        className="a-health"
        pbi="HU-30"
        sprint="C"
      />
    );
  return (
    <Card className="a-health" pbi="HU-30" sprint="C">
      <div className="hd">
        <h2>
          Error a lo largo de la pista <small>vuelta actual sobre la anterior</small>
        </h2>
        <div className="hscale lbl">
          <span>Estable</span>
          <i style={{ background: "#2A2E3A" }} />
          <i style={{ background: "#7A2338" }} />
          <i style={{ background: "var(--red)" }} />
          <span>Inestable</span>
        </div>
      </div>
      <div className="hbox">
        <canvas
          ref={ref}
          role="img"
          aria-label="Error del robot a lo largo de la distancia de la pista"
        />
      </div>
    </Card>
  );
}

function PanelesManifiesto() {
  const c = useConsole();
  const sim = c.simRef.current;
  const f = facts(currentVersion(c.robot).parts, c.catalog);
  const encL = Math.round((Math.max(0, sim.wl) / 100) * 3200);
  const encR = Math.round((Math.max(0, sim.wr) / 100) * 3200);
  return (
    <div className="a-ext">
      {f.enc && (
        <Card pbi="HU-13 · HU-11" sprint="1">
          <div className="hd">
            <h2>
              Encoders <small>{f.enc.specs.cpr} CPR · del manifiesto</small>
            </h2>
            <span className="tag">2 ruedas</span>
          </div>
          <div className="gauge">
            <div>
              <div className="lbl">Rueda izquierda</div>
              <div className="v">{encL} rpm</div>
            </div>
            <div>
              <div className="lbl">Rueda derecha</div>
              <div className="v">{encR} rpm</div>
            </div>
          </div>
          {!c.profile.rules.enc && (
            <div className="lockov">
              <div>
                {ICO.lock}
                <p>
                  Encoders no permitidos en{" "}
                  <b>
                    {c.profile.comp} · {c.profile.cat}
                  </b>
                  : el robot solo puede guiarse por la línea.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}
      {f.turbine && (
        <Card pbi="HU-13 · HU-11" sprint="1">
          <div className="hd">
            <h2>
              Turbina <small>{f.turbine.name}</small>
            </h2>
            <span className={`tag ${c.turb ? "red" : ""}`}>{c.turb ? "Encendida" : "Apagada"}</span>
          </div>
          <div className="prm" style={{ gridTemplateColumns: "60px 1fr auto", border: 0 }}>
            <span className="nm">Succión</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={c.turb}
              aria-label="Potencia de la turbina"
              onChange={(e) => c.setTurb(+e.target.value)}
            />
            <span className="m">{c.turb} %</span>
          </div>
          <div className="gauge">
            <div>
              <div className="lbl">Corriente</div>
              <div className="v">{fmt((c.turb / 100) * 3.5, 1)} A</div>
            </div>
            <div>
              <div className="lbl">Encendido</div>
              <div className="v" style={{ fontSize: 13, marginTop: 6 }}>
                Al energizar, según el reglamento
              </div>
            </div>
          </div>
          {!c.profile.rules.turbine && (
            <div className="lockov">
              <div>
                {ICO.lock}
                <p>
                  Turbina no permitida en{" "}
                  <b>
                    {c.profile.comp} · {c.profile.cat}
                  </b>
                  . Solo en Master.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export function Control() {
  return (
    <section className="view on mc" aria-label="Control">
      <Salida />
      <Setup />
      <PistaEnVivo />
      <Cronometraje />
      <Regleta />
      <Senales />
      <Registro />
      <ErrorPista />
      <PanelesManifiesto />
    </section>
  );
}
