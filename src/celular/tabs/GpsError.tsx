// 4. Error GPS (SP-06): guía de 3 pasos. 1) quieta en el inicio 20 s, 2) caminar hasta el final
// viendo el recorrido, 3) quieta en el final 20 s. El backend compara la distancia del GPS con la
// real (cinta, pasos calibrados o ida y vuelta = 0 m) con tres métodos.
import { useCallback, useEffect, useRef, useState } from "react";
import { Msg, NO_MSG, usePhone, type MsgState } from "@/celular/context";
import { sensors } from "@/celular/sensors";
import { line, start as startMark, surface } from "@/ui/components/measurement/draw";
import { errorText, fmtEs } from "@/domain/measurement/labels";
import { fitView } from "@/domain/measurement/plot";
import { stepCounter, stillPoint, toLocal, type Fix } from "@/domain/measurement/phone";
import { recommendedAccuracy, waitText } from "@/domain/measurement/gpsSize";
import {
  DistanceTable,
  EnvironmentTable,
  GpsConclusion,
  ReportedVsReal,
  WaitTables,
} from "@/ui/components/measurement/GpsSizePanels";
import { gpsApi } from "@/infrastructure/http/measurements";
import type {
  EnvironmentApi,
  GpsSummaryApi,
  GpsTrialApi,
} from "@/infrastructure/contracts/measurements";

export const STILL_S = 20;
type RefMode = "known" | "steps" | "loop";

/** Distancia real de la prueba: la escrita, pasos × paso calibrado o 0 (ida y vuelta). */
export function realDistance(mode: RefMode, typed: number, steps: number, stepM: number | null) {
  if (mode === "loop") return 0;
  if (mode === "known") return typed;
  return stepM ? steps * stepM : 0;
}

/** Semáforo del resultado: en % si hay distancia real, en metros en ida y vuelta. */
export function gpsTone(errorM: number, errorPct: number | null) {
  if (errorPct == null) return errorM < 5 ? "good" : errorM < 10 ? "warn" : "red";
  return errorPct < 5 ? "good" : errorPct < 15 ? "warn" : "red";
}

const METHOD_NAMES = {
  single: "Una sola lectura (como una app normal)",
  mean: "Promedio de lecturas",
  filtered: "Promedio filtrado (el mejor)",
};

interface Trial {
  start: Fix[];
  track: { x: number; y: number }[];
  startPt: { lat: number; lon: number } | null;
  steps: number;
  cancelled: boolean;
  offs: (() => void)[];
}

