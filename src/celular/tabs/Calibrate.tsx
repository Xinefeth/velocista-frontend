// 2. Calibrar (EN-35): sesgo del giroscopio (celular quieto 5 s) y largo del paso (3 caminatas de
// distancia conocida o medida con GPS). El backend cuenta los pasos con el mismo detector que usa
// al medir; aquí solo se muestra una cuenta en vivo para guiar.
import { useEffect, useRef, useState } from "react";
import { Msg, NO_MSG, usePhone, type MsgState } from "@/celular/context";
import { sensors, vibrate } from "@/celular/sensors";
import { errorText, fmtEs } from "@/domain/measurement/labels";
import {
  DEFAULT_STEP_M,
  integrateTurn,
  metersBetween,
  stepCounter,
  stillPoint,
  type Fix,
} from "@/domain/measurement/phone";
import { calibrationsApi } from "@/infrastructure/http/measurements";
import type { ReadingApi, StepTrialApi } from "@/infrastructure/contracts/measurements";

export const WALKS = 3;
const GYRO_MS = 5500;
const STILL_S = 5;

interface Walk {
  gps: boolean;
  dist: number;
  goal: number;
  readings: ReadingApi[];
  start: { lat: number; lon: number } | null;
  warned: boolean;
  offMotion?: () => void;
  offFix?: () => void;
}

