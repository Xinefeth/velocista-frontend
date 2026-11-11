// 3. Medir (HU-37 por GPS, HU-40 por pasos): se camina el borde y el celular manda sus lecturas al
// backend en lotes cada 0,5 s (si se corta la conexión, la cola se reintenta). El mapa en vivo es
// aproximado; al terminar, el backend calcula perímetro, área y error de cierre con correcciones.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Msg, NO_MSG, usePhone, type MsgState } from "@/celular/context";
import { sensors, vibrate } from "@/celular/sensors";
import {
  dimensionLabels,
  type DimLabel,
  dots,
  drawLabels,
  grid,
  line,
  start as startMark,
  surface,
  tag,
} from "@/ui/components/measurement/draw";
import {
  errorText,
  fmtEs,
  GPS_MIN_SIDE_ADVICE,
  GPS_NO_TRIALS_ADVICE,
  GPS_TOO_SMALL_RESULT,
  MEASURE_BY_STEPS,
  METHOD_LABEL,
  MOTION_LABEL,
  MOTION_NO_DATA_REASON,
  OPEN_GPS_TAB,
  QUALITY,
  SESSION_EXPIRED_TEXT,
  signedPct,
  WARNINGS,
} from "@/domain/measurement/labels";
import {
  chainSides,
  polygonDims,
  realCorners,
  type PlacedLabel,
} from "@/domain/measurement/dimensions";
import {
  closeRadius,
  LIVE_MAX_ANGLE_SIDES,
  liveView,
  newLiveState,
  stepLive,
  type LiveState,
  type LiveView,
} from "@/domain/measurement/liveCorners";
import { boundsOf, fitView, rectangle } from "@/domain/measurement/plot";
import {
  DEFAULT_STEP_M,
  motionState,
  NO_DATA_MS,
  type MotionSample,
  type MotionState,
  fixSideHeading,
  integrateTurn,
  markCorner as closeSide,
  newWalk,
  shouldMarkCorner,
  stepCounter,
  stepForward,
  toLocal,
  type Fix,
  type WalkState,
} from "@/domain/measurement/phone";
import { smallField, TARGET_PCT } from "@/domain/measurement/gpsFit";
import { ExportDxfButton } from "@/ui/components/measurement/ExportDxfButton";
import { gpsApi, measurementsApi, READINGS_BATCH } from "@/infrastructure/http/measurements";
import type {
  MeasurementApi,
  MeasurementBodyApi,
  MethodApi,
  ReadingApi,
} from "@/infrastructure/contracts/measurements";

/** El backend rechaza más lecturas de las permitidas por medición con 409 y esta razón. */
export const TOO_MANY_READINGS = "measurement_too_many_readings";

/** ¿El error es el tope de lecturas de la medición? (reintentar no sirve: hay que dejar de enviar) */
export function isReadingCap(error: unknown): boolean {
  const e = error as { status?: number; reason?: string } | null;
  return e?.status === 409 && e?.reason === TOO_MANY_READINGS;
}

/** Iconos del chip de movimiento (la palabra va siempre al lado: el color no es la única pista). */
const MOTION_ICON: Record<MotionState, ReactNode> = {
  walking: (
    <path d="M13 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM9 21l2-6-2-2 1-5 3 2 2 3M11 9l-3 1-1 3" />
  ),
  still: <path d="M9 5v14M15 5v14" />,
  no_data: <path d="M12 8v5M12 16.5v.5M4 20L12 4l8 16z" />,
};

const FLUSH_MS = 500;
const DRAW_MS = 300;

export interface SetupForm {
  method: MethodApi;
  place: string;
  hasRef: boolean;
  length: string;
  width: string;
  tape: string;
  scaleN: string;
}

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && n > 0 ? n : null;
};

/** Cuerpo de POST /measurements a partir del formulario, o el error de la entrada. */
export function measurementBody(f: SetupForm, deviceId: string): MeasurementBodyApi | string {
  const place = f.place.trim();
  if (!place) return "Escribe el nombre del lugar.";
  const body: MeasurementBodyApi = {
    method: f.method,
    source: "phone",
    mount: f.method === "car" ? "robot" : "hand",
    place_name: place,
    device_id: deviceId,
  };
  if (f.method === "gps" || !f.hasRef) return body;
  const L = num(f.length);
  const W = num(f.width);
  if (!L || !W)
    return "Escribe el largo y el ancho reales (o desmarca «Tengo las medidas reales»).";
  body.reference = { points: rectangle(L, W), scale_n: num(f.scaleN) ?? 1, name: "" };
  const tape = num(f.tape);
  if (f.tape.trim() && !tape) return "El primer lado medido debe ser un número mayor que 0.";
  if (tape) body.tape_side_m = tape;
  return body;
}

