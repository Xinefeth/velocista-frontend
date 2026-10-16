// Ingeniero de pista: Twiddle (HU-27) y optimización bayesiana (HU-28).
// Portado del prototipo (Protoripo.html). Opera sobre las corridas del robot actual.
import type { Corrida } from "@/domain/models/runs";
import { CTRL, PDEF, psum } from "@/shared/data/controllers";
import { clamp, fmt } from "@/domain/format";

const sameP = (a: Record<string, number>, b: Record<string, number>, c: string): boolean =>
  CTRL[c].keys.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-6);

export type EngineerMethod = "twiddle" | "bayes";

/** Datos que la vista de corridas necesita del ingeniero. */
export interface EngineerView {
  ctrlNm: string;
  ctrl: string;
  msg: string;
  best: number | null;
  hasProp: boolean;
  nx: { label: string; val: string; dir: "up" | "down" | ""; delta: string }[];
  mini: string;
}

export class Engineer {
  method: EngineerMethod = "twiddle";
  ctrl: string | null = null;
  dp: Record<string, number> = {};
  i = 0;
  phase = 0;
  best: number | null = null;
  base: Record<string, number> | null = null;
  prop: Record<string, number> | null = null;
  msg = "";

  reset(ctrl: string): void {
    this.ctrl = ctrl;
    this.dp = { kp: 0.1, kd: 0.5, kv: 0.1, g: 0.1, d: 0.5 };
    this.i = 0;
    this.phase = 0;
    this.best = null;
    this.base = null;
    this.prop = null;
    this.msg = "";
  }

  /** Procesa una corrida recién registrada del robot actual. */
  feed(r: Corrida, runs: Corrida[]): void {
    if (this.ctrl !== r.ctrl) this.reset(r.ctrl);
    if (this.method === "bayes") return this.bayes(runs);
    const keys = CTRL[this.ctrl!].tw,
      k = keys[this.i];
    if (this.best === null) {
      this.best = r.J;
      this.base = { ...r.p };
      return this.propose(k, 1);
    }
    if (!this.prop || !sameP(r.p, this.prop, this.ctrl!)) {
      if (r.J < this.best && sameP(r.p, this.base!, this.ctrl!)) this.best = r.J;
      this.msg =
        "Esta corrida no usó la sugerencia. Cárgala en el setup para que el ingeniero la evalúe.";
      return;
    }
    if (this.phase === 1) {
      if (r.J < this.best) {
        this.best = r.J;
        this.base = { ...r.p };
        this.dp[k] *= 1.1;
        this.next();
      } else this.propose(k, -1);
    } else {
      if (r.J < this.best) {
        this.best = r.J;
        this.base = { ...r.p };
        this.dp[k] *= 1.1;
      } else this.dp[k] *= 0.9;
      this.next();
    }
  }

  private next(): void {
    const keys = CTRL[this.ctrl!].tw;
    this.i = (this.i + 1) % keys.length;
    this.propose(keys[this.i], 1);
  }

  private propose(k: string, dir: number): void {
    const d = PDEF[k],
      p = { ...this.base! };
    p[k] = clamp(+(p[k] + dir * this.dp[k]).toFixed(d.dec), d.min, d.max);
    this.prop = p;
    this.phase = dir > 0 ? 1 : 2;
    this.msg = `Siguiente prueba: <b>${d.name} ${dir > 0 ? "hacia arriba" : "hacia abajo"}</b>, paso ${fmt(this.dp[k], d.dec + 1)}.`;
  }

