// Vista Odometría · Medir terreno (CU-1: HU-34, HU-38 y HU-40) en 4 pasos, como el prototipo.
// La medición la hace el celular (página /celular.html): la consola prepara el lugar y su plano,
// muestra si ese celular está calibrado, sigue en vivo la medición en curso (lecturas que llegan
// al backend) y analiza el resultado frente al plano. Todo con datos reales de la API.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/ui/components/Card";
import { ExportDxfButton } from "@/ui/components/measurement/ExportDxfButton";
import { Hint, Kpis, Semaforo } from "@/ui/components/measurement/MeasurementUi";
import { ImportDxfPlan } from "@/ui/components/measurement/ImportDxfPlan";
import { TrackPlanPicker } from "@/ui/components/measurement/TrackPlanPicker";
import { SidesTable } from "@/ui/components/measurement/SidesTable";
import {
  dimensionLabels,
  drawLabels,
  dots,
  grid,
  line,
  start,
  summaryBox,
  surface,
} from "@/ui/components/measurement/draw";
import { useCanvas } from "@/application/hooks/useCanvas";
import {
  deviceCode,
  errorText,
  fmtEs,
  METHOD_LABEL,
  QUALITY,
  signedPct,
} from "@/domain/measurement/labels";
import {
  diffLabel,
  lengthLabel,
  MAX_ANGLE_CORNERS,
  polygonDims,
  realCorners,
  sideDiffs,
} from "@/domain/measurement/dimensions";
import { importedPlanOf, type DxfSource } from "@/domain/measurement/dxfParse";
import {
  EMPTY_PICK,
  isTrackPlanError,
  planOfPick,
  TRACK_PLAN_SCALE_ERROR,
  type TrackPick,
} from "@/domain/measurement/trackPlan";
import type { Track } from "@/domain/track/types";
import { area, boundsOf, fitView, perimeter, type Pt } from "@/domain/measurement/plot";
import {
  closureSegment,
  compareWithPlan,
  CONTOURS,
  DXF_PLAN_MISSING,
  planOf,
  recommendations,
  referencePoints,
  tapeSideOf,
  TRACK_PLAN_MISSING,
  type ContourId,
  type PlaceForm,
} from "@/domain/measurement/odometry";
import { calibrationsApi, measurementsApi } from "@/infrastructure/http/measurements";
import type {
  CalibrationStateApi,
  MeasurementApi,
  ReadingApi,
} from "@/infrastructure/contracts/measurements";

type Step = 1 | 2 | 3 | 4;
const STEPS: [Step, string][] = [
  [1, "Fuente y lugar"],
  [2, "Calibrar"],
  [3, "Medir"],
  [4, "Resultado"],
];
/** Cada cuánto se consulta la medición en curso (ms). */
export const POLL_MS = 3000;
const LAST_READINGS = 30;

