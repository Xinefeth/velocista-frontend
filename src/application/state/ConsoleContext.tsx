import { applyStoredSetup, changeModeLine, storeSetup } from "@/infrastructure/http/robot";
import { useRobotConnection } from "@/application/hooks/useRobotConnection";
import { annotateRun, loadRunHistory } from "@/infrastructure/http/runs";
// Estado y lógica de la consola simulada (EN-19): robot, setup, corridas, mapa y navegación.
// Portado del prototipo (Protoripo.html). Ejecuta el bucle de simulación (modo Simulado, EN-05)
// y expone estado + acciones a las vistas. El modo Robot real se cablea con services/ (EN-05).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Component, Profile, Parts, RobotDef, Setup, Specs } from "@/domain/models/domain";
import type { Corrida, Vuelta } from "@/domain/models/runs";
import type { RobotApi } from "@/infrastructure/contracts/api";
import { CAT, RANURAS } from "@/shared/data/catalog";
import { PERFILES } from "@/shared/data/rulebook";
import { CTRL, PDEF, psum } from "@/shared/data/controllers";
import { currentVersion, facts, profileById, robotById } from "@/domain/rules";
import { clamp, clone, fmt } from "@/domain/format";
import {
  borrarRegistrados,
  cargarComponentes,
  cargarRobots,
  guardarComponentes,
  guardarRobots,
} from "@/infrastructure/persistence/persistence";
import { Engineer, type EngineerMethod } from "@/domain/engineer";
import {
  buildMap,
  DT,
  EXAMPLE,
  LEN,
  Simulator,
  VMAX,
  type Punto,
  type MapStats,
} from "@/domain/simulator";
import { HIST, NB, RATE, resetFraming, robotOn } from "@/domain/canvas";
import { api, ErrorApi } from "@/infrastructure/http/api";

export type Tab =
  | "control"
  | "telemetry"
  | "runs"
  | "map"
  | "catalog"
  | "builder"
  | "rules"
  | "tracer";
export type Source = "sim" | "robot";
export type Mode = "test" | "competition";
export type LineColor = "black" | "white";
export type Scope = "s1" | "s2" | "all";

export interface LogEvent {
  t: string;
  sys: string;
  msg: string;
  lv: "" | "good" | "warn" | "bad" | "best";
}

interface MapState {
  path: Punto[] | null;
  source: string | null;
  pending: boolean;
  recording: boolean;
  raw: Punto[] | null;
  corr: Punto[] | null;
  stats: MapStats | null;
  est: { x: number; y: number; h: number; dist: number; next: number } | null;
  bias: number;
}

const GROUP: Record<Tab, "velocista" | "gestion"> = {
  control: "velocista",
  telemetry: "velocista",
  runs: "velocista",
  map: "velocista",
  catalog: "gestion",
  builder: "gestion",
  rules: "gestion",
  tracer: "gestion",
};

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem("apaec.v2." + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem("apaec.v2." + k, JSON.stringify(v));
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

export interface ConsoleState {
  tick: number;
  // navegación
  tab: Tab;
  goTab: (t: Tab) => void;
  // datos
  catalog: Component[];
  robots: RobotDef[];
  profiles: Profile[];
  robot: RobotDef;
  robotId: string;
  profile: Profile;
  selectRobot: (id: string) => void;
  setProfile: (id: string) => void;
  // conexión / fuente
  source: Source;
  setSource: (v: Source) => void;
  // true solo con un robot real conectado (source === "robot"); los paneles en
  // vivo se deshabilitan mientras sea false y se reactivan al conectarse.
  robotConnected: boolean;
  connected: boolean;
  toggleConnected: () => void;
  link: { dbm: number; ms: number };
  // estado del robot
  mode: Mode;
  setMode: (v: Mode) => void;
  line: LineColor;
  setLine: (v: LineColor) => void;
  calibrated: boolean;
  calibrating: boolean;
  calProgress: number;
  calibrate: () => void;
  running: boolean;
  toggleRunning: () => void;
  locked: boolean;
  gate: boolean;
  toggleGate: () => void;
  comp: boolean;
  toggleComp: () => void;
  turb: number;
  setTurb: (v: number) => void;
  vbat: number;
  changeBattery: () => void;
  // setup (HU-17)
  draft: Setup;
  applied: Setup;
  saved: Setup;
  savedSetupId: number | null;
  preset: string | null;
  setCtrl: (v: string) => void;
  setParam: (id: string, val: number) => void;
  setPreset: (name: string) => void;
  sendSetup: () => void;
  saveSetup: () => void;
  prepareExternalRun: () => Promise<number>;
  // corridas / ingeniero
  laps: Vuelta[];
  runs: Corrida[];
  runsError: string | null;
  refreshRuns: () => void;
  lastLap: Vuelta | null;
  lastRun: Corrida | null;
  lapCount: number;
  bestSec: number[];
  engMethod: EngineerMethod;
  setEngMethod: (v: EngineerMethod) => void;
  engineer: Engineer;
  loadProposal: () => void;
  saveNote: (txt: string) => Promise<boolean>;
  // mapa
  mapMode: "error" | "sectores";
  setMapMode: (v: "error" | "sectores") => void;
  useExample: () => void;
  rebuildMap: () => void;
  // señales
  show: { err: boolean; pl: boolean; pr: boolean };
  toggleSignal: (s: "err" | "pl" | "pr") => void;
  // catálogo / armador
  setCatalog: (f: (c: Component[]) => Component[]) => void;
  setRobots: (f: (r: RobotDef[]) => RobotDef[]) => void;
  /** True cuando la lista de robots viene de la API (producción), no de fixtures locales. */
  apiMode: boolean;
  /** Crea un robot en la base de datos (POST /robots) y refresca la lista. Solo en apiMode. */
  createRobot: () => Promise<RobotApi | null>;
  /** Registra un componente en la base de datos (POST /components) y refresca el catálogo. */
  createComponent: (data: {
    typeId: string;
    name: string;
    price: number;
    mass: number;
    store: string;
    amps?: number | null;
    specs: Specs;
    stock: number;
  }) => Promise<Component | null>;
  /** Guarda una nueva versión del robot (POST /robots/{id}/versions) y refresca la lista. */
  saveVersion: (
    robotId: string,
    versionBaseId: number | null,
    parts: Parts,
    note: string,
  ) => Promise<boolean>;
  // log
  events: LogEvent[];
  log: (sys: string, msg: string, lv?: LogEvent["lv"]) => void;
  // modales
  detailId: string | null;
  openDetails: (id: string) => void;
  closeDetails: () => void;
  regOpen: boolean;
  openRegistration: () => void;
  closeRegistration: () => void;
  /** Borra lo registrado a mano y vuelve al catálogo y los robots de ejemplo. */
  resetData: () => void;
  manifestId: string | null;
  openManifest: (id: string) => void;
  closeManifest: () => void;
  initialBuilderRobot: string | null;
  openInBuilder: (id: string) => void;
  // backlog
  blOpen: boolean;
  setBlOpen: (v: boolean) => void;
  showPbi: boolean;
  setShowPbi: (v: boolean) => void;
  scope: Scope;
  setScope: (v: Scope) => void;
  // toast
  toast: string | null;
  showToast: (m: string) => void;
  // refs para lienzos
  simRef: React.MutableRefObject<Simulator>;
  mapRef: React.MutableRefObject<MapState>;
  trailRef: React.MutableRefObject<{ x: number; y: number; err: number }[]>;
  histRef: React.MutableRefObject<{ err: number[]; pl: number[]; pr: number[] }>;
  curBinsRef: React.MutableRefObject<Float32Array>;
  curCntRef: React.MutableRefObject<Float32Array>;
  lastBinsRef: React.MutableRefObject<number[] | null>;
}

const Context = createContext<ConsoleState | null>(null);

/** Estado vacío del armador: sin robots, ofrece crear el primero (persistido en la BD). */
function FirstRobot({ onCreate: onCreate }: { onCreate: () => Promise<RobotApi | null> }) {
  const [creating, setCreating] = useState(false);
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "grid",
        gap: 12,
        placeContent: "center",
        textAlign: "center",
      }}
    >
      <p role="status">No hay robots registrados en el armador.</p>
      <button
        type="button"
        className="sb"
        disabled={creating}
        onClick={async () => {
          setCreating(true);
          try {
            await onCreate();
          } finally {
            setCreating(false);
          }
        }}
      >
        {creating ? "Creando…" : "Crear primer robot"}
      </button>
    </div>
  );
}