  /** Optimización bayesiana sobre las corridas del controlador activo. */
  bayes(runs: Corrida[], appliedCtrl?: string): void {
    const ctrl = this.ctrl || appliedCtrl!;
    const keys = CTRL[ctrl].tw,
      Rs = runs.filter((r) => r.ctrl === ctrl);
    this.ctrl = ctrl;
    if (!Rs.length) {
      this.prop = null;
      this.best = null;
      this.msg = "Registra una primera corrida para empezar el estudio.";
      return;
    }
    const best = Rs.reduce((a, b) => (a.J < b.J ? a : b));
    this.best = best.J;
    this.base = { ...best.p };
    if (Rs.length < 3) {
      this.prop = null;
      this.msg = `La bayesiana necesita al menos 3 corridas con ${CTRL[ctrl].name} (hay ${Rs.length}). Mientras tanto usa Twiddle.`;
      return;
    }
    const nz = (p: Record<string, number>) =>
      keys.map((k) => (p[k] - PDEF[k].min) / (PDEF[k].max - PDEF[k].min));
    const X = Rs.map((r) => nz(r.p)),
      Y = Rs.map((r) => r.J);
    const mean = Y.reduce((a, b) => a + b, 0) / Y.length,
      sd = Math.sqrt(Y.reduce((a, b) => a + (b - mean) ** 2, 0) / Y.length) || 1,
      l = 0.12,
      b0 = nz(best.p);
    let bx: number[] | null = null,
      bs = Infinity,
      bmu = 0,
      bsig = 0;
    for (let i = 0; i < 600; i++) {
      const loc = i < 420;
      const x = keys.map((_, j) =>
        clamp(loc ? b0[j] + (Math.random() - 0.5) * 0.3 : Math.random(), 0, 1),
      );
      let ws = 0,
        wy = 0,
        wm = 0;
      X.forEach((xi, n) => {
        const d2 = xi.reduce((a, v, j) => a + (v - x[j]) ** 2, 0),
          w = Math.exp(-d2 / (2 * l * l));
        ws += w;
        wy += w * Y[n];
        wm = Math.max(wm, w);
      });
      const mu = (wy + 0.3 * mean) / (ws + 0.3),
        sig = sd * (1 - wm),
        sc = mu - 1.2 * sig;
      if (sc < bs) {
        bs = sc;
        bx = x;
        bmu = mu;
        bsig = sig;
      }
    }
    const p = { ...best.p };
    keys.forEach((k, j) => {
      const d = PDEF[k];
      p[k] = clamp(+(d.min + bx![j] * (d.max - d.min)).toFixed(d.dec), d.min, d.max);
    });
    this.prop = p;
    this.msg = `Propuesta del modelo con ${Rs.length} corridas: J esperado <b>${fmt(bmu, 2)} ± ${fmt(bsig, 2)}</b>. ${bsig > sd * 0.5 ? "Explora una zona nueva." : "Afina cerca del mejor."}`;
  }

  /** Reinicia el estudio para el controlador activo tras cambiar de método. */
  restart(runs: Corrida[], appliedCtrl: string): void {
    const c = this.ctrl || appliedCtrl;
    this.reset(c);
    if (this.method === "bayes") return this.bayes(runs, appliedCtrl);
    const Rs = runs.filter((r) => r.ctrl === c);
    if (!Rs.length) return;
    const b = Rs.reduce((a, z) => (a.J < z.J ? a : z));
    this.best = b.J;
    this.base = { ...b.p };
    this.propose(CTRL[c].tw[0], 1);
  }

  /** Datos para la vista de corridas (HU-27/HU-28). */
  vista(appliedCtrl: string): EngineerView {
    const c = this.ctrl || appliedCtrl,
      keys = CTRL[c].tw;
    const nx = keys.map((k) => {
      const d = PDEF[k],
        v = this.prop ? this.prop[k] : null,
        dv = this.prop && this.base ? v! - this.base[k] : 0;
      return {
        label: `${d.name} siguiente`,
        val: v != null ? fmt(v, d.dec) : "—",
        dir: (dv > 0 ? "up" : dv < 0 ? "down" : "") as "up" | "down" | "",
        delta: this.prop
          ? Math.abs(dv) > 1e-9
            ? `${dv > 0 ? "+" : ""}${fmt(dv, d.dec)} vs. mejor`
            : "sin cambio"
          : "",
      };
    });
    let mini: string;
    if (this.prop) {
      const k =
          keys.find((kk) => Math.abs(this.prop![kk] - (this.base ? this.base[kk] : 0)) > 1e-9) ||
          keys[0],
        d = PDEF[k];
      mini =
        this.method === "bayes"
          ? `Ingeniero (bayesiana): <b>${psum(c, this.prop)}</b>`
          : `Ingeniero: <b>${d.name} ${fmt(this.base![k], d.dec)} → ${fmt(this.prop[k], d.dec)}</b>`;
    } else mini = "Ingeniero: registra una corrida para recibir una sugerencia.";
    return {
      ctrlNm: CTRL[c].name,
      ctrl: c,
      msg: this.msg || "Registra una primera corrida con tu setup actual para fijar la referencia.",
      best: this.best,
      hasProp: !!this.prop,
      nx,
      mini,
    };
  }
}