export function Calibrate({ active }: { active: boolean }) {
  const { device, cal, refreshCal } = usePhone();
  const [gyroMsg, setGyroMsg] = useState<MsgState>(NO_MSG);
  const [gyroBusy, setGyroBusy] = useState(false);
  const [mode, setMode] = useState<"known" | "gps">("known");
  const [dist, setDist] = useState("15");
  const [goal, setGoal] = useState("40");
  const [trials, setTrials] = useState<StepTrialApi[]>([]);
  const [walking, setWalking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState({ steps: 0, meters: 0, turn: 0, gps: 0 });
  const [stepMsg, setStepMsg] = useState<MsgState>(NO_MSG);
  const walk = useRef<Walk | null>(null);

  useEffect(() => {
    if (active) void refreshCal();
  }, [active, refreshCal]);
  useEffect(() => () => stopWalk(), []);

  function stopWalk() {
    walk.current?.offMotion?.();
    walk.current?.offFix?.();
    walk.current = null;
    setWalking(false);
  }

  async function calibrateGyro() {
    try {
      sensors.needMotion();
      setGyroBusy(true);
      const s = await sensors.collectMotion(GYRO_MS, (left) =>
        setGyroMsg({ text: `No muevas el celular… ${left} s`, kind: "" }),
      );
      const samples = s
        .filter((x) => x.gz != null)
        .map((x) => ({ t_ms: x.t, gyro_z_dps: x.gz as number }))
        .slice(0, 5000);
      const r = await calibrationsApi.gyro(device, samples);
      setGyroMsg({
        text: `Listo ✔ sesgo del giroscopio: ${fmtEs(r.params.bias_dps as number, 3)} °/s`,
        kind: "good",
      });
      await refreshCal();
    } catch (e) {
      setGyroMsg({ text: errorText(e), kind: "err" });
    } finally {
      setGyroBusy(false);
    }
  }

  async function startWalk() {
    sensors.needMotion();
    const gps = mode === "gps";
    const d = Number(dist.replace(",", "."));
    const g = Number(goal);
    if (!gps && !(d > 0)) throw new Error("Escribe la distancia de la recta.");
    if (gps && !(g >= 20)) throw new Error("La meta debe ser de al menos 20 m.");
    if (gps && !sensors.fix)
      throw new Error("No hay señal GPS. Activa los sensores y sal al aire libre.");
    const w: Walk = { gps, dist: d, goal: g, readings: [], start: null, warned: false };
    walk.current = w;
    setLive({ steps: 0, meters: 0, turn: 0, gps: 0 });
    if (gps) {
      setBusy(true);
      const fixes = await sensors.collectFixes(STILL_S, (left) =>
        setStepMsg({ text: `Quédate quieta: marcando el inicio… ${left} s`, kind: "" }),
      );
      setBusy(false);
      const start = stillPoint(fixes);
      if (!start) throw new Error("Llegaron pocas lecturas GPS. Sal al aire libre y repite.");
      if (start.accuracy_m > 15)
        throw new Error(
          `El GPS está impreciso (± ${fmtEs(start.accuracy_m, 0)} m). Aléjate de edificios y repite.`,
        );
      w.start = start;
      const recent: Fix[] = [];
      w.offFix = sensors.onFix((f) => {
        recent.push(f);
        if (recent.length > 3) recent.shift();
        const here = stillPoint(recent.length >= 3 ? recent : [f, f, f]);
        if (!here || !w.start) return;
        const m = metersBetween(w.start, here);
        setLive((l) => ({ ...l, gps: m }));
        if (m >= w.goal && !w.warned) {
          w.warned = true;
          vibrate([200, 100, 200]);
          setStepMsg({
            text: `¡Para! Llegaste a ${fmtEs(w.goal, 0)} m. Toca «Terminar caminata» y quédate quieta.`,
            kind: "good",
          });
        }
      });
    }
    const count = stepCounter(cal?.step_threshold_ms2 ?? undefined);
    const stepM = cal?.step_length_m ?? DEFAULT_STEP_M;
    const bias = cal?.gyro_calibrated ? cal.gyro_bias_dps : 0;
    let heading = 0;
    let lastT: number | null = null;
    w.offMotion = sensors.onMotion((t, gz, acc) => {
      if (!acc) return;
      w.readings.push({
        seq: w.readings.length,
        t_ms: t,
        kind: "motion",
        gyro_z_dps: gz,
        accel: acc,
      });
      const steps = count(t, acc);
      if (gz != null && lastT != null) heading = integrateTurn(heading, gz, bias, t - lastT);
      if (gz != null) lastT = t;
      setLive((l) => ({ ...l, steps, meters: steps * stepM, turn: heading }));
    });
    setWalking(true);
    setStepMsg({
      text: gps
        ? "Camina en línea recta. Te aviso cuando llegues."
        : "Camina normal hasta el final de la recta…",
      kind: "",
    });
  }

  async function endWalk() {
    const w = walk.current;
    if (!w) return;
    w.offMotion?.();
    w.offFix?.();
    let distance = w.dist;
    if (w.gps && w.start) {
      setBusy(true);
      const fixes = await sensors.collectFixes(STILL_S, (left) =>
        setStepMsg({ text: `Quédate quieta: marcando el final… ${left} s`, kind: "" }),
      );
      setBusy(false);
      const end = stillPoint(fixes);
      if (!end) throw new Error("Llegaron pocas lecturas GPS al final.");
      distance = Math.round(metersBetween(w.start, end) * 10) / 10;
      if (distance < 15)
        throw new Error(`Según el GPS caminaste solo ${fmtEs(distance, 1)} m: camina más (40 m).`);
    }
    const done = [...trials, { distance_m: distance, readings: w.readings.slice(0, 20000) }];
    stopWalk();
    if (done.length < WALKS) {
      setTrials(done);
      setStepMsg({
        text: `Caminata ${done.length} guardada (${fmtEs(distance, 1)} m). Ponte en el inicio de la siguiente.`,
        kind: "good",
      });
      return;
    }
    setTrials([]);
    setStepMsg({ text: "Calculando…", kind: "" });
    const r = await calibrationsApi.step(device, done);
    const p = r.params as {
      step_length_m: number;
      steps: number[];
      step_threshold_ms2?: number;
      warnings?: string[];
    };
    const uneven = (p.warnings ?? []).includes("uneven_pace");
    setStepMsg({
      text:
        `Listo ✔ tu paso mide ${fmtEs(p.step_length_m, 3)} m (pasos: ${p.steps.join(", ")})` +
        (p.step_threshold_ms2 ? " · contador ajustado a tu forma de pisar" : "") +
        (uneven ? ". Ojo: caminaste a ritmos distintos, puedes repetir." : ""),
      kind: uneven ? "" : "good",
    });
    await refreshCal();
  }

  async function onStepButton() {
    if (busy) return;
    try {
      if (!walk.current) await startWalk();
      else await endWalk();
    } catch (e) {
      stopWalk();
      setTrials([]);
      setBusy(false);
      setStepMsg({ text: `${errorText(e)} Vuelve a empezar las 3 caminatas.`, kind: "err" });
    }
  }

  const n = trials.length + 1;
  const straight = Math.abs(live.turn) < 15;
  return (
    <>
      <section className="card">
        <div className="hd">
          <h2>Estado de la calibración</h2>
        </div>
        <div className="kv" aria-label="Estado de la calibración">
          <span>Giroscopio</span>
          <b>{cal?.gyro_calibrated ? `✔ sesgo ${fmtEs(cal.gyro_bias_dps, 2)} °/s` : "Falta"}</b>
          <span>Largo del paso</span>
          <b>
            {cal?.step_length_m
              ? `✔ ${fmtEs(cal.step_length_m, 3)} m`
              : "Opcional (se usa 0,70 m)"}
          </b>
          <span>Velocidad del carro</span>
          <b>
            {cal?.speed_k != null
              ? `✔ v = ${fmtEs(cal.speed_k, 4)}·PWM + ${fmtEs(cal.speed_c, 3)}`
              : "Falta (solo carro)"}
          </b>
        </div>
        <div className="row">
          <button type="button" className="sb" onClick={() => void refreshCal()}>
            Actualizar
          </button>
        </div>
      </section>
      <section className="card">
        <div className="hd">
          <h2>A. Giroscopio (5 segundos)</h2>
        </div>
        <ol>
          <li>
            Pon el celular <b>quieto sobre una mesa</b>.
          </li>
          <li>Toca el botón y no lo toques hasta que termine.</li>
        </ol>
        <div className="row">
          <button
            type="button"
            className="sb red wide"
            disabled={gyroBusy}
            onClick={() => void calibrateGyro()}
          >
            Calibrar giroscopio
          </button>
        </div>
        <Msg {...gyroMsg} />
      </section>
      <section className="card">
        <div className="hd">
          <h2>B. Largo del paso (caminar 3 veces)</h2>
        </div>
        <label className="lbl" htmlFor="stepMode">
          ¿Cómo sabes cuánto caminaste?
        </label>
        <select
          id="stepMode"
          className="inp"
          value={mode}
          disabled={walking}
          onChange={(e) => setMode(e.target.value as "known" | "gps")}
        >
          <option value="known">Distancia conocida (baldosas, cancha o cinta)</option>
          <option value="gps">Con GPS (solo al aire libre: calle o parque)</option>
        </select>
        {mode === "known" ? (
          <>
            <ol>
              <li>
                Busca una recta de distancia conocida: <b>baldosas</b> (25 × 0,60 m = 15 m), líneas
                de una cancha (vóley 18 m) o cinta.
              </li>
              <li>
                Lleva el celular <b>plano frente al pecho</b>, como al medir.
              </li>
              <li>
                Toca «Empezar», camina normal hasta el final y toca «Terminar». Repite 3 veces.
              </li>
            </ol>
            <label className="lbl" htmlFor="stepDist">
              Distancia de la recta (m)
            </label>
            <input
              id="stepDist"
              className="inp"
              type="number"
              inputMode="decimal"
              min={1}
              step={0.1}
              value={dist}
              onChange={(e) => setDist(e.target.value)}
            />
          </>
        ) : (
          <>
            <ol>
              <li>
                Sal a la <b>calle o a un parque</b>, lejos de edificios altos.
              </li>
              <li>
                Toca «Empezar» y quédate <b>quieta 5 s</b>; camina <b>en línea recta</b> hasta que
                diga <b>«¡Para!»</b>, toca «Terminar» y quédate quieta 5 s.
              </li>
            </ol>
            <label className="lbl" htmlFor="stepGoal">
              Meta en metros (40 recomendado)
            </label>
            <input
              id="stepGoal"
              className="inp"
              type="number"
              inputMode="decimal"
              min={20}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </>
        )}
        <div className="kv" style={{ marginTop: 12 }}>
          <span>Pasos contados</span>
          <b>{walking ? live.steps : "—"}</b>
          <span>Distancia aprox.</span>
          <b>{walking ? `≈ ${fmtEs(live.meters, 2)} m` : "—"}</b>
          <span>Dirección</span>
          <b style={{ color: walking ? (straight ? "var(--green)" : "var(--yellow)") : undefined }}>
            {!walking
              ? "—"
              : straight
                ? "recto ✔"
                : `giraste ${fmtEs(Math.abs(live.turn), 0)}° a la ${live.turn > 0 ? "izquierda" : "derecha"}: corrige`}
          </b>
          {mode === "gps" && (
            <>
              <span>Distancia GPS</span>
              <b>{walking ? `${fmtEs(live.gps, 1)} m de ${goal} m` : "—"}</b>
            </>
          )}
        </div>
        <div className="row">
          <button
            type="button"
            className={walking ? "sb wide stop" : "sb red wide"}
            disabled={busy}
            onClick={() => void onStepButton()}
          >
            {walking ? `Terminar caminata ${n}` : `Empezar caminata ${n} de ${WALKS}`}
          </button>
        </div>
        <Msg {...stepMsg} />
      </section>
      <section className="card">
        <div className="hd">
          <h2>C. Velocidad del carro (carro + celular)</h2>
          <span className="tag">Próximamente</span>
        </div>
        <p className="hint">
          Disponible cuando el carro esté listo. El carro no tiene encoders: la distancia se
          estimará con la potencia del motor (v = k·PWM + c).
        </p>
      </section>
    </>
  );
}