export function ConsoleProvider({
  children,
  initialRobots,
}: {
  children: ReactNode;
  initialRobots?: RobotDef[];
}) {
  const remote = useRobotConnection();
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => (t + 1) % 1_000_000), []);

  const [tab, setTab] = useState<Tab>("control");
  // En modo fixture el catálogo se conserva en el navegador; en producción es la API (GET /components).
  const [catalog, setCatalogState] = useState<Component[]>(() =>
    initialRobots ? cargarComponentes(CAT) : [],
  );
  const [catalogRequest, setCatalogRequest] = useState(0);
  const [robots, setRobotsState] = useState<RobotDef[]>(() =>
    initialRobots ? cargarRobots(initialRobots) : [],
  );
  const [robotsLoading, setRobotsLoading] = useState(!initialRobots);
  const [robotsError, setRobotsError] = useState<string | null>(null);
  const [robotsRequest, setRobotsRequest] = useState(0);
  const [runsRequest, setRunsRequest] = useState(0);
  const [runsError, setRunsError] = useState<string | null>(null);
  const refreshRuns = useCallback(() => setRunsRequest((value) => value + 1), []);
  useEffect(() => {
    if (initialRobots) guardarComponentes(catalog, CAT);
  }, [catalog, initialRobots]);
  useEffect(() => {
    if (initialRobots) guardarRobots(robots, initialRobots);
  }, [robots, initialRobots]);
  // En producción el catálogo es la base de datos (GET /components), no archivos del frontend.
  useEffect(() => {
    if (initialRobots) return;
    let alive = true;
    api.catalog
      .list()
      .then((items) => {
        if (alive) setCatalogState(items);
      })
      .catch(() => {
        /* si falla, el catálogo queda vacío; el error de robots ya avisa de la caída */
      });
    return () => {
      alive = false;
    };
  }, [initialRobots, catalogRequest]);
  const [profiles] = useState<Profile[]>(() => clone(PERFILES));

  const [robotId, setRobotId] = useState("v001");
  const [profileId, setProfileId] = useState<string>(() => {
    const p = store.get("profile", "mr4s");
    return profileById(PERFILES, p) ? p : "mr4s";
  });
  const [source, setSourceState] = useState<Source>("sim");
  const [connected, setConnected] = useState(true);
  const [mode, setModeState] = useState<Mode>("test");
  const [line, setLineState] = useState<LineColor>("black");
  const [calibrated, setCalibrated] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calProgress, setCalProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [gate, setGate] = useState(true);
  const [comp, setComp] = useState(true);
  const [turb, setTurbState] = useState(0);

  const [draft, setDraft] = useState<Setup>(() => ({
    controller: "pid",
    parameters: { ...CTRL.pid.presets.Base },
  }));
  const [applied, setApplied] = useState<Setup>(() => ({
    controller: "pid",
    parameters: { ...CTRL.pid.presets.Base },
  }));
  const [saved, setSaved] = useState<Setup>(() => ({
    controller: "pid",
    parameters: { ...CTRL.pid.presets.Base },
  }));
  const [savedSetupId, setSavedSetupId] = useState<number | null>(null);
  const [preset, setPresetState] = useState<string | null>("Base");

  const [engMethod, setEngMethodState] = useState<EngineerMethod>("twiddle");
  const [mapMode, setMapMode] = useState<"error" | "sectores">("error");
  const [show, setShow] = useState({ err: true, pl: true, pr: true });

  const [detailId, setDetailId] = useState<string | null>(null);
  const [regOpen, setRegOpen] = useState(false);
  const [manifestId, setManifestId] = useState<string | null>(null);
  const [initialBuilderRobot, setInitialBuilderRobot] = useState<string | null>(null);

  const [blOpen, setBlOpen] = useState(false);
  const [showPbi, setShowPbiState] = useState<boolean>(() => store.get("pbi", false));
  // Por defecto "Sprint 1": los paneles de Sprint 2 se ven desactivados (criterio de EN-19).
  const [scope, setScopeState] = useState<Scope>(() => store.get<Scope>("scope", "s1"));

  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // --- Refs vivos (leídos por el bucle y los lienzos) ---
  const simRef = useRef(new Simulator());
  const mapRef = useRef<MapState>({
    path: null,
    source: null,
    pending: true,
    recording: false,
    raw: null,
    corr: null,
    stats: null,
    est: null,
    bias: 1,
  });
  const trailRef = useRef<{ x: number; y: number; err: number }[]>([]);
  const histRef = useRef({ err: [] as number[], pl: [] as number[], pr: [] as number[] });
  const curBinsRef = useRef(new Float32Array(NB));
  const curCntRef = useRef(new Float32Array(NB));
  const lastBinsRef = useRef<number[] | null>(null);

  const lapsRef = useRef<Vuelta[]>([]);
  const runsRef = useRef<Corrida[]>([]);
  const pendingSyncRef = useRef<Vuelta[]>([]);
  const lastLapRef = useRef<Vuelta | null>(null);
  const lastRunRef = useRef<Corrida | null>(null);
  const lapCountRef = useRef(0);
  const bestSecRef = useRef<number[]>([Infinity, Infinity, Infinity]);
  const logRef = useRef<LogEvent[]>([]);
  const engRef = useRef(new Engineer());
  const vbatRef = useRef(8.2);
  const linkRef = useRef({ dbm: 58, ms: 12 });
  const [, setLinkTick] = useState(0);

  // Valores que el bucle necesita siempre frescos.
  const live = useRef({
    running,
    connected,
    mode,
    comp,
    turb,
    gate,
    robotId,
    tab,
    applied,
    engMethod,
    source,
  });
  live.current = {
    running,
    connected,
    mode,
    comp,
    turb,
    gate,
    robotId,
    tab,
    applied,
    engMethod,
    source,
  };

  const robot = useMemo(() => robotById(robots, robotId) ?? robots[0], [robots, robotId]);
  const profile = useMemo(
    () => profileById(profiles, profileId) ?? profiles[0],
    [profiles, profileId],
  );
  const locked = running && mode === "competition";

  const log = useCallback((sys: string, msg: string, lv: LogEvent["lv"] = "") => {
    const d = new Date();
    const t = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((x) => String(x).padStart(2, "0"))
      .join(":");
    logRef.current = [{ t, sys, msg, lv }, ...logRef.current].slice(0, 80);
  }, []);

  useEffect(() => {
    if (source !== "robot") return;
    setConnected(remote.connected && remote.manifest?.id === robotId);
    const status = remote.status;
    if (!status) return;
    setRunning(status.state === "running");
    setCalibrating(status.state === "calibrating");
    setCalibrated(status.calibrated);
    setModeState(status.mode);
    setLineState(status.line);
    const battery = status.channels?.bateria_v;
    if (typeof battery === "number") vbatRef.current = battery;
  }, [source, remote.connected, remote.manifest, remote.status, robotId]);

  const sendRobotCommand = useCallback(
    async (type: string, data: Record<string, unknown> = {}) => {
      if (!remote.connected || remote.manifest?.id !== live.current.robotId) {
        showToast("El robot seleccionado no está conectado a la API.");
        return false;
      }
      try {
        if (type === "mode" || type === "line")
          await changeModeLine(live.current.robotId, type, data);
        else await api.command(type, data);
        log("Robot", `Comando ${type} enviado; esperando confirmación del dispositivo`);
        return true;
      } catch (error) {
        showToast(
          "No se pudo enviar: " + (error instanceof ErrorApi ? error.message : "sin conexión"),
        );
        return false;
      }
    },
    [remote.connected, remote.manifest, showToast, log],
  );

  // initialRobots permite inyectar fixtures; en producción la API es la fuente de la lista.
  useEffect(() => {
    if (initialRobots) return;
    let alive = true;
    setRobotsLoading(true);
    setRobotsError(null);
    api.robots
      .selection()
      .then((records) => {
        if (!alive) return;
        setRobotsState(records);
        setRobotId((id) =>
          records.some((record) => record.id === id) ? id : (records[0]?.id ?? ""),
        );
        log("Robots", `Lista sincronizada con la API · ${records.length} registrados`);
      })
      .catch((e) => {
        if (alive)
          setRobotsError(
            `No se pudieron cargar los robots: ${e instanceof ErrorApi ? e.message : "sin conexión con la API"}`,
          );
      })
      .finally(() => {
        if (alive) setRobotsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [log, initialRobots, robotsRequest]);

  // En producción el historial se recupera de la API también después de recargar.
  useEffect(() => {
    if (initialRobots) return;
    let alive = true;
    let fetching = false;
    async function refresh() {
      if (fetching) return;
      fetching = true;
      try {
        const history = await loadRunHistory(robots);
        if (!alive) return;
        runsRef.current = history;
        lastRunRef.current =
          history.filter((run) => run.robot === live.current.robotId).at(-1) ?? null;
        setRunsError(null);
        bump();
      } catch (error) {
        if (alive)
          setRunsError(
            "No se pudo cargar el historial: " +
              (error instanceof ErrorApi ? error.message : "sin conexión con la API"),
          );
      } finally {
        fetching = false;
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [initialRobots, robots, runsRequest, bump]);

  // --- Corridas ---
  const recordRun = useCallback(
    (L: Vuelta, src?: string) => {
      if (!initialRobots) return;
      const rb = robotById(robots, L.robot);
      const r: Corrida = {
        n: runsRef.current.length + 1,
        robot: L.robot,
        ver: rb ? currentVersion(rb).v : "",
        ctrl: L.ctrl,
        p: { ...L.p },
        t: L.fin ? L.t : null,
        fin: L.fin,
        iae: L.iae,
        vbat: L.vbat,
        sec: L.fin ? L.sec : [],
        src: src || L.src,
        note: L.why || "",
        J: 0,
      };
      r.J = r.fin ? r.t! + 2 * r.iae : 120;
      runsRef.current = [...runsRef.current, r];
      lastRunRef.current = r;
      if (L.robot === live.current.robotId)
        engRef.current.feed(
          r,
          runsRef.current.filter((x) => x.robot === L.robot),
        );
      log("Corridas", `#${r.n} registrada · ${CTRL[r.ctrl].short} · J ${fmt(r.J, 2)}`);
    },
    [robots, log, initialRobots],
  );

  const mkLap = useCallback((fin: boolean, why?: string): Vuelta => {
    const sim = simRef.current;
    return {
      n: lapCountRef.current,
      t: sim.lapT,
      iae: sim.iae,
      ctrl: live.current.applied.controller,
      p: { ...live.current.applied.parameters },
      vbat: vbatRef.current,
      segs: sim.closeLap(),
      sec: fin ? sim.secT.slice(0, 3) : [],
      col: [],
      fin,
      lost: sim.lost,
      src: live.current.gate ? "Meta" : "Telemetría",
      why: why || "",
      robot: live.current.robotId,
    };
  }, []);

  const onLap = useCallback(() => {
    const sim = simRef.current,
      m = mapRef.current;
    if (m.recording && m.raw && m.est) {
      m.raw.push({ x: m.est.x, y: m.est.y, h: m.est.h });
      const res = buildMap(m.raw);
      if (res) {
        m.corr = res.corr;
        m.path = res.corr;
        m.source = "desde la vuelta 1";
        m.pending = false;
        m.recording = false;
        m.stats = res.stats;
        resetFraming();
        log(
          "Mapa",
          `Construido: ${fmt(res.stats.len, 2)} m, cierre corregido ${Math.round(res.stats.closeErr * 100)} cm`,
          "good",
        );
      }
    }
    const L = mkLap(true);
    const prev = lapsRef.current.filter((l) => l.fin).slice(-1)[0];
    const bs = bestSecRef.current;
    L.col = L.sec.map((t, i) =>
      t < bs[i] ? "purple" : prev && prev.sec[i] != null && t < prev.sec[i] ? "green" : "yellow",
    );
    L.sec.forEach((t, i) => {
      if (t < bs[i]) bs[i] = t;
    });
    const fins = lapsRef.current.filter((l) => l.fin);
    const prevBest = fins.length ? Math.min(...fins.map((l) => l.t)) : Infinity;
    lastLapRef.current = L;
    lapsRef.current = [...lapsRef.current, L];
    lastBinsRef.current = Array.from(curBinsRef.current, (v, i) =>
      curCntRef.current[i] ? v / curCntRef.current[i] : 0,
    );
    curBinsRef.current.fill(0);
    curCntRef.current.fill(0);
    trailRef.current = [];
    if (L.t < prevBest)
      log("Vuelta", `V${lapCountRef.current} ${fmt(L.t, 3)} s, mejor vuelta`, "best");
    else log("Vuelta", `V${lapCountRef.current} ${fmt(L.t, 3)} s (+${fmt(L.t - prevBest, 3)})`);
    if (live.current.connected) recordRun(L);
    else pendingSyncRef.current.push(L);
    Object.assign(sim, { lapT: 0, iae: 0, lost: 0, sec: 0, secT: [], secStart: 0 });
    lapCountRef.current++;
    if (live.current.mode === "competition") {
      setRunning(false);
      log("Intento", `Terminado: 1 vuelta en ${fmt(L.t, 3)} s`, "good");
      showToast(`Intento terminado: ${fmt(L.t, 3)} s.`);
    }
  }, [mkLap, log, recordRun, showToast]);

  const onDNF = useCallback(
    (why: string) => {
      const L = mkLap(false, why);
      lastLapRef.current = L;
      lapsRef.current = [...lapsRef.current, L];
      const m = mapRef.current;
      if (m.recording) {
        m.recording = false;
        m.raw = null;
      }
      setRunning(false);
      if (live.current.connected) recordRun(L);
      else pendingSyncRef.current.push(L);
      log(
        "Robot",
        why === "Tiempo máximo"
          ? "Tiempo máximo de 120 s: ronda nula"
          : `Salió de la pista en S${simRef.current.sec + 1}`,
        "bad",
      );
      showToast(
        why === "Tiempo máximo"
          ? "Pasó los 120 s: corrida no terminada (J = 120)."
          : "Salió de la pista: corrida no terminada (J = 120).",
      );
    },
    [mkLap, log, recordRun, showToast],
  );

  // --- Bucle de simulación ---
  const acc = useRef({ a1: 0, a2: 0, jit: 0, lostLogT: -9, lastTs: 0, lowLogged: false });
  useEffect(() => {
    let raf = 0;
    acc.current.lastTs = performance.now();
    const loop = (ts: number) => {
      const L = live.current;
      const a = acc.current;
      const dt = Math.min(0.05, (ts - a.lastTs) / 1000);
      a.lastTs = ts;
      const sim = simRef.current,
        m = mapRef.current;
      if (L.running && L.source === "sim") {
        const steps = Math.round(dt / DT);
        for (let i = 0; i < steps; i++) {
          const ev = sim.step(L.applied, { comp: L.comp, vbat: vbatRef.current });
          if (m.recording && m.est && m.raw) {
            const k = m.bias;
            const v = ((sim.pl + sim.pr) / 2 / 100) * VMAX * k,
              yaw =
                ((((sim.pl - sim.pr) / 100) * VMAX) / 0.13) *
                k *
                (1 + (Math.random() - 0.5) * 0.02);
            m.est.h += yaw * DT;
            const ds = Math.max(0, v) * DT;
            m.est.x += Math.cos(m.est.h) * ds;
            m.est.y += Math.sin(m.est.h) * ds;
            m.est.dist += ds;
            if (m.est.dist >= m.est.next) {
              m.est.next += 0.02;
              m.raw.push({ x: m.est.x, y: m.est.y, h: m.est.h });
            }
          }
          const bi = Math.min(NB - 1, Math.floor(((sim.s % LEN) / LEN) * NB));
          curBinsRef.current[bi] += Math.abs(sim.es);
          curCntRef.current[bi]++;
          if (ev === "lost" && sim.lapT - a.lostLogT > 0.6) {
            a.lostLogT = sim.lapT;
            log("Línea", `Perdida en S${sim.sec + 1}`, "warn");
          }
          if (ev === "lap") {
            onLap();
            if (!live.current.running) break;
          }
          if (ev === "crash") {
            onDNF("Salió de la pista");
            break;
          }
          if (ev === "timeout") {
            onDNF("Tiempo máximo");
            break;
          }
          a.a1 += DT;
          if (a.a1 >= 1 / RATE) {
            a.a1 -= 1 / RATE;
            const h = histRef.current;
            h.err.push(sim.p);
            h.pl.push(sim.pl);
            h.pr.push(sim.pr);
            if (h.err.length > HIST * RATE) {
              h.err.shift();
              h.pl.shift();
              h.pr.shift();
            }
          }
          a.a2 += DT;
          if (a.a2 >= 0.02 && m.path && !m.recording) {
            a.a2 = 0;
            const r = robotOn(m.path, sim.s, sim.e);
            trailRef.current.push({ x: r.x, y: r.y, err: Math.abs(sim.es) });
            if (trailRef.current.length > 90) trailRef.current.shift();
          }
        }
        vbatRef.current = Math.max(6.8, vbatRef.current - dt * (0.0035 + (L.turb / 100) * 0.004));
        if (vbatRef.current < 7.3 && !a.lowLogged) {
          a.lowLogged = true;
          log("Batería", `Baja: ${fmt(vbatRef.current, 2)} V, cámbiala pronto`, "warn");
        }
      }
      if (L.connected && L.source === "sim") {
        a.jit += dt;
        if (a.jit > 0.8) {
          a.jit = 0;
          linkRef.current = {
            dbm: 55 + Math.round(Math.random() * 8),
            ms: 9 + Math.round(Math.random() * 9),
          };
          setLinkTick((x) => (x + 1) % 1000);
        }
      }
      if (
        L.running ||
        (L.connected && (L.tab === "control" || L.tab === "telemetry")) ||
        (L.tab === "map" && m.recording)
      )
        bump();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onLap, onDNF, log, bump]);

  // --- Efectos de cuerpo (clases globales como en el prototipo) ---
  useEffect(() => {
    document.body.dataset.group = GROUP[tab];
  }, [tab]);
  useEffect(() => {
    document.body.classList.toggle("locked", locked);
  }, [locked]);
  useEffect(() => {
    document.body.classList.toggle("is-offline", !connected);
  }, [connected]);
  useEffect(() => {
    document.body.classList.toggle("show-pbi", showPbi);
  }, [showPbi]);
  useEffect(() => {
    document.body.dataset.scope = scope;
  }, [scope]);
  // Los paneles fuera del alcance activo deben ser realmente estáticos (EN-19): además del
  // atenuado por CSS, se marcan `inert` para que no respondan ni al ratón ni al teclado (salen
  // del orden de tabulación y del árbol de accesibilidad). Un observador cubre también lo que
  // monte React después (cambios de pestaña, paneles condicionales, botones de un map).
  useEffect(() => {
    const isOutOfScope = (s: string | undefined) =>
      (scope === "s1" && s !== "1") || (scope === "s2" && s === "W");
    const applyScope = () => {
      document.querySelectorAll<HTMLElement>("[data-sprint]").forEach((el) => {
        const outOfScope = isOutOfScope(el.dataset.sprint);
        if (el.inert !== outOfScope) el.inert = outOfScope;
      });
    };
    applyScope();
    const obs = new MutationObserver(applyScope);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [scope]);

  // --- Acciones ---
  const goTab = useCallback((t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);

  const setSource = useCallback(
    (value: Source) => {
      if (live.current.running) {
        showToast("Detén el robot antes de cambiar la fuente.");
        return;
      }
      if (
        value === "robot" &&
        (!remote.connected || remote.manifest?.id !== live.current.robotId)
      ) {
        showToast("El robot seleccionado aún no está conectado a la API o no envió su manifiesto.");
        return;
      }
      setSourceState(value);
      if (value === "sim") setConnected(true);
      log(
        "Enlace",
        value === "sim" ? "Fuente: datos simulados" : "Fuente: robot conectado a la API",
      );
    },
    [remote.connected, remote.manifest, log, showToast],
  );

  const toggleConnected = useCallback(() => {
    if (live.current.source === "robot") {
      showToast("El estado del enlace se recibe de la API.");
      return;
    }
    setConnected((c) => {
      const next = !c;
      if (!next) {
        if (live.current.running && live.current.mode === "test") {
          setRunning(false);
          log("Enlace", "Perdido: robot detenido (modo prueba)", "bad");
        } else
          log(
            "Enlace",
            live.current.running
              ? "Perdido: el robot sigue y graba las vueltas en su memoria"
              : "Perdido",
            "bad",
          );
      } else {
        const n = pendingSyncRef.current.length;
        while (pendingSyncRef.current.length)
          recordRun(pendingSyncRef.current.shift()!, "Sincronizada");
        log(
          "Enlace",
          n
            ? `Restablecido: ${n} vuelta${n > 1 ? "s" : ""} sincronizada${n > 1 ? "s" : ""} desde la memoria del robot`
            : "Restablecido",
          "good",
        );
        if (n)
          showToast(
            `${n} vuelta${n > 1 ? "s" : ""} recuperada${n > 1 ? "s" : ""} de la memoria del robot.`,
          );
      }
      return next;
    });
  }, [log, recordRun, showToast]);

  const changeBattery = useCallback(() => {
    vbatRef.current = 8.35;
    acc.current.lowLogged = false;
    log("Batería", "Cambiada: 8.35 V", "good");
    bump();
  }, [log, bump]);

  const toggleGate = useCallback(() => {
    setGate((g) => {
      const next = !g;
      log(
        "Cronómetro",
        next
          ? "Conectado: la barrera marca las vueltas"
          : "Desconectado: las vueltas se toman de la telemetría del robot",
        next ? "good" : "warn",
      );
      return next;
    });
  }, [log]);

  const toggleComp = useCallback(() => {
    setComp((v) => {
      const next = !v;
      log(
        "Firmware",
        next ? "Compensación de batería activada" : "Compensación de batería desactivada",
        next ? "good" : "warn",
      );
      showToast(
        next
          ? "El PWM se escala con el voltaje: tiempos comparables entre cargas."
          : "Sin compensación: los tiempos cambian con la batería.",
      );
      return next;
    });
  }, [log, showToast]);

  const setMode = useCallback(
    (v: Mode) => {
      if (live.current.source === "robot") {
        void sendRobotCommand("mode", { mode: v });
        return;
      }
      setModeState(v);
      log(
        "Modo",
        v === "test"
          ? "Prueba: vueltas continuas"
          : "Competencia: una vuelta y solo responde a Detener",
      );
    },
    [log, sendRobotCommand],
  );
  const setLine = useCallback(
    (v: LineColor) => {
      if (live.current.source === "robot") {
        void sendRobotCommand("line", { color: v });
        return;
      }
      setLineState(v);
      log("Sensores", v === "black" ? "Línea negra sobre blanco" : "Línea blanca sobre negro");
    },
    [log, sendRobotCommand],
  );
  const setTurb = useCallback((v: number) => setTurbState(v), []);

  const calibrate = useCallback(() => {
    if (live.current.source === "robot") {
      void sendRobotCommand("calibrate");
      return;
    }
    if (live.current.running || calibrating) return;
    if (!live.current.connected) return showToast("Sin enlace: no se puede calibrar.");
    setCalibrating(true);
    setCalProgress(0);
    const t0 = performance.now(),
      dur = 1800;
    const tickCal = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      setCalProgress(k);
      if (k < 1) {
        requestAnimationFrame(tickCal);
        return;
      }
      setCalibrating(false);
      setCalibrated(true);
      setCalProgress(0);
      const n = facts(currentVersion(robot).parts, catalog).sensors;
      log("Sensores", `Calibración completa: ${n}/${n} canales en 1.8 s`, "good");
    };
    requestAnimationFrame(tickCal);
  }, [calibrating, robot, catalog, log, showToast, sendRobotCommand]);

  const toggleRunning = useCallback(() => {
    if (live.current.source === "robot") {
      void sendRobotCommand(live.current.running ? "stop" : "start");
      return;
    }
    if (live.current.running) {
      setRunning(false);
      const m = mapRef.current;
      if (m.recording) {
        m.recording = false;
        m.raw = null;
      }
      log("Robot", "Detenido por el piloto");
      return;
    }
    if (!live.current.connected)
      return showToast("Sin enlace: el arranque inalámbrico necesita conexión.");
    if (!calibrated) return showToast("Calibra los sensores antes de arrancar.");
    simRef.current.reset();
    trailRef.current = [];
    lapCountRef.current = 1;
    curBinsRef.current.fill(0);
    curCntRef.current.fill(0);
    const m = mapRef.current;
    if (m.pending) {
      m.recording = true;
      m.est = { x: 0, y: 0, h: 0, dist: 0, next: 0 };
      m.raw = [{ x: 0, y: 0, h: 0 }];
      m.bias = 1 + (Math.random() * 0.08 - 0.04);
      log("Mapa", "Mapeando durante la vuelta 1");
    }
    log(
      "Robot",
      `Arranque inalámbrico · ${CTRL[live.current.applied.controller].name} · ${psum(live.current.applied.controller, live.current.applied.parameters)}`,
      "good",
    );
    setRunning(true);
    // Las corridas simuladas las ingresa el servicio externo; la consola solo lee su historial.
  }, [calibrated, log, showToast, sendRobotCommand]);

  // Setup
  const setCtrl = useCallback(
    (v: string) => {
      if (locked || v === draft.controller) return;
      setDraft({
        controller: v,
        parameters:
          v === applied.controller ? { ...applied.parameters } : { ...CTRL[v].presets.Base },
      });
      setPresetState(v === applied.controller ? null : "Base");
    },
    [locked, draft.controller, applied],
  );
  const setParam = useCallback(
    (id: string, val: number) => {
      if (locked || !CTRL[draft.controller].keys.includes(id)) return;
      const d = PDEF[id];
      const p = { ...draft.parameters };
      p[id] = clamp(+(+val).toFixed(d.dec + 1), d.min, d.max);
      setDraft({ controller: draft.controller, parameters: p });
      setPresetState(null);
    },
    [locked, draft],
  );
  const setPreset = useCallback(
    (name: string) => {
      if (locked) return;
      setDraft({
        controller: draft.controller,
        parameters: { ...CTRL[draft.controller].presets[name] },
      });
      setPresetState(name);
    },
    [locked, draft.controller],
  );
  const sendSetup = useCallback(() => {
    if (live.current.source === "robot") {
      void sendRobotCommand("setup", {
        controller: draft.controller,
        parameters: draft.parameters,
      }).then((sent) => {
        if (sent) setApplied(clone(draft));
      });
      return;
    }
    if (!connected) return showToast("Sin enlace: no se pudo enviar.");
    const chg = draft.controller !== applied.controller;
    setApplied(clone(draft));
    if (chg) log("Controller", `Cambiado a ${CTRL[draft.controller].name}`, "good");
    log("Setup", `Enviado: ${psum(draft.controller, draft.parameters)}`);
    showToast(
      chg
        ? `Controller ${CTRL[draft.controller].name} enviado al robot.`
        : "Setup enviado al robot.",
    );
  }, [connected, draft, applied.controller, log, showToast, sendRobotCommand]);
  const saveSetup = useCallback(() => {
    const setup = clone(draft);
    if (initialRobots && live.current.source !== "robot") {
      setApplied(setup);
      setSaved(setup);
      showToast("Setup guardado en esta simulación.");
      return;
    }
    const selectedId = robot.id;
    if (robot.currentVersionId == null) {
      showToast("Guarda una versión del robot antes de guardar el setup.");
      return;
    }
    void storeSetup(selectedId, robot.currentVersionId, setup)
      .then(async (stored) => {
        if (live.current.robotId !== selectedId) return;
        setSaved(setup);
        setSavedSetupId(stored.id);
        if (live.current.source === "robot") {
          try {
            await applyStoredSetup(selectedId, stored.id);
          } catch (error) {
            showToast(
              "Setup guardado en la API; no se pudo enviar: " +
                (error instanceof Error ? error.message : "sin conexión"),
            );
            return;
          }
        }
        setApplied(setup);
        log("Setup", "Guardado en la API", "good");
        showToast("Setup guardado en la API.");
      })
      .catch((error) =>
        showToast(
          "No se pudo guardar el setup: " +
            (error instanceof Error ? error.message : "sin conexión"),
        ),
      );
  }, [draft, initialRobots, robot, log, showToast]);

  const prepareExternalRun = useCallback(async () => {
    if (savedSetupId != null) return savedSetupId;
    if (robot.currentVersionId == null) {
      throw new Error("Guarda una versión del robot antes de iniciar una corrida externa.");
    }
    const stored = await storeSetup(robot.id, robot.currentVersionId, applied);
    setSavedSetupId(stored.id);
    setSaved(clone(applied));
    return stored.id;
  }, [savedSetupId, robot, applied]);

  // Ingeniero
  const setEngMethod = useCallback(
    (v: EngineerMethod) => {
      engRef.current.method = v;
      engRef.current.restart(
        runsRef.current.filter((r) => r.robot === live.current.robotId),
        live.current.applied.controller,
      );
      setEngMethodState(v);
      log("Ingeniero", v === "bayes" ? "Método: optimización bayesiana" : "Método: Twiddle");
    },
    [log],
  );
  const loadProposal = useCallback(() => {
    const eng = engRef.current;
    if (!eng.prop || locked) return;
    setDraft({ controller: eng.ctrl!, parameters: { ...eng.prop } });
    setPresetState(null);
    if (tab !== "control") goTab("control");
    showToast("Sugerencia cargada en el setup. Envíala y sal a pista.");
  }, [locked, tab, goTab, showToast]);
  const saveNote = useCallback(
    async (text: string): Promise<boolean> => {
      const value = text.trim();
      const run = lastRunRef.current;
      if (!run) {
        showToast("Aún no hay corridas.");
        return false;
      }
      if (!value) return false;
      const note = run.note ? `${run.note}. ${value}` : value;
      try {
        if (!initialRobots) {
          if (run.id === undefined) throw new Error("La corrida aún no está guardada");
          await annotateRun(run.id, note);
        }
        run.note = note;
        showToast(`Nota guardada en la corrida #${run.n}.`);
        bump();
        return true;
      } catch (error) {
        showToast(
          "No se pudo guardar la nota: " +
            (error instanceof Error ? error.message : "sin conexión"),
        );
        return false;
      }
    },
    [showToast, bump, initialRobots],
  );

  // Mapa
  const useExample = useCallback(() => {
    const m = mapRef.current;
    m.path = EXAMPLE;
    m.source = "pista de pruebas";
    m.pending = false;
    resetFraming();
    log("Mapa", "Usando el plano de la pista de pruebas");
    bump();
  }, [log, bump]);
  const rebuildMap = useCallback(() => {
    mapRef.current.pending = true;
    showToast("El mapa se rehará en la próxima vuelta desde la meta.");
    bump();
  }, [showToast, bump]);

  const toggleSignal = useCallback(
    (s: "err" | "pl" | "pr") => setShow((o) => ({ ...o, [s]: !o[s] })),
    [],
  );

  // Robot / perfil
  const selectRobot = useCallback(
    (id: string) => {
      if (id === live.current.robotId) return;
      if (live.current.running) return showToast("Detén el robot antes de cambiar.");
      setRobotId(id);
      setCalibrated(false);
      lapsRef.current = [];
      lastLapRef.current = null;
      lapCountRef.current = 0;
      bestSecRef.current = [Infinity, Infinity, Infinity];
      lastBinsRef.current = null;
      const r = robotById(robots, id)!;
      if (!r.fw && live.current.source === "robot") setSourceState("sim");
      engRef.current.reset(live.current.applied.controller);
      log(
        "Consola",
        `Robot seleccionado: ${r.name} ${currentVersion(r).v}. Paneles armados desde su manifiesto`,
        "good",
      );
      showToast(`${r.name}: la consola muestra solo lo que este robot tiene.`);
    },
    [robots, log, showToast],
  );
  const setProfile = useCallback(
    (id: string) => {
      setProfileId((cur) => {
        if (id === cur) return cur;
        store.set("profile", id);
        const p = profileById(profiles, id)!;
        log("Reglamento", `Profile activo: ${p.comp} · ${p.cat}`, "good");
        showToast(`Profile activo: ${p.comp} · ${p.cat}. La consola y el armador se ajustan.`);
        return id;
      });
    },
    [profiles, log, showToast],
  );

  const setCatalog = useCallback((f: (c: Component[]) => Component[]) => setCatalogState(f), []);
  const setRobots = useCallback((f: (r: RobotDef[]) => RobotDef[]) => setRobotsState(f), []);

  const openDetails = useCallback((id: string) => setDetailId(id), []);
  const closeDetails = useCallback(() => setDetailId(null), []);
  const openRegistration = useCallback(() => setRegOpen(true), []);
  const closeRegistration = useCallback(() => setRegOpen(false), []);
  const resetData = useCallback(() => {
    borrarRegistrados();
    setCatalogState(clone(CAT));
    setRobotsState(initialRobots ? clone(initialRobots) : []);
    if (!initialRobots) setRobotsRequest((value) => value + 1);
    setRobotId("v001");
    setDetailId(null);
    showToast("Datos de ejemplo restablecidos.");
  }, [showToast, initialRobots]);
  const openManifest = useCallback((id: string) => setManifestId(id), []);
  const closeManifest = useCallback(() => setManifestId(null), []);
  const openInBuilder = useCallback(
    (id: string) => {
      setInitialBuilderRobot(id);
      goTab("builder");
    },
    [goTab],
  );

  const setShowPbi = useCallback((v: boolean) => {
    setShowPbiState(v);
    store.set("pbi", v);
  }, []);
  const setScope = useCallback(
    (v: Scope) => {
      setScopeState(v);
      store.set("scope", v);
      showToast(
        v === "s1"
          ? "Alcance: Sprint 1. Lo que llega después se ve atenuado."
          : v === "s2"
            ? "Alcance: fin del curso. Solo lo que queda fuera se ve atenuado."
            : "Alcance: todo el diseño.",
      );
    },
    [showToast],
  );

  const apiMode = !initialRobots;
  const createRobot = useCallback(async (): Promise<RobotApi | null> => {
    const n = robots.filter((x) => x.type === "racer").length + 1;
    const label = String(n).padStart(3, "0");
    try {
      const created = await api.robots.create({
        name: `Velocista ${label}`,
        shortCode: label,
        type: "racer",
      });
      setRobotId(created.id);
      setRobotsRequest((value) => value + 1);
      log("Armador", `Robot ${created.name} creado y guardado en la base de datos`, "good");
      showToast(`Robot creado: ${created.name}. Se guardó en la base de datos.`);
      return created;
    } catch (e) {
      showToast(
        `No se pudo crear el robot: ${e instanceof ErrorApi ? e.message : "sin conexión con la API"}`,
      );
      return null;
    }
  }, [robots, log, showToast]);
  const createComponent = useCallback(
    async (data: {
      typeId: string;
      name: string;
      price: number;
      mass: number;
      store: string;
      amps?: number | null;
      specs: Specs;
      stock: number;
    }): Promise<Component | null> => {
      try {
        const created = await api.catalog.create(data);
        setCatalogRequest((value) => value + 1);
        log("Catálogo", `Component ${created.name} guardado en la base de datos`, "good");
        showToast(`${created.name} quedó guardado en la base de datos.`);
        return created;
      } catch (e) {
        showToast(
          `No se pudo guardar el componente: ${e instanceof ErrorApi ? e.message : "sin conexión con la API"}`,
        );
        return null;
      }
    },
    [log, showToast],
  );
  const saveVersion = useCallback(
    async (
      robotId: string,
      versionBaseId: number | null,
      parts: Parts,
      note: string,
    ): Promise<boolean> => {
      const apiParts: Record<string, { componentId: string; quantity: number }> = {};
      for (const [k, p] of Object.entries(parts)) {
        if (p) apiParts[k] = { componentId: p.id, quantity: p.qty };
      }
      try {
        await api.robots.createVersion(robotId, {
          baseVersionId: versionBaseId,
          note: note || "Cambio de piezas",
          status: "current",
          parts: apiParts,
        });
        setRobotsRequest((value) => value + 1);
        log("Armador", `Versión guardada en la base de datos · ${robotId}`, "good");
        showToast("Versión guardada en la base de datos. Las corridas nuevas usan esta versión.");
        return true;
      } catch (e) {
        showToast(
          `No se pudo guardar la versión: ${e instanceof ErrorApi ? e.message : "sin conexión con la API"}`,
        );
        return false;
      }
    },
    [log, showToast],
  );

  const value: ConsoleState = {
    tick,
    tab,
    goTab,
    catalog,
    robots,
    profiles,
    robot,
    robotId,
    profile,
    selectRobot,
    setProfile,
    source,
    setSource,
    robotConnected: source === "robot",
    connected,
    toggleConnected,
    link: linkRef.current,
    mode,
    setMode,
    line,
    setLine,
    calibrated,
    calibrating,
    calProgress,
    calibrate,
    running,
    toggleRunning,
    locked,
    gate,
    toggleGate,
    comp,
    toggleComp,
    turb,
    setTurb,
    vbat: vbatRef.current,
    changeBattery,
    draft,
    applied,
    saved,
    savedSetupId,
    preset,
    setCtrl,
    setParam,
    setPreset,
    sendSetup,
    saveSetup,
    prepareExternalRun,
    laps: lapsRef.current,
    runs: runsRef.current,
    runsError,
    refreshRuns,
    lastLap: lastLapRef.current,
    lastRun: lastRunRef.current,
    lapCount: lapCountRef.current,
    bestSec: bestSecRef.current,
    engMethod,
    setEngMethod,
    engineer: engRef.current,
    loadProposal,
    saveNote,
    mapMode,
    setMapMode,
    useExample,
    rebuildMap,
    show,
    toggleSignal,
    setCatalog,
    setRobots,
    apiMode,
    createRobot,
    createComponent,
    saveVersion,
    events: logRef.current,
    log,
    detailId,
    openDetails,
    closeDetails,
    regOpen,
    openRegistration,
    closeRegistration,
    resetData,
    manifestId,
    openManifest,
    closeManifest,
    initialBuilderRobot,
    openInBuilder,
    blOpen,
    setBlOpen,
    showPbi,
    setShowPbi,
    scope,
    setScope,
    toast,
    showToast,
    simRef,
    mapRef,
    trailRef,
    histRef,
    curBinsRef,
    curCntRef,
    lastBinsRef,
  };

  if (robotsLoading) return <p role="status">Cargando robots…</p>;
  if (robotsError)
    return (
      <div role="alert">
        {robotsError}
        <button type="button" onClick={() => setRobotsRequest((value) => value + 1)}>
          Reintentar
        </button>
      </div>
    );
  if (!robot) return <FirstRobot onCreate={createRobot} />;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useConsole(): ConsoleState {
  const c = useContext(Context);
  if (!c) throw new Error("useConsole debe usarse dentro de ConsoleProvider");
  return c;
}

export { RANURAS };