interface Run {
  id: number;
  method: MethodApi;
  seq: number;
  queue: ReadingApi[];
  sent: number;
  sending: boolean;
  /** El backend llegó al tope de lecturas: ya no se encolan ni se envían más. */
  capped: boolean;
  stopped: boolean;
  t0: number;
  walk: WalkState;
  marks: { x: number; y: number }[];
  /** Esquinas detectadas sobre la marcha en el camino abierto (método GPS, sin esquinas marcadas). */
  live: LiveState;
  gps0: Fix | null;
  lastT: number | null;
  lastCorner: number;
  lastAuto: boolean;
  /** Últimas lecturas del acelerómetro (unos segundos) para el estado caminando / quieto. */
  motion: MotionSample[];
  offs: (() => void)[];
  timers: number[];
}

function drawResult(cv: HTMLCanvasElement | null, m: MeasurementApi | null) {
  const s = surface(cv);
  const r = m?.result;
  if (!s || !r) return;
  const b = boundsOf(r.raw_path, r.corrected_path, r.polygon);
  if (!b) return;
  // solo las esquinas reales: un recorrido GPS trae cientos de puntos y no se rotulan todos
  const corners = realCorners(r.polygon).points;
  const dims = polygonDims(corners);
  // con más de 12 lados solo longitudes, sin ángulos (como en la consola)
  const withAngles = corners.length <= LIVE_MAX_ANGLE_SIDES;
  // margen amplio si hay cotas: se dibujan hacia afuera del contorno
  const view = fitView(b, s.w, s.h, dims ? 40 : 14);
  line(s, view, r.raw_path, { color: s.color("--dim"), width: 1.2 });
  line(s, view, r.corrected_path, { color: s.color("--red"), width: 2.4 });
  if (corners.length <= LIVE_MAX_ANGLE_SIDES) dots(s, view, corners, s.color("--ink"), 4);
  if (dims) drawLabels(s, view, dimensionLabels(dims, { angles: withAngles }));
}