/** Precisión a esperar: la escrita, 0 = no esperar, o la recomendada (null si no hay ninguna). */
export function neededAccuracy(typed: string, recommended: number | null): number | null {
  const t = typed.trim().replace(",", ".");
  if (t === "") return recommended;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function GpsError({ active }: { active: boolean }) {
  const { device, cal, notify } = usePhone();
  const [place, setPlace] = useState("");
  const [env, setEnv] = useState<EnvironmentApi>("open");
  const [mode, setMode] = useState<RefMode>("known");
  const [real, setReal] = useState("30");
  const [stage, setStage] = useState<"idle" | "wait" | "start" | "walk" | "end" | "done">("idle");
  // CU-4: precisión que se espera antes de medir; vacío = la recomendada por las pruebas, 0 = no esperar
  const [waitAcc, setWaitAcc] = useState("");
  const skipWait = useRef(false);
  const [left, setLeft] = useState(0);
  const [live, setLive] = useState({ steps: 0, dist: 0, acc: 0 });
  const [res, setRes] = useState<GpsTrialApi | null>(null);
  const [msg, setMsg] = useState<MsgState>(NO_MSG);
  const [list, setList] = useState<GpsTrialApi[]>([]);
  const [summary, setSummary] = useState<GpsSummaryApi | null>(null);
  const trial = useRef<Trial | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const stepM = cal?.step_length_m ?? null;
  const needed = neededAccuracy(waitAcc, recommendedAccuracy(summary));

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([gpsApi.list(device), gpsApi.summary(device)]);
      setList(l);
      setSummary(s);
    } catch {
      /* sin conexión */
    }
  }, [device]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);
  useEffect(() => () => reset(), []);

  function draw() {
    const t = trial.current;
    const s = surface(cv.current);
    if (!t || !s) return;
    const pts = [{ x: 0, y: 0 }, ...t.track];
    const r = realDistance(mode, Number(real), t.steps, stepM);
    const span = Math.max(r * 1.3, ...pts.map((q) => Math.hypot(q.x, q.y) * 2.2), 10);
    const v = fitView(
      { x0: -span / 2, x1: span / 2, y0: -span / 2, y1: span / 2 },
      s.w,
      s.h,
      0,
      span,
    );
    s.ctx.setLineDash([4, 5]);
    s.ctx.strokeStyle = s.color("--dim");
    s.ctx.beginPath();
    s.ctx.arc(s.w / 2, s.h / 2, r * v.k, 0, 2 * Math.PI);
    s.ctx.stroke();
    s.ctx.setLineDash([]);
    line(s, v, pts, { color: s.color("--red"), width: 2.4 });
    startMark(s, v, pts[0]);
  }

  function reset() {
    trial.current?.offs.forEach((off) => off());
    trial.current = null;
    setStage("idle");
  }

  /** Espera a que el GPS informe `needed` m o menos; el botón «Medir sin esperar» la salta. */
  function waitForAccuracy(t: Trial, limit: number) {
    skipWait.current = false;
    return new Promise<void>((done) => {
      const finish = () => {
        window.clearInterval(timer);
        off();
        done();
      };
      const off = sensors.onFix((f) => {
        setLive((l) => ({ ...l, acc: f.accuracy_m }));
        if (f.accuracy_m <= limit) finish();
      });
      const timer = window.setInterval(() => {
        if (t.cancelled || skipWait.current) finish();
      }, 250);
      t.offs.push(finish);
    });
  }

  async function still(t: Trial) {
    return sensors.collectFixes(STILL_S, setLeft, () => t.cancelled);
  }

  async function onButton() {
    try {
      // durante la espera de precisión el botón mide sin esperar
      if (stage === "wait") {
        skipWait.current = true;
        return;
      }
      if (stage === "idle") {
        setMsg(NO_MSG);
        setRes(null);
        if (!sensors.fix)
          throw new Error("No hay señal GPS: activa los sensores (pestaña 1) y sal al aire libre.");
        if (mode === "steps" && !stepM)
          throw new Error(
            "Primero calibra tu paso (pestaña 2, parte B) para contar la distancia con tus pasos.",
          );
        if (mode === "known" && !(Number(real) >= 0 && real.trim() !== ""))
          throw new Error("Escribe la distancia real.");
        const t: Trial = {
          start: [],
          track: [],
          startPt: null,
          steps: 0,
          cancelled: false,
          offs: [],
        };
        trial.current = t;
        if (needed != null && !(sensors.fix && sensors.fix.accuracy_m <= needed)) {
          setLive((l) => ({ ...l, acc: sensors.fix?.accuracy_m ?? 0 }));
          setStage("wait");
          await waitForAccuracy(t, needed);
          if (t.cancelled) return;
        }
        setStage("start");
        t.start = await still(t);
        if (t.cancelled) return;
        t.startPt = stillPoint(t.start);
        if (!t.startPt)
          throw new Error("Llegaron pocas lecturas del GPS. Sal al aire libre y repite.");
        const count = stepCounter(cal?.step_threshold_ms2 ?? undefined);
        t.offs.push(
          sensors.onMotion((tm, _gz, acc) => {
            const n = count(tm, acc);
            if (n !== t.steps) {
              t.steps = n;
              setLive((l) => ({ ...l, steps: n }));
            }
          }),
          sensors.onFix((f) => {
            if (!t.startPt) return;
            const p = toLocal(f, t.startPt);
            t.track.push(p);
            setLive((l) => ({ ...l, dist: Math.hypot(p.x, p.y), acc: f.accuracy_m }));
            draw();
          }),
        );
        setStage("walk");
        return;
      }
      if (stage === "walk") {
        const t = trial.current!;
        t.offs.forEach((off) => off());
        t.offs = [];
        setStage("end");
        const end = await still(t);
        if (t.cancelled) return;
        if (end.length < 3)
          throw new Error("Llegaron pocas lecturas del GPS al final. Repite la prueba.");
        if (mode === "steps" && t.steps < 20)
          throw new Error(
            `Contaste solo ${t.steps} pasos: camina un tramo más largo (20 a 50 m) y repite.`,
          );
        const r = Math.round(realDistance(mode, Number(real), t.steps, stepM) * 10) / 10;
        // la fuente de la distancia real queda en el nombre, como evidencia
        const name =
          (place.trim() || "Prueba GPS").slice(0, 60) +
          (mode === "steps"
            ? ` (real por ${t.steps} pasos)`
            : mode === "loop"
              ? " (ida y vuelta)"
              : "");
        const saved = await gpsApi.create({
          device_id: device,
          place_name: name,
          environment: env,
          real_distance_m: r,
          start_fixes: t.start.slice(0, 600),
          end_fixes: end.slice(0, 600),
        });
        setRes(saved);
        setStage("done");
        trial.current = null;
        void load();
      }
    } catch (e) {
      setMsg({ text: errorText(e), kind: "err" });
      reset();
    }
  }

  function cancel() {
    if (
      !trial.current ||
      !window.confirm("¿Cancelar esta prueba del GPS? No se guarda nada y vuelves al inicio.")
    )
      return;
    trial.current.cancelled = true;
    reset();
    notify("Prueba cancelada ✔ No se guardó nada");
  }

  async function rename(t: GpsTrialApi) {
    const name = window
      .prompt(
        "Escribe el nombre correcto del lugar. Las lecturas y el error no cambian.",
        t.place_name,
      )
      ?.trim();
    if (!name || name === t.place_name) return;
    try {
      await gpsApi.rename(t.id, name);
      notify("Nombre cambiado ✔");
      void load();
    } catch (e) {
      setMsg({ text: errorText(e), kind: "err" });
    }
  }

  async function remove(t: GpsTrialApi) {
    if (!window.confirm(`¿Borrar la prueba «${t.place_name} #${t.id}»? No se puede recuperar.`))
      return;
    try {
      await gpsApi.remove(t.id);
      notify("Prueba borrada ✔");
      void load();
    } catch (e) {
      setMsg({ text: errorText(e), kind: "err" });
    }
  }

  const guide = {
    idle: [
      "",
      "Párate en el punto de inicio",
      "Cuando estés ahí, toca el botón. Tendrás que quedarte quieta unos segundos.",
      "Paso 1 de 3",
    ],
    wait: [
      "warn",
      "Espera a que el GPS se afine",
      waitText(live.acc || null, needed ?? 0),
      "Paso 1 de 3",
    ],
    start: [
      "warn",
      "Quédate quieta en el inicio",
      "Estoy midiendo dónde estás. No te muevas.",
      "Paso 1 de 3",
    ],
    walk: [
      "good",
      mode === "loop" ? "Ahora recorre y vuelve al inicio" : "Ahora camina hasta el final",
      "Camina en línea recta y mira tu recorrido en el mapa.",
      "Paso 2 de 3",
    ],
    end: [
      "warn",
      "Quédate quieta en el final",
      "Estoy midiendo dónde terminaste. No te muevas.",
      "Paso 3 de 3",
    ],
    done: [
      "good",
      "¡Listo! Prueba guardada",
      "Haz al menos 3 pruebas en lugares distintos para el informe.",
      "Terminado",
    ],
  }[stage];
  const best = res?.result.methods.filtered;
  // avisos de pocas pruebas (el backend los manda ya en español)
  const globalWarning = summary?.warnings?.find((w) => w.environment == null);
  const envWarning = summary?.warnings?.find((w) => w.environment === env);
  const button =
    stage === "idle"
      ? "Estoy en el inicio"
      : stage === "wait"
        ? "Medir sin esperar"
        : stage === "start"
          ? `Midiendo el inicio · ${left} s`
          : stage === "walk"
            ? mode === "loop"
              ? "Volví al inicio"
              : "Llegué al final"
            : `Midiendo el final · ${left} s`;

  return (
    <>
      <section className="card">
        <div className="hd">
          <h2>¿Cuánto se equivoca el GPS?</h2>
          <span className="tag">{guide[3]}</span>
        </div>
        <p className="hint">
          Necesitas una distancia que ya conozcas <b>al aire libre</b>. El sistema compara lo que
          dice el GPS con la distancia real.
        </p>
        {stage === "idle" && (
          <div>
            <label className="lbl" htmlFor="gPlace">
              Lugar
            </label>
            <input
              id="gPlace"
              className="inp"
              placeholder="Ej. Cancha de fútbol"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
            <label className="lbl" htmlFor="gEnv">
              ¿Cómo es el lugar?
            </label>
            <select
              id="gEnv"
              className="inp"
              value={env}
              onChange={(e) => setEnv(e.target.value as EnvironmentApi)}
            >
              <option value="open">Al aire libre, sin edificios cerca</option>
              <option value="buildings">Cerca de edificios</option>
              <option value="trees">Bajo árboles</option>
              <option value="indoor">Bajo techo</option>
            </select>
            {globalWarning && <p className="hint">{globalWarning.message}</p>}
            {envWarning && <p className="hint">{envWarning.message}</p>}
            <label className="lbl" htmlFor="gWait">
              Esperar precisión de (m)
            </label>
            <input
              id="gWait"
              className="inp"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder={needed != null ? String(needed) : "sin recomendación aún"}
              value={waitAcc}
              onChange={(e) => setWaitAcc(e.target.value)}
            />
            <p className="hint">
              Antes de medir espero a que el GPS informe esa precisión o mejor. Con 0 no espero.
            </p>
            <label className="lbl" htmlFor="gRef">
              ¿Cómo sabes la distancia real?
            </label>
            <select
              id="gRef"
              className="inp"
              value={mode}
              onChange={(e) => setMode(e.target.value as RefMode)}
            >
              <option value="known">La sé: cinta, líneas de cancha o Google Maps</option>
              <option value="steps">Caminando: contar mis pasos</option>
              <option value="loop">Ida y vuelta: termino donde empecé (sirve en carro)</option>
            </select>
            {mode === "known" && (
              <>
                <label className="lbl" htmlFor="gReal">
                  Distancia real entre el inicio y el final (m)
                </label>
                <input
                  id="gReal"
                  className="inp"
                  type="number"
                  inputMode="decimal"
                  value={real}
                  onChange={(e) => setReal(e.target.value)}
                />
                <p className="hint">
                  Usa más de 15 m (30 o 50 m es mejor): el GPS suele equivocarse varios metros.
                </p>
              </>
            )}
          </div>
        )}
        <div className={`semaforo ${guide[0]}`.trim()} style={{ marginTop: 12 }}>
          <span className="dotl" />
          <div>
            <b>{guide[1]}</b>
            <small>{guide[2]}</small>
          </div>
        </div>
        {(stage === "walk" || stage === "end") && (
          <>
            <canvas ref={cv} aria-label="Recorrido del GPS" />
            <div className="kv">
              <span>Pasos caminados</span>
              <b>{live.steps}</b>
              <span>Distancia según el GPS</span>
              <b>{fmtEs(live.dist, 1)} m</b>
              <span>Precisión del GPS ahora</span>
              <b>± {fmtEs(live.acc, 0)} m</b>
            </div>
          </>
        )}
        {stage !== "done" && (
          <div className="row">
            <button
              type="button"
              className="go"
              disabled={stage === "start" || stage === "end"}
              onClick={() => void onButton()}
            >
              {button}
            </button>
          </div>
        )}
        {stage !== "idle" && stage !== "done" && (
          <div className="row">
            <button type="button" className="sb wide" onClick={cancel}>
              Cancelar prueba (me equivoqué)
            </button>
          </div>
        )}
        <Msg {...msg} />
        {stage === "done" && res && best && (
          <div aria-label="Resultado de la prueba">
            <div className={`semaforo ${gpsTone(best.error_m, best.error_pct)}`}>
              <span className="dotl" />
              <div>
                <b>
                  Real: {fmtEs(res.real_distance_m, 1)} m · GPS: {fmtEs(best.gps_distance_m, 1)} m ·
                  Error: {fmtEs(best.error_m, 1)} m
                </b>
                <small>
                  Una sola lectura se equivocó {fmtEs(res.result.methods.single.error_m, 1)} m;
                  promediando se equivocó {fmtEs(best.error_m, 1)} m.
                </small>
              </div>
            </div>
            <div className="tw">
              <table className="t compact">
                <thead>
                  <tr>
                    <th>Cómo se calculó</th>
                    <th>GPS dijo</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(METHOD_NAMES) as (keyof typeof METHOD_NAMES)[]).map((k) => {
                    const v = res.result.methods[k];
                    return (
                      <tr key={k}>
                        <td>{METHOD_NAMES[k]}</td>
                        <td>{fmtEs(v.gps_distance_m, 1)} m</td>
                        <td>
                          {fmtEs(v.error_m, 1)} m
                          {v.error_pct == null ? "" : ` (${fmtEs(v.error_pct, 0)} %)`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button type="button" className="sb wide" onClick={() => setStage("idle")}>
                Hacer otra prueba
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="card">
        <div className="hd">
          <h2>Resumen de mis pruebas</h2>
        </div>
        <div className="kv" aria-label="Resumen de mis pruebas">
          <span>Pruebas hechas</span>
          <b>{summary?.trials ?? 0}</b>
          {summary?.trials ? (
            <>
              <span>Error con una sola lectura</span>
              <b>{fmtEs(summary.methods.single?.mean_error_m, 1)} m</b>
              <span>Error promediando</span>
              <b>
                {fmtEs(
                  summary.best_method ? summary.methods[summary.best_method]?.mean_error_m : null,
                  1,
                )}{" "}
                m
              </b>
              <span>El GPS sirve en lugares de lado mayor a</span>
              <b>{fmtEs(summary.min_side_m, 0)} m</b>
            </>
          ) : null}
        </div>
        <GpsConclusion summary={summary} noteClass="hint" />
        {summary?.trials ? (
          <>
            <p className="lbl">Lado mínimo por entorno</p>
            <EnvironmentTable summary={summary} noteClass="hint" />
            <p className="lbl">Error según la distancia</p>
            <DistanceTable summary={summary} noteClass="hint" />
            <p className="lbl">Esperar a la precisión antes de medir</p>
            <WaitTables summary={summary} noteClass="hint" />
            <p className="lbl">Precisión informada frente a la real</p>
            <ReportedVsReal summary={summary} noteClass="hint" />
          </>
        ) : null}
        <div className="tw" style={{ marginTop: 10 }}>
          <table className="t compact">
            <thead>
              <tr>
                <th>Prueba</th>
                <th>Real</th>
                <th>GPS</th>
                <th>Error</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!list.length && (
                <tr>
                  <td colSpan={5}>Aún no hay pruebas.</td>
                </tr>
              )}
              {list.map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: "normal" }}>
                    {t.place_name} #{t.id}
                  </td>
                  <td>{fmtEs(t.real_distance_m, 1)} m</td>
                  <td>{fmtEs(t.result.methods.filtered.gps_distance_m, 1)} m</td>
                  <td>{fmtEs(t.result.methods.filtered.error_m, 1)} m</td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="sb ico"
                      aria-label={`Cambiar nombre de ${t.place_name} #${t.id}`}
                      onClick={() => void rename(t)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="sb ico"
                      aria-label={`Borrar ${t.place_name} #${t.id}`}
                      onClick={() => void remove(t)}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button type="button" className="sb" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
      </section>
    </>
  );
}