function MapCanvas({
  m,
  plan,
  corrected,
}: {
  m: MeasurementApi | null;
  plan: Pt[] | null;
  corrected: boolean;
}) {
  const ref = useCanvas((cv) => {
    const s = surface(cv);
    if (!s) return;
    const r = m?.result;
    const ref0 = referencePoints(m, plan);
    const raw = r?.raw_path ?? [];
    const corr = r?.corrected_path ?? [];
    const b = boundsOf(ref0, raw, corrected ? corr : []);
    if (!b) return;
    // margen amplio: las cotas y los ángulos se dibujan hacia afuera del contorno medido
    // las esquinas reales (un recorrido GPS trae cientos de puntos; rotular cada uno no se lee)
    const corners = r ? realCorners(r.polygon).points : [];
    const view = fitView(b, s.w, s.h, corners.length >= 3 ? 56 : 30, 2);
    grid(s, view);
    if (ref0)
      line(s, view, ref0, { color: s.color("--mid"), width: 1.4, dash: [6, 5], closed: true });
    line(s, view, raw, { color: s.color("--red"), width: 2.4 });
    if (corrected) line(s, view, corr, { color: s.color("--green"), width: 2.4 });
    line(s, view, closureSegment(raw), { color: s.color("--yellow"), width: 2, dash: [3, 3] });
    if (r && corners.length <= MAX_ANGLE_CORNERS) dots(s, view, corners, s.color("--ink"), 4);
    if (raw.length) start(s, view, raw[0]);
    // Cotas: largo de cada lado del contorno medido (con la diferencia frente al plano si es
    // comparable), nombre y ángulo de cada vértice, y perímetro y área del recorrido
    const dims = r ? polygonDims(corners) : null;
    if (r && dims) {
      const diffs = ref0 ? sideDiffs(realCorners(ref0).points, corners) : null;
      const lines = [
        `Medido ${lengthLabel(corrected ? r.perimeter_m : r.raw_perimeter_m)} · ${fmtEs(corrected ? r.area_m2 : r.raw_area_m2, 2)} m²`,
      ];
      if (ref0) {
        const plan0 = polygonDims(ref0);
        if (plan0) lines.push(`Plano ${lengthLabel(plan0.perimeter)} · ${fmtEs(plan0.area, 2)} m²`);
      }
      const box = summaryBox(s, lines);
      drawLabels(
        s,
        view,
        dimensionLabels(dims, {
          angles: corners.length <= MAX_ANGLE_CORNERS,
          sideText: (i) =>
            diffs ? `${dims.sides[i].label} ${diffLabel(diffs[i].diff)}` : dims.sides[i].label,
        }),
        box,
      );
    }
  });
  return (
    <div className="cv h360">
      <canvas ref={ref} role="img" aria-label="Plano de referencia y recorrido medido" />
    </div>
  );
}