export function Measure({
  active,
  onOpenGpsTab,
}: {
  active: boolean;
  /** Lleva a la pestaña 4 (error del GPS), donde se hacen las pruebas de SP-06. */
  onOpenGpsTab?: () => void;
}) {
  const { device, cal, notify } = usePhone();
  const [form, setForm] = useState<SetupForm>({
    method: "steps",
    place: "",
    hasRef: false,
    length: "",
    width: "",
    tape: "",
    scaleN: "1",
  });
  const [screen, setScreen] = useState<"setup" | "run" | "result">("setup");
  const [startMsg, setStartMsg] = useState<MsgState>(NO_MSG);
  const [runMsg, setRunMsg] = useState<MsgState>(NO_MSG);
  const [histMsg, setHistMsg] = useState<MsgState>(NO_MSG);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{
    sent: number;
    pending: number;
    secs: number;
    corners: number;
    motion: MotionState;
  }>({ sent: 0, pending: 0, secs: 0, corners: 0, motion: "no_data" });
  const [result, setResult] = useState<MeasurementApi | null>(null);
  const [history, setHistory] = useState<MeasurementApi[]>([]);
  const run = useRef<Run | null>(null);
  const liveCv = useRef<HTMLCanvasElement>(null);
  const resultCv = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0);
  // Lado mínimo del GPS según SP-06: undefined = aún no se consulta, null = sin pruebas
  const [minSide, setMinSide] = useState<number | null | undefined>(undefined);
  const minSideFor = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await measurementsApi.list({ deviceId: device })).items);
    } catch {
      /* sin conexión */
    }
  }, [device]);

  useEffect(() => {
    if (active) void loadHistory();
  }, [active, loadHistory]);
  // Una sola consulta al entrar en Medir (y otra si cambia el código del celular); sin sondeo
  useEffect(() => {
    if (!active || minSideFor.current === device) return;
    minSideFor.current = device;
    setMinSide(undefined);
    gpsApi
      .summary(device, TARGET_PCT)
      .then((s) => setMinSide(s.min_side_m ?? null))
      .catch(() => {
        // sin conexión: no se avisa antes; el aviso del servidor al terminar sigue
        minSideFor.current = null;
      });
  }, [active, device]);
  useEffect(() => drawResult(resultCv.current, result), [result, screen]);
  useEffect(() => () => stop(), []);

  const set = <K extends keyof SetupForm>(k: K, v: SetupForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function stop() {
    const r = run.current;
    if (!r) return;
    r.stopped = true;
    r.offs.forEach((off) => off());
    r.timers.forEach((t) => window.clearInterval(t));
  }

  /** Encola una lectura para el siguiente lote (no hace nada si ya se llegó al tope). */
  function enqueue(r: Run, reading: ReadingApi) {
    if (!r.capped) r.queue.push(reading);
  }

  async function flush() {
    const cur = run.current; // si se cancela mientras envía, run pasa a null
    if (!cur || cur.sending || cur.capped || !cur.queue.length) return;
    cur.sending = true;
    const batch = cur.queue.slice(0, READINGS_BATCH);
    try {
      const r = await measurementsApi.send(cur.id, batch);
      cur.queue.splice(0, batch.length);
      cur.sent = r.total_readings;
      if (!cur.stopped) setRunMsg({ text: "Enviando ✔", kind: "" });
    } catch (e) {
      if (isReadingCap(e)) {
        // tope de lecturas: se deja de enviar y de encolar, pero la medición se puede terminar
        cur.capped = true;
        cur.queue.length = 0;
        if (run.current === cur) setRunMsg({ text: errorText(e), kind: "err" });
      } else if (run.current === cur) {
        // las lecturas siguen en la cola: se reenvían solas al volver la conexión o la sesión
        const expired = (e as { status?: number } | null)?.status === 401;
        setRunMsg({
          text: expired ? SESSION_EXPIRED_TEXT : `Sin conexión, se reintentará: ${errorText(e)}`,
          kind: "err",
        });
      }
    } finally {
      cur.sending = false;
    }
  }

  function markCorner(auto: boolean) {
    const r = run.current;
    if (!r) return;
    const now = Date.now();
    // el botón no vuelve a marcar una esquina que el giro marcó hace poco (4 s)
    if (now - r.lastCorner < (auto ? 1500 : r.lastAuto ? 4000 : 1500)) {
      if (!auto)
        setRunMsg({ text: "Esa esquina ya se marcó. Camina hasta la siguiente.", kind: "" });
      return;
    }
    r.lastCorner = now;
    r.lastAuto = auto;
    enqueue(r, { seq: r.seq++, t_ms: now, kind: "corner" });
    r.marks.push(r.walk.path[r.walk.path.length - 1]);
    const side = r.walk.dist - r.walk.sideFrom;
    r.walk = closeSide(r.walk);
    setRunMsg({
      text: `${auto ? "Giraste: " : ""}esquina ${r.marks.length} ✔ · lado ${r.walk.sides.length} = ${fmtEs(side, 1)} m. Empieza el lado ${r.walk.sides.length + 1}.`,
      kind: "good",
    });
    vibrate(auto ? [120, 80, 120] : 120);
  }

  /**
   * Esquinas, lados y ángulos del trazo en vivo. Con esquinas marcadas (por pasos, o 3 o más) mandan
   * esas, con lo caminado en cada lado. Si no (método GPS), se detectan sobre el camino abierto: el
   * seguimiento se recalcula como máximo cada segundo y solo con un punto nuevo, y lo confirmado no se
   * mueve. Para el mismo recorrido el resultado final usa `realCorners` sobre el contorno suavizado del
   * servidor, así que el número de esquinas puede diferir en una por el ruido del camino crudo.
   */
  function liveModel(r: Run, advance: boolean): { view: LiveView; detected: number } {
    const pts = r.walk.path;
    const here = pts[pts.length - 1];
    const marked = r.method !== "gps" || r.marks.length >= 3;
    if (!marked && advance) r.live = stepLive(r.live, pts, Date.now());
    const corners = marked ? r.marks : r.live.corners.map((c) => c.p);
    const v = liveView(pts[0], corners, here, {
      walked: marked ? r.walk.sides : undefined,
      currentWalked: marked ? r.walk.dist - r.walk.sideFrom : undefined,
      closeWithin: closeRadius(marked ? 0 : r.live.tol),
    });
    return { view: v, detected: marked ? 0 : r.live.corners.length };
  }

  function drawLive() {
    const r = run.current;
    const s = surface(liveCv.current);
    setTick((n) => n + 1);
    if (!r || !s) return;
    const pts = r.walk.path;
    const here = pts[pts.length - 1];
    const b = boundsOf(pts)!;
    const v = fitView(b, s.w, s.h, Math.min(s.w, s.h) * 0.14, 4);
    const model = liveModel(r, true).view;
    grid(s, v);
    line(s, v, [here, pts[0]], { color: s.color("--dim"), width: 1, dash: [4, 5] });
    line(s, v, pts, { color: s.color("--red"), width: 2.6 });
    for (const q of r.marks) {
      const [x, y] = v.P(q);
      s.ctx.fillStyle = s.color("--ink");
      s.ctx.beginPath();
      s.ctx.moveTo(x, y - 5);
      s.ctx.lineTo(x + 5, y);
      s.ctx.lineTo(x, y + 5);
      s.ctx.lineTo(x - 5, y);
      s.ctx.fill();
    }
    // esquinas detectadas (GPS): un punto blanco, como las esquinas del resultado
    if (r.method === "gps")
      dots(
        s,
        v,
        r.live.corners.map((c) => c.p),
        s.color("--ink"),
        4,
      );
    const side = model.current?.length ?? 0;
    const [hereX, hereY] = v.P(here);
    const [startX, startY] = v.P(pts[0]);
    // huecos que ya ocupan el círculo de «tú», el marcador INI y el largo del tramo actual
    const taken: PlacedLabel[] = [
      { id: "here", x: hereX, y: hereY, w: 18, h: 18, free: true },
      { id: "start", x: startX, y: startY, w: 22, h: 22, free: true },
    ];
    if (!model.closed && side >= 0.3) {
      tag(s, hereX, hereY - 8, `${fmtEs(side, 1)} m`, s.color("--red-hi"));
      taken.push({ id: "side", x: hereX, y: hereY - 12.5, w: 70, h: 17, free: true });
    }
    // Largo de cada lado terminado, sobre el lado (hacia afuera del recorrido)
    const verts = model.sides.length ? [model.sides[0].from, ...model.sides.map((x) => x.to)] : [];
    const labels: DimLabel[] = chainSides(
      verts,
      model.sides.map((x) => x.length),
    ).map((c) => ({ id: `side-${c.index}`, text: c.label, at: c.mid, outward: c.outward }));
    // Ángulo en cada esquina, en grados enteros; no pisa a los largos porque van en la misma colocación
    for (const [i, a] of model.angles.entries())
      labels.push({ id: `angle-${i}`, text: `${a.deg}°`, at: a.at, outward: a.outward });
    const toStart = Math.hypot(here.x - pts[0].x, here.y - pts[0].y);
    if (!model.closed && toStart >= 0.3)
      labels.push({
        id: "to-start",
        text: `Inicio ${fmtEs(toStart, 1)} m`,
        at: { x: (here.x + pts[0].x) / 2, y: (here.y + pts[0].y) / 2 },
        outward: { x: -(here.y - pts[0].y) / toStart, y: (here.x - pts[0].x) / toStart },
      });
    drawLabels(s, v, labels, taken);
    startMark(s, v, pts[0]);
    const [hx, hy] = v.P(here);
    s.ctx.strokeStyle = s.color("--ink");
    s.ctx.lineWidth = 2;
    s.ctx.beginPath();
    s.ctx.arc(hx, hy, 6, 0, 2 * Math.PI);
    s.ctx.stroke();
  }

  async function begin() {
    setStartMsg(NO_MSG);
    try {
      if (form.method !== "gps") sensors.needMotion();
      if (form.method === "gps" && !sensors.fix)
        throw new Error("Espera a que el GPS tenga señal (pestaña 1).");
      const body = measurementBody(form, device);
      if (typeof body === "string") throw new Error(body);
      setBusy(true);
      const m = await measurementsApi.start(body);
      const count = stepCounter(cal?.step_threshold_ms2 ?? undefined);
      const stepM = cal?.step_length_m ?? DEFAULT_STEP_M;
      const bias = cal?.gyro_calibrated ? cal.gyro_bias_dps : 0;
      const r: Run = {
        id: m.id,
        method: form.method,
        seq: 0,
        queue: [],
        sent: 0,
        sending: false,
        capped: false,
        stopped: false,
        t0: Date.now(),
        walk: newWalk(),
        marks: [],
        live: newLiveState(),
        gps0: null,
        lastT: null,
        lastCorner: 0,
        lastAuto: false,
        motion: [],
        offs: [],
        timers: [],
      };
      run.current = r;
      r.offs.push(
        sensors.onMotion((t, gz, acc) => {
          if (acc) {
            r.motion.push({ t, acc });
            while (r.motion.length && t - r.motion[0].t > NO_DATA_MS) r.motion.shift();
          }
          if (r.method === "gps") return;
          const reading: ReadingApi = { seq: r.seq++, t_ms: t, kind: "motion" };
          if (gz != null) reading.gyro_z_dps = gz;
          if (acc) reading.accel = acc;
          enqueue(r, reading);
          if (gz != null && r.lastT != null)
            r.walk = { ...r.walk, heading: integrateTurn(r.walk.heading, gz, bias, t - r.lastT) };
          if (gz != null) r.lastT = t;
          if (count(t, acc) > r.walk.steps) r.walk = stepForward(r.walk, stepM);
          // esquina automática: rumbo fijado a 0,5 m y giro de más de 60° tras 1 m en el lado
          r.walk = fixSideHeading(r.walk);
          if (shouldMarkCorner(r.walk)) markCorner(true);
        }),
        sensors.onFix((f) => {
          enqueue(r, {
            seq: r.seq++,
            t_ms: f.t_ms,
            kind: "gps",
            lat: f.lat,
            lon: f.lon,
            accuracy_m: f.accuracy_m,
          });
          if (r.method !== "gps") return;
          if (!r.gps0) {
            r.gps0 = f;
            return;
          }
          const p = toLocal(f, r.gps0);
          const last = r.walk.path[r.walk.path.length - 1];
          r.walk = {
            ...r.walk,
            dist: r.walk.dist + Math.hypot(p.x - last.x, p.y - last.y),
            path: [...r.walk.path, p],
          };
        }),
      );
      r.timers.push(
        window.setInterval(() => void flush(), FLUSH_MS),
        window.setInterval(drawLive, DRAW_MS),
        window.setInterval(
          () =>
            setView({
              sent: r.sent,
              pending: r.queue.length,
              secs: Math.round((Date.now() - r.t0) / 1000),
              corners: r.marks.length,
              // mismo temporizador de 500 ms que el contador: sin temporizador nuevo
              motion: motionState(r.motion, Date.now(), cal?.step_threshold_ms2 ?? undefined),
            }),
          500,
        ),
      );
      setScreen("run");
      setRunMsg({
        text:
          form.method === "gps"
            ? "Camina por el borde y termina donde empezaste."
            : "Camina por el borde. Al girar en cada esquina, se marca sola.",
        kind: "",
      });
    } catch (e) {
      setStartMsg({ text: errorText(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const r = run.current;
    if (!r) return;
    setBusy(true);
    r.offs.forEach((off) => off());
    r.offs = [];
    setRunMsg({ text: "Enviando las últimas lecturas…", kind: "" });
    try {
      for (let i = 0; i < 40 && !r.capped && (r.queue.length || r.sending); i++) {
        await flush();
        if (r.queue.length || r.sending) await new Promise((ok) => window.setTimeout(ok, 500));
      }
      if (r.queue.length && !r.capped)
        throw new Error(
          "No se pudieron enviar todas las lecturas. Revisa la conexión y toca de nuevo.",
        );
      setRunMsg({ text: "Calculando…", kind: "" });
      const m = await measurementsApi.finish(r.id);
      stop();
      run.current = null;
      setResult(m);
      setScreen("result");
      void loadHistory();
    } catch (e) {
      const text = errorText(e);
      setRunMsg({ text, kind: "err" });
      if (/corta|calibrar/i.test(text)) {
        stop();
        run.current = null;
        setScreen("setup");
        setStartMsg({ text, kind: "err" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const r = run.current;
    if (
      !r ||
      !window.confirm(
        "¿Cancelar y borrar esta medición? Lo que caminaste hasta ahora no se guarda.",
      )
    )
      return;
    stop();
    run.current = null;
    setScreen("setup");
    try {
      await measurementsApi.remove(r.id);
      notify("Medición cancelada ✔");
    } catch (e) {
      setStartMsg({
        text: `Se canceló aquí, pero no se pudo borrar: ${errorText(e)} Bórrala con 🗑 en Mis mediciones.`,
        kind: "err",
      });
    }
    void loadHistory();
  }

  async function remove(m: MeasurementApi) {
    if (!window.confirm(`¿Borrar la medición «${m.place_name} #${m.id}»? No se puede recuperar.`))
      return;
    try {
      await measurementsApi.remove(m.id);
      notify(`«${m.place_name}» borrada ✔`);
      if (result?.id === m.id) {
        setResult(null);
        setScreen("setup");
      }
      void loadHistory();
    } catch (e) {
      setHistMsg({ text: errorText(e), kind: "err" });
    }
  }

  async function open(m: MeasurementApi) {
    if (!m.result)
      return setHistMsg({
        text: "Esta medición no terminó, así que no tiene resultado. Puedes borrarla con 🗑.",
        kind: "err",
      });
    if (run.current)
      return setHistMsg({ text: "Termina o cancela la medición en curso primero.", kind: "err" });
    try {
      setResult(await measurementsApi.get(m.id));
      setScreen("result");
      setHistMsg(NO_MSG);
    } catch (e) {
      setHistMsg({ text: errorText(e), kind: "err" });
    }
  }

  const r = run.current;
  const res = result?.result ?? null;
  const q = res ? QUALITY[res.quality] : null;
  const gps = form.method === "gps";
  // filas del panel en vivo: lados terminados y ángulos de las mismas esquinas que el lienzo
  const liveRows = (() => {
    if (!r)
      return { sides: [] as number[], angles: [] as { name: string; deg: number }[], detected: 0 };
    const m = liveModel(r, false);
    return {
      sides: m.view.sides.map((x) => x.length),
      angles: m.view.angles.map((a) => ({ name: a.name, deg: a.deg })),
      detected: m.detected,
    };
  })();
  const side = r ? r.walk.dist - r.walk.sideFrom : 0;
  const tooSmall =
    result?.closed && res && result.method === "gps" && minSide != null
      ? smallField(res.perimeter_m, minSide)
      : null;

  return (
    <>
      {screen === "setup" && (
        <section className="card">
          <div className="hd">
            <h2>Preparar la medición</h2>
          </div>
          <label className="lbl" htmlFor="method">
            ¿Qué vas a medir?
          </label>
          <select
            id="method"
            className="inp"
            value={form.method}
            onChange={(e) => set("method", e.target.value as MethodApi)}
          >
            <option value="steps">Lugar chico: cuarto, aula, patio (por pasos)</option>
            <option value="gps">Lugar grande: terreno, parque, cancha (por GPS)</option>
            <option value="car" disabled>
              Carro + celular encima (próximamente)
            </option>
          </select>
          <p className="hint">
            {gps
              ? "Se mide caminando el borde con el GPS. No necesitas saber cuánto mide."
              : "Se mide caminando el borde: el celular cuenta tus pasos y tus giros."}
          </p>
          {gps && minSide !== undefined && (
            <div className="gpsadvice" role="status">
              {minSide != null ? (
                <p>{GPS_MIN_SIDE_ADVICE(fmtEs(minSide, 1))}</p>
              ) : (
                <>
                  <p>{GPS_NO_TRIALS_ADVICE}</p>
                  {onOpenGpsTab && (
                    <button type="button" className="sb wide" onClick={onOpenGpsTab}>
                      {OPEN_GPS_TAB}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <label className="lbl" htmlFor="place">
            Nombre del lugar
          </label>
          <input
            id="place"
            className="inp"
            placeholder={gps ? "Ej. Parque central" : "Ej. Mi cuarto"}
            value={form.place}
            onChange={(e) => set("place", e.target.value)}
          />
          {!gps && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 14,
                fontSize: 13,
                color: "var(--mid)",
              }}
            >
              <input
                type="checkbox"
                checked={form.hasRef}
                onChange={(e) => set("hasRef", e.target.checked)}
                style={{ width: 22, height: 22, flex: "none" }}
              />
              Tengo las medidas reales (solo para comprobar cuánto se equivoca)
            </label>
          )}
          {!gps && form.hasRef && (
            <>
              <div className="row">
                <div>
                  <label className="lbl" htmlFor="planL">
                    Largo real (m)
                  </label>
                  <input
                    id="planL"
                    className="inp"
                    type="number"
                    inputMode="decimal"
                    value={form.length}
                    onChange={(e) => set("length", e.target.value)}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="planW">
                    Ancho real (m)
                  </label>
                  <input
                    id="planW"
                    className="inp"
                    type="number"
                    inputMode="decimal"
                    value={form.width}
                    onChange={(e) => set("width", e.target.value)}
                  />
                </div>
              </div>
              <label className="lbl" htmlFor="tape">
                Primer lado medido (m, opcional)
              </label>
              <input
                id="tape"
                className="inp"
                type="number"
                inputMode="decimal"
                value={form.tape}
                onChange={(e) => set("tape", e.target.value)}
              />
              <label className="lbl" htmlFor="planN">
                Escala del plano (déjalo en 1)
              </label>
              <input
                id="planN"
                className="inp"
                type="number"
                inputMode="decimal"
                value={form.scaleN}
                onChange={(e) => set("scaleN", e.target.value)}
              />
            </>
          )}
          {gps ? (
            <ol>
              <li>
                Sal al aire libre y espera a que la precisión del GPS sea de <b>±5 m o menos</b>.
              </li>
              <li>Camina por el borde del terreno y termina donde empezaste.</li>
            </ol>
          ) : (
            <ol>
              <li>
                Empieza en una <b>esquina</b> y camina pegada al borde.
              </li>
              <li>
                En cada esquina <b>gira quieta</b>: la esquina se marca sola.
              </li>
              <li>
                Termina en tu <b>marca real del piso</b> y{" "}
                <b>gira hasta mirar hacia donde empezaste</b>.
              </li>
            </ol>
          )}
          <div className="row">
            <button type="button" className="go" disabled={busy} onClick={() => void begin()}>
              Iniciar medición
            </button>
          </div>
          <Msg {...startMsg} />
        </section>
      )}

      {screen === "run" && r && (
        <section className="card">
          <div className="hd">
            <h2>Midiendo…</h2>
            <span className="tag red">En vivo</span>
          </div>
          <div className="bigside">
            <span>{r.method === "gps" ? "Recorrido" : `Lado ${r.walk.sides.length + 1}`}</span>
            <b>{fmtEs(r.method === "gps" ? r.walk.dist : side, 1)} m</b>
          </div>
          <canvas ref={liveCv} aria-label="Mapa en vivo" />
          <p className="legend">● Inicio · Rojo: tu camino · ○ tú · ◆ esquinas</p>
          <p className={`motion ${view.motion}`} role="status" aria-live="polite">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {MOTION_ICON[view.motion]}
            </svg>
            <span>
              <b>{MOTION_LABEL[view.motion]}</b>
              {view.motion === "no_data" && <small>{MOTION_NO_DATA_REASON}</small>}
            </span>
          </p>
          <div className="kv" style={{ marginTop: 10 }}>
            <span>Lados terminados</span>
            <b className="list">
              {liveRows.sides.length ? (
                liveRows.sides.map((len, i) => (
                  <span key={i}>{`${i + 1}) ${fmtEs(len, 1)} m`}</span>
                ))
              ) : (
                <span>—</span>
              )}
            </b>
            <span>Ángulos</span>
            <b className="list">
              {liveRows.angles.length ? (
                liveRows.angles.map((a) => <span key={a.name}>{`${a.name} ${a.deg}°`}</span>)
              ) : (
                <span>—</span>
              )}
            </b>
            <span>Pasos</span>
            <b>{r.method === "gps" ? "—" : r.walk.steps}</b>
            <span>Distancia recorrida</span>
            <b>{fmtEs(r.walk.dist, 1)} m</b>
            <span>Distancia al inicio</span>
            <b>
              {fmtEs(
                Math.hypot(
                  r.walk.path[r.walk.path.length - 1].x - r.walk.path[0].x,
                  r.walk.path[r.walk.path.length - 1].y - r.walk.path[0].y,
                ),
                1,
              )}{" "}
              m
            </b>
            <span>Esquinas detectadas</span>
            <b>{r.method === "gps" ? liveRows.detected : "—"}</b>
            <span>Esquinas marcadas</span>
            <b>{view.corners}</b>
            <span>Tiempo</span>
            <b>{view.secs} s</b>
            <span>Lecturas enviadas</span>
            <b>{view.sent}</b>
            <span>Pendientes de enviar</span>
            <b>{view.pending}</b>
          </div>
          {r.method !== "gps" && (
            <div className="row">
              <button type="button" className="sb wide" onClick={() => markCorner(false)}>
                ¿No se marcó sola? Marcar esquina
              </button>
            </div>
          )}
          <div className="row">
            <button type="button" className="go stop" disabled={busy} onClick={() => void finish()}>
              Terminar y calcular
            </button>
          </div>
          <div className="row">
            <button type="button" className="sb wide" onClick={() => void cancel()}>
              Cancelar y borrar (me equivoqué)
            </button>
          </div>
          <Msg {...runMsg} />
        </section>
      )}

      {screen === "result" && result && res && q && (
        <section className="card" aria-label="Resultado">
          <div className="hd">
            <h2>
              Resultado <span className={`tag ${q.tone === "bad" ? "red" : q.tone}`}>{q.tag}</span>
            </h2>
          </div>
          <p className="hint" style={{ marginTop: -4 }}>
            {result.place_name} #{result.id} · {METHOD_LABEL[result.method]}
          </p>
          <div className={`semaforo ${q.tone === "bad" ? "red" : q.tone}`}>
            <span className="dotl" />
            <div>
              <b>{q.label}</b>
              <small>{q.desc}</small>
            </div>
          </div>
          <div className="kv">
            <span>Perímetro</span>
            <b>{fmtEs(res.perimeter_m, 2)} m</b>
            <span>Área</span>
            <b>{fmtEs(res.area_m2, 2)} m²</b>
            <span>Error de cierre</span>
            <b>
              {fmtEs(res.closure_error_m, 2)} m ({fmtEs(res.closure_error_pct, 1)} %)
            </b>
            <span>Recorrido</span>
            <b>{fmtEs(res.distance_m, 2)} m</b>
            <span>{result.method === "steps" ? "Pasos" : "Lecturas"}</span>
            <b>{result.method === "steps" ? res.step_count : res.reading_count}</b>
            <span>Frente al plano (perímetro / área)</span>
            <b>
              {res.perimeter_error_pct == null
                ? "Sin plano"
                : `${signedPct(res.perimeter_error_pct)} / ${signedPct(res.area_error_pct)}`}
            </b>
          </div>
          {res.warnings.length > 0 && (
            <ul className="warns">
              {res.warnings.map((w) => (
                <li key={w}>{WARNINGS[w] ?? w}</li>
              ))}
            </ul>
          )}
          {tooSmall && (
            <div className="gpsadvice warn" role="status">
              <p>{GPS_TOO_SMALL_RESULT(fmtEs(tooSmall.side, 1), fmtEs(tooSmall.minSide, 1))}</p>
              <button
                type="button"
                className="sb red wide"
                onClick={() => {
                  // vuelve al formulario con el mismo lugar y el método por pasos
                  setForm((f) => ({ ...f, method: "steps", place: result.place_name }));
                  setScreen("setup");
                }}
              >
                {MEASURE_BY_STEPS}
              </button>
            </div>
          )}
          <canvas ref={resultCv} aria-label="Mapa del resultado" />
          <p className="legend">Gris: medido · Rojo: corregido · ● esquinas</p>
          <div className="row">
            <ExportDxfButton measurement={result} className="sb wide" textClass="hint" />
          </div>
          <div className="row">
            <button type="button" className="sb red wide" onClick={() => setScreen("setup")}>
              Nueva medición
            </button>
          </div>
          <div className="row">
            <button type="button" className="sb wide" onClick={() => void remove(result)}>
              Borrar esta medición
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="hd">
          <h2>Mis mediciones</h2>
        </div>
        <div className="tw">
          <table className="t" aria-label="Mis mediciones">
            <thead>
              <tr>
                <th>Lugar</th>
                <th>Método</th>
                <th>Perímetro</th>
                <th>Área</th>
                <th>Cierre</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!history.length && (
                <tr>
                  <td colSpan={6}>Aún no hay mediciones.</td>
                </tr>
              )}
              {history.map((m) => {
                const mq = m.result ? QUALITY[m.result.quality] : null;
                return (
                  <tr
                    key={m.id}
                    className={result?.id === m.id ? "sel" : undefined}
                    onClick={() => void open(m)}
                    style={{ cursor: m.result ? "pointer" : undefined }}
                  >
                    <td>
                      {m.place_name} #{m.id}
                    </td>
                    <td>{METHOD_LABEL[m.method]}</td>
                    <td>{m.result ? `${fmtEs(m.result.perimeter_m, 1)} m` : "—"}</td>
                    <td>{m.result ? `${fmtEs(m.result.area_m2, 1)} m²` : "—"}</td>
                    <td>
                      {m.result && mq ? (
                        <span className={`tag ${mq.tone === "bad" ? "red" : mq.tone}`}>
                          {fmtEs(m.result.closure_error_pct, 1)} %
                        </span>
                      ) : (
                        "sin terminar"
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="sb ico"
                        aria-label={`Borrar ${m.place_name} #${m.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(m);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Toca una medición para ver sus detalles y su mapa. 🗑 borra una medición equivocada.
        </p>
        <div className="row">
          <button type="button" className="sb" onClick={() => void loadHistory()}>
            Actualizar
          </button>
        </div>
        <Msg {...histMsg} />
      </section>
    </>
  );
}