export function Odometry() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<PlaceForm>({
    contour: "aula",
    name: "",
    length: "10",
    width: "6",
    scaleN: "50",
    tapeSide: "",
  });
  const [device, setDevice] = useState("");
  const [all, setAll] = useState<MeasurementApi[]>([]);
  const [cal, setCal] = useState<CalibrationStateApi | null>(null);
  const [live, setLive] = useState<MeasurementApi | null>(null);
  const [readings, setReadings] = useState<ReadingApi[]>([]);
  const [selected, setSelected] = useState<MeasurementApi | null>(null);
  const [corrected, setCorrected] = useState(true);
  const [msg, setMsg] = useState("");

  // Plano leído de un archivo DXF (solo cuenta cuando se elige «Plano desde archivo»)
  const [dxfSource, setDxfSource] = useState<DxfSource | null>(null);
  const imported = useMemo(() => importedPlanOf(dxfSource), [dxfSource]);

  // Pista guardada del Trazador (CU-1): la elección vive solo mientras la vista está abierta
  const [pick, setPick] = useState<TrackPick>(EMPTY_PICK);
  // las pistas las carga el selector (una sola vez, solo al elegir esta fuente) y las comparte aquí
  const [tracks, setTracks] = useState<Track[]>([]);
  const trackResult = useMemo(
    () => (form.contour === "pista" ? planOfPick(tracks, pick) : null),
    [form.contour, tracks, pick],
  );
  const trackPlan = trackResult && !isTrackPlanError(trackResult) ? trackResult : null;

  const place =
    trackResult && isTrackPlanError(trackResult)
      ? trackResult.error
      : planOf(form, imported, trackPlan);
  const placeError = typeof place === "string" ? place : "";
  // «Elige un archivo .dxf.» y «Elige una pista guardada.» se quitan en cuanto hay un plano válido
  // o se cambia de lugar; el error de escala, en cuanto la escala es válida
  useEffect(() => {
    if (msg === DXF_PLAN_MISSING && (form.contour !== "dxf" || imported)) setMsg("");
    if ((msg === TRACK_PLAN_MISSING || msg === TRACK_PLAN_SCALE_ERROR) && msg !== placeError)
      setMsg("");
  }, [msg, form.contour, imported, placeError]);
  const tape = tapeSideOf(form);
  const plan = typeof place === "string" ? null : place.plan;
  const devices = useMemo(() => [...new Set(all.map((m) => m.device_id))], [all]);
  const mine = useMemo(
    () => all.filter((m) => !device || m.device_id === device).sort((a, b) => b.id - a.id),
    [all, device],
  );

  const loadAll = useCallback(async () => {
    try {
      const page = await measurementsApi.list();
      setAll(page.items);
      setDevice((d) => d || page.items[0]?.device_id || "");
      return page.items;
    } catch (e) {
      setMsg(errorText(e));
      return [];
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Paso 2: estado de calibración del celular elegido.
  useEffect(() => {
    if (step !== 2 || !device) return;
    let alive = true;
    calibrationsApi
      .state(device)
      .then((s) => alive && setCal(s))
      .catch((e) => alive && setMsg(errorText(e)));
    return () => {
      alive = false;
    };
  }, [step, device]);

  // Paso 3: sigue la medición en curso de ese celular y sus últimas lecturas.
  useEffect(() => {
    if (step !== 3 || !device) return;
    let alive = true;
    const tick = async () => {
      try {
        const page = await measurementsApi.list({ deviceId: device });
        if (!alive) return;
        setAll((cur) => [...cur.filter((m) => m.device_id !== device), ...page.items]);
        const current = [...page.items].sort((a, b) => b.id - a.id)[0] ?? null;
        setLive(current);
        if (current) {
          const rs = await measurementsApi.readings(current.id);
          if (alive) setReadings(rs.slice(-LAST_READINGS).reverse());
        }
      } catch (e) {
        if (alive) setMsg(errorText(e));
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [step, device]);

  async function open(id: number) {
    try {
      setSelected(await measurementsApi.get(id));
      setStep(4);
      setMsg("");
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  async function remove(m: MeasurementApi) {
    if (!window.confirm(`¿Borrar la medición «${m.place_name} #${m.id}»? No se puede recuperar.`))
      return;
    try {
      await measurementsApi.remove(m.id);
      if (selected?.id === m.id) setSelected(null);
      await loadAll();
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  function next(to: Step) {
    if (to > 1 && typeof place === "string") return setMsg(place);
    if (to > 1 && typeof tape === "string") return setMsg(tape);
    if (to > 1 && !device) return setMsg("Elige el celular con el que se mide (su código).");
    setMsg("");
    setStep(to);
  }

  const set = (k: keyof PlaceForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const method = CONTOURS[form.contour].method;
  const r = selected?.result ?? null;
  const diff = selected ? compareWithPlan(selected, plan, corrected) : null;
  const q = r ? QUALITY[r.quality] : null;
  const ready = cal?.ready[method] ?? false;
  const liveDone = live?.status === "finished";

  return (
    <section
      className="view on dv odo-flow"
      data-step={step}
      aria-label="Odometría · Medir terreno"
    >
      <Card className="s12 odo-head" pbi="HU-34 · HU-38 · HU-40" sprint="2">
        <div className="hd">
          <h2>Odometría · Medir terreno</h2>
          <span className={`tag ${ready ? "good" : ""}`.trim()}>
            {ready ? "Listo para medir" : "Falta calibrar"}
          </span>
        </div>
        <ol className="pills">
          {STEPS.map(([n, label]) => (
            <li key={n}>
              <button
                type="button"
                className={n < step ? "done" : undefined}
                aria-current={n === step ? "step" : undefined}
                onClick={() => next(n)}
              >
                <span>{n}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        <Hint text={msg} error />
      </Card>

      {/* PASO 1 */}
      <Card className="s7 on1">
        <div className="hd">
          <h2>1 · Fuente y lugar</h2>
        </div>
        <div className="rows" style={{ marginTop: 0 }}>
          <label className="fld">
            <span className="lbl">Celular que mide (código)</span>
            <input
              className="inp m"
              list="odo-devices"
              aria-label="Celular que mide"
              value={device}
              onChange={(e) => setDevice(e.target.value.trim())}
            />
            <datalist id="odo-devices">
              {devices.map((d) => (
                <option key={d} value={d}>
                  {deviceCode(d)}
                </option>
              ))}
            </datalist>
          </label>
          <label className="fld">
            <span className="lbl">Lugar o contorno</span>
            <select
              className="inp"
              aria-label="Lugar o contorno"
              value={form.contour}
              onChange={(e) => set("contour", e.target.value as ContourId)}
            >
              {Object.entries(CONTOURS).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {form.contour === "escala" && (
            <div className="g3">
              <label className="fld">
                <span className="lbl">Escala 1:</span>
                <input
                  className="inp m"
                  aria-label="Escala 1:N"
                  value={form.scaleN}
                  onChange={(e) => set("scaleN", e.target.value)}
                />
              </label>
              <label className="fld">
                <span className="lbl">Largo dibujo (cm)</span>
                <input
                  className="inp m"
                  aria-label="Largo del dibujo"
                  value={form.length}
                  onChange={(e) => set("length", e.target.value)}
                />
              </label>
              <label className="fld">
                <span className="lbl">Ancho dibujo (cm)</span>
                <input
                  className="inp m"
                  aria-label="Ancho del dibujo"
                  value={form.width}
                  onChange={(e) => set("width", e.target.value)}
                />
              </label>
            </div>
          )}
          {form.contour === "dxf" && <ImportDxfPlan value={dxfSource} onChange={setDxfSource} />}
          {form.contour === "pista" && (
            <TrackPlanPicker value={pick} onChange={setPick} onTracks={setTracks} />
          )}
          {form.contour === "otro" && (
            <>
              <label className="fld">
                <span className="lbl">Nombre del lugar</span>
                <input
                  className="inp"
                  aria-label="Nombre del lugar"
                  placeholder="Ej. Mi casa"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </label>
              <div className="g2">
                <label className="fld">
                  <span className="lbl">Largo (m), opcional</span>
                  <input
                    className="inp m"
                    aria-label="Largo del lugar"
                    value={form.length}
                    onChange={(e) => set("length", e.target.value)}
                  />
                </label>
                <label className="fld">
                  <span className="lbl">Ancho (m), opcional</span>
                  <input
                    className="inp m"
                    aria-label="Ancho del lugar"
                    value={form.width}
                    onChange={(e) => set("width", e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          <label className="fld">
            <span className="lbl">Lado medido con cinta (m), opcional</span>
            <input
              className="inp m"
              aria-label="Lado medido con cinta"
              placeholder="Ej. 8.00 (el primer lado)"
              value={form.tapeSide}
              onChange={(e) => set("tapeSide", e.target.value)}
            />
          </label>
        </div>
        <div className="navb">
          <span />
          <button type="button" className="sb red" onClick={() => next(2)}>
            Siguiente: calibrar
          </button>
        </div>
      </Card>
      <Card className="s5 on1">
        <div className="hd">
          <h2>Qué vas a medir</h2>
        </div>
        <Kpis
          label="Plano del lugar"
          items={[
            { label: "Método", value: METHOD_LABEL[method] },
            {
              label: "Perímetro del plano",
              value: plan ? fmtEs(perimeter(plan), 1) : "—",
              unit: "m",
            },
            { label: "Área del plano", value: plan ? fmtEs(area(plan), 1) : "—", unit: "m²" },
          ]}
        />
        <ul className="checks" style={{ marginTop: 10 }}>
          <li className="ok">
            <span className="ic" />
            <span>
              <b>Abre la página del celular</b>
              <small>/celular.html en el celular, con HTTPS. Usa el mismo código de celular.</small>
            </span>
          </li>
          <li className="ok">
            <span className="ic" />
            <span>
              <b>{method === "gps" ? "Camina el borde con GPS" : "Camina pegada al borde"}</b>
              <small>Empieza en una esquina y termina en el mismo punto.</small>
            </span>
          </li>
        </ul>
      </Card>

      {/* PASO 2 */}
      <Card className="s12 on2">
        <div className="hd">
          <h2>2 · Calibrar sensores</h2>
          <span className={`tag ${ready ? "good" : ""}`.trim()}>
            {ready ? "Calibrado" : "Pendiente"}
          </span>
        </div>
        <p className="note" style={{ margin: "0 0 12px" }}>
          La calibración se hace en el celular (pestaña «Calibrar»). Aquí se ve lo que tiene
          guardado el celular {device ? deviceCode(device) : ""}.
        </p>
        <div className="guides">
          <div className={`guide ${cal?.calibration.gyro_calibrated ? "ok" : ""}`.trim()}>
            <div className="gt">
              <b>Dejar el celular quieto 5 s</b>
            </div>
            <div className="res">
              {cal?.calibration.gyro_calibrated
                ? `Sesgo ${fmtEs(cal.calibration.gyro_bias_dps, 3)} °/s`
                : "Falta calibrar el giroscopio"}
            </div>
          </div>
          <div className={`guide ${cal?.calibration.step_length_m ? "ok" : ""}`.trim()}>
            <div className="gt">
              <b>Calibrar el paso: caminar 20 m, 3 veces</b>
            </div>
            <div className="res">
              {cal?.calibration.step_length_m
                ? `Paso = ${fmtEs(cal.calibration.step_length_m, 3)} m`
                : "Opcional: sin calibrar se usa 0,70 m"}
            </div>
          </div>
          <div className={`guide ${cal?.calibration.speed_k != null ? "ok" : ""}`.trim()}>
            <div className="gt">
              <b>Velocidad del carro (v = k·PWM + c)</b>
            </div>
            <div className="res">
              {cal?.calibration.speed_k != null
                ? `k = ${fmtEs(cal.calibration.speed_k, 4)}`
                : "Solo si se mide con el carro"}
            </div>
          </div>
        </div>
        <div className="navb">
          <button type="button" className="sb" onClick={() => next(1)}>
            Atrás
          </button>
          <button type="button" className="sb red" onClick={() => next(3)}>
            Siguiente: medir
          </button>
        </div>
      </Card>

      {/* PASO 3 y 4: mapa */}
      <Card className="s8 on3 on4 odo-map">
        <div className="hd">
          <h2>
            Recorrido{" "}
            <small>
              {selected && step === 4
                ? `${selected.place_name} #${selected.id}`
                : typeof place === "string"
                  ? ""
                  : place.name}
            </small>
          </h2>
          <span className={`tag ${step === 4 && q ? q.tone : ""}`.trim()}>
            {step === 4
              ? q
                ? "Terminado"
                : "Sin resultado"
              : live?.status === "recording"
                ? "Midiendo"
                : "Esperando"}
          </span>
        </div>
        <MapCanvas m={step === 4 ? selected : null} plan={plan} corrected={corrected} />
        <div className="legend">
          <span>
            <i className="ln dash" />
            Plano de referencia
          </span>
          <span>
            <i className="ln" style={{ borderColor: "var(--red)" }} />
            Medido
          </span>
          <span>
            <i className="ln" style={{ borderColor: "var(--green)" }} />
            Corregido
          </span>
          <span>
            <i className="ln" style={{ borderColor: "var(--yellow)" }} />
            Error de cierre
          </span>
          <span>
            <i className="pt" />
            Esquina
          </span>
        </div>
      </Card>
      <Card className="s4 on3">
        <div className="hd">
          <h2>3 · Medir</h2>
        </div>
        {live ? (
          <Semaforo
            tone={liveDone ? "good" : "warn"}
            title={
              liveDone
                ? `Terminada: ${live.place_name} #${live.id}`
                : `Midiendo ${live.place_name} #${live.id}`
            }
            sub={`${live.reading_count} lecturas recibidas`}
          />
        ) : (
          <Semaforo title="Esperando al celular" sub="Toca «Iniciar medición» en el celular." />
        )}
        <p className="note">
          Empieza en una esquina y termina en el mismo punto. La consola se actualiza cada{" "}
          {POLL_MS / 1000} s.
        </p>
        <div className="navb">
          <button type="button" className="sb" onClick={() => next(2)}>
            Atrás
          </button>
          <button
            type="button"
            className="sb red"
            disabled={!liveDone}
            onClick={() => live && void open(live.id)}
          >
            Ver resultado
          </button>
        </div>
      </Card>

      {/* PASO 4 */}
      <Card className="s5 on4">
        <div className="hd">
          <h2>4 · Resultado</h2>
          <span className={`tag ${q?.tone ?? ""}`.trim()}>{q?.tag ?? "Sin medir"}</span>
        </div>
        {r && q ? (
          <>
            <Semaforo
              tone={q.tone}
              title={q.label}
              sub={`Error de cierre ${fmtEs(r.closure_error_pct, 1)} % (bueno: menos de 3 %)`}
            />
            <Kpis
              label="Medidas del resultado"
              items={[
                {
                  label: "Perímetro",
                  value: fmtEs(corrected ? r.perimeter_m : r.raw_perimeter_m, 1),
                  unit: diff
                    ? `m · plano ${fmtEs(diff.planPerimeter, 1)} m · ${signedPct(diff.perimeterPct)}`
                    : "m",
                },
                {
                  label: "Área",
                  value: fmtEs(corrected ? r.area_m2 : r.raw_area_m2, 1),
                  unit: diff
                    ? `m² · plano ${fmtEs(diff.planArea, 1)} m² · ${signedPct(diff.areaPct)}`
                    : "m²",
                },
                {
                  label: "Error de cierre",
                  value: fmtEs(r.closure_error_m, 2),
                  unit: `m · ${fmtEs(r.closure_error_pct, 1)} % del recorrido`,
                  tone: q.tone,
                },
                selected?.method === "gps"
                  ? { label: "Lecturas", value: r.reading_count }
                  : {
                      label: "Pasos",
                      value: r.step_count,
                      unit: `paso ${fmtEs(selected?.calibration.step_length_m ?? 0.7, 2)} m`,
                    },
              ]}
            />
            <SidesTable polygon={r.polygon} plan={referencePoints(selected, plan)} />
            <div className="corr">
              <button
                type="button"
                className="sw"
                role="switch"
                aria-checked={corrected}
                onClick={() => setCorrected((c) => !c)}
              >
                <i />
                Corregir por cierre (reparte el error en todo el recorrido)
              </button>
              <button
                type="button"
                className="sw"
                role="switch"
                aria-checked={r.scale_factor != null}
                disabled
              >
                <i />
                {r.scale_factor != null
                  ? `Escala corregida con el lado medido (× ${fmtEs(r.scale_factor, 3)})`
                  : "Corregir escala con el lado medido (no se midió con cinta)"}
              </button>
            </div>
            <div className="lbl" style={{ marginTop: 14 }}>
              Recomendaciones
            </div>
            <ul className="checks" aria-label="Recomendaciones">
              {selected &&
                recommendations(selected).map((a) => (
                  <li key={a.title} className={a.tone}>
                    <span className="ic" />
                    <span>
                      <b>{a.title}</b>
                      <small>{a.sub}</small>
                    </span>
                  </li>
                ))}
            </ul>
            {selected && (
              <div style={{ marginTop: 14 }}>
                <ExportDxfButton measurement={selected} />
              </div>
            )}
            <div className="navb">
              <button type="button" className="sb" onClick={() => next(3)}>
                Repetir medición
              </button>
              <button
                type="button"
                className="sb red"
                onClick={() => selected && void remove(selected)}
              >
                Borrar medición
              </button>
            </div>
          </>
        ) : (
          <p className="note">Elige una medición terminada en «Mediciones guardadas».</p>
        )}
      </Card>
      <Card className="s12 on4" pbi="EN-33" sprint="2">
        <div className="hd">
          <h2>Mediciones guardadas</h2>
          <span className="tag">{mine.length}</span>
        </div>
        <div className="tw">
          <table className="t compact" aria-label="Mediciones guardadas">
            <thead>
              <tr>
                <th className="l">#</th>
                <th className="l">Fuente</th>
                <th className="l">Lugar</th>
                <th className="l">Calibrado</th>
                <th>Perímetro</th>
                <th>Área</th>
                <th>Cierre</th>
                <th>Error vs plano</th>
                <th className="l">Corrección</th>
                <th className="l">Calidad</th>
              </tr>
            </thead>
            <tbody>
              {!mine.length && (
                <tr>
                  <td className="l" colSpan={10}>
                    Aún no hay mediciones guardadas.
                  </td>
                </tr>
              )}
              {mine.map((m) => {
                const mq = m.result ? QUALITY[m.result.quality] : null;
                return (
                  <tr key={m.id} className={selected?.id === m.id ? "sel" : undefined}>
                    <td className="l">
                      <button
                        type="button"
                        className="sb"
                        onClick={() => void open(m.id)}
                        disabled={!m.result}
                        aria-label={`Abrir ${m.place_name} #${m.id}`}
                      >
                        #{m.id}
                      </button>
                    </td>
                    <td className="l">Celular · {METHOD_LABEL[m.method].toLowerCase()}</td>
                    <td className="l">{m.place_name}</td>
                    <td className="l">{m.calibration.gyro_calibrated ? "Sí" : "No"}</td>
                    <td>{m.result ? `${fmtEs(m.result.perimeter_m, 1)} m` : "—"}</td>
                    <td>{m.result ? `${fmtEs(m.result.area_m2, 1)} m²` : "—"}</td>
                    <td>
                      {m.result ? `${fmtEs(m.result.closure_error_pct, 1)} %` : "sin terminar"}
                    </td>
                    <td>{signedPct(m.result?.perimeter_error_pct)}</td>
                    <td className="l">{m.result?.scale_factor != null ? "escala" : "ninguna"}</td>
                    <td className="l">
                      {mq ? <span className={`badge ${mq.tone}`}>{mq.tag}</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="s12 on3">
        <div className="hd">
          <h2>
            Lecturas del celular <small>acelerómetro, giroscopio y GPS</small>
          </h2>
          <span className="tag">{live?.reading_count ?? 0}</span>
        </div>
        <div className="tw" style={{ maxHeight: 220, overflow: "auto" }}>
          <table className="t compact" aria-label="Lecturas del celular">
            <thead>
              <tr>
                <th>t (s)</th>
                <th className="l">Tipo</th>
                <th>Giro (°/s)</th>
                <th>|a| (m/s²)</th>
                <th>Lat, lon</th>
                <th>Precisión</th>
              </tr>
            </thead>
            <tbody>
              {!readings.length && (
                <tr>
                  <td className="l" colSpan={6}>
                    Aún no llegan lecturas.
                  </td>
                </tr>
              )}
              {readings.map((x) => {
                const t0 = live ? Date.parse(live.started_at) : x.t_ms;
                return (
                  <tr key={x.seq}>
                    <td>{fmtEs((x.t_ms - t0) / 1000, 2)}</td>
                    <td className="l">
                      {x.kind === "motion" ? "movimiento" : x.kind === "gps" ? "GPS" : "esquina"}
                    </td>
                    <td>{fmtEs(x.gyro_z_dps, 1)}</td>
                    <td>{x.accel ? fmtEs(Math.hypot(...x.accel), 2) : "—"}</td>
                    <td>
                      {x.lat != null && x.lon != null
                        ? `${x.lat.toFixed(6)}, ${x.lon.toFixed(6)}`
                        : "—"}
                    </td>
                    <td>{x.accuracy_m != null ? `± ${fmtEs(x.accuracy_m, 1)} m` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
