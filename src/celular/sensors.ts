// Sensores del celular en el navegador: orientación y movimiento (giroscopio y acelerómetro), GPS y
// pantalla encendida. Un único concentrador reparte cada lectura a quien la escuche (calibración,
// medición, prueba del GPS). Necesita HTTPS; en iPhone hay que pedir permiso de movimiento.
import { unwrap, type Fix } from "@/domain/measurement/phone";

export type MotionListener = (tMs: number, gyroZ: number | null, accel: number[] | null) => void;
export type FixListener = (fix: Fix) => void;
export type MotionSample = { t: number; gz: number | null; acc: number[] | null };

interface PermissionEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

class Sensors {
  gyro: number | null = null;
  accel: number[] | null = null;
  gyroAt = 0;
  accelAt = 0;
  fix: Fix | null = null;
  wake = "—";
  gpsError = "";
  private motion = new Set<MotionListener>();
  private fixes = new Set<FixListener>();
  private changes = new Set<() => void>();
  private wakeLock: { release: () => Promise<void> } | null = null;
  private started = false;
  // Giro alrededor de la vertical a partir de la orientación que ya calcula el celular
  // (deviceorientation une giroscopio y acelerómetro, así no importa cómo se sostiene).
  private yaw = { value: null as number | null, raw: null as number | null, at: 0 };
  private yawPrev = { value: null as number | null, t: 0 };
  private gravity = { x: 0, y: 0, z: 9.8 };

  onMotion(fn: MotionListener) {
    this.motion.add(fn);
    return () => void this.motion.delete(fn);
  }
  onFix(fn: FixListener) {
    this.fixes.add(fn);
    return () => void this.fixes.delete(fn);
  }
  /** Avisa de cambios para refrescar lo que se muestra (precisión del GPS, pantalla encendida). */
  subscribe(fn: () => void) {
    this.changes.add(fn);
    return () => void this.changes.delete(fn);
  }
  private changed() {
    for (const fn of this.changes) fn();
  }

  private orientation = (e: DeviceOrientationEvent) => {
    if (e.alpha == null) return;
    this.yaw.value = unwrap(this.yaw.raw, this.yaw.value, e.alpha);
    this.yaw.raw = e.alpha;
    this.yaw.at = Date.now();
  };

  /** Respaldo sin orientación: proyecta el vector de giro sobre la vertical (gravedad suavizada). */
  private verticalRate(e: DeviceMotionEvent, acc: number[] | null): number | null {
    const r = e.rotationRate;
    if (!r || r.alpha == null || !acc) return null;
    const g = this.gravity;
    g.x += 0.1 * (acc[0] - g.x);
    g.y += 0.1 * (acc[1] - g.y);
    g.z += 0.1 * (acc[2] - g.z);
    const n = Math.hypot(g.x, g.y, g.z) || 1;
    return ((r.beta || 0) * g.x + (r.gamma || 0) * g.y + r.alpha * g.z) / n;
  }

  private turnRate(t: number, e: DeviceMotionEvent, acc: number[] | null): number | null {
    if (this.yaw.value != null && t - this.yaw.at < 500) {
      let rate = 0;
      if (this.yawPrev.value != null && t > this.yawPrev.t)
        rate = (this.yaw.value - this.yawPrev.value) / ((t - this.yawPrev.t) / 1000);
      this.yawPrev = { value: this.yaw.value, t };
      return rate;
    }
    return this.verticalRate(e, acc);
  }

  private motionEvent = (e: DeviceMotionEvent) => {
    const t = Date.now();
    const g = e.accelerationIncludingGravity;
    const acc = g && g.x != null ? [g.x, g.y ?? 0, g.z ?? 0] : null;
    const gz = this.turnRate(t, e, acc);
    if (gz == null && acc == null) return; // algunos navegadores mandan eventos vacíos
    if (gz != null) {
      this.gyro = gz;
      this.gyroAt = t;
    }
    if (acc != null) {
      this.accel = acc;
      this.accelAt = t;
    }
    for (const fn of this.motion) fn(t, gz, acc);
  };

  private fixEvent = (p: GeolocationPosition) => {
    const f: Fix = {
      t_ms: Date.now(),
      lat: p.coords.latitude,
      lon: p.coords.longitude,
      accuracy_m: p.coords.accuracy,
    };
    this.fix = f;
    for (const fn of this.fixes) fn(f);
    this.changed();
  };

  private async keepAwake() {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock) {
        this.wakeLock = await nav.wakeLock.request("screen");
        this.wake = "Sí";
      } else this.wake = "No disponible (no bloquees el celular)";
    } catch {
      this.wake = "No (no bloquees el celular)";
    }
    this.changed();
  }

  /** Pide permisos y empieza a escuchar. Lanza un error con el motivo si no se puede. */
  async start() {
    if (!window.isSecureContext)
      throw new Error("Esta página debe abrirse con https:// para usar los sensores.");
    const w = window as unknown as {
      DeviceMotionEvent?: PermissionEvent;
      DeviceOrientationEvent?: PermissionEvent;
    };
    if (w.DeviceMotionEvent?.requestPermission) {
      if ((await w.DeviceMotionEvent.requestPermission()) !== "granted")
        throw new Error("No diste permiso de movimiento.");
    }
    if (w.DeviceOrientationEvent?.requestPermission)
      await w.DeviceOrientationEvent.requestPermission().catch(() => "denied");
    if (!this.started) {
      if (!navigator.geolocation) throw new Error("Este navegador no tiene GPS.");
      window.addEventListener("deviceorientation", this.orientation);
      window.addEventListener("devicemotion", this.motionEvent);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.wakeLock) void this.keepAwake();
      });
      navigator.geolocation.watchPosition(
        this.fixEvent,
        (err) => {
          this.gpsError = `GPS: ${err.message}`;
          this.changed();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
      );
      this.started = true;
    }
    await this.keepAwake();
  }

  /** Para medir por pasos hacen falta movimiento y giroscopio recientes. */
  needMotion(now = Date.now()) {
    if (now - this.accelAt > 2000) throw new Error("Activa los sensores en la pestaña Conexión.");
    if (now - this.gyroAt > 2000)
      throw new Error(
        "No llegan datos del giroscopio: este celular no sirve para medir por pasos.",
      );
  }

  /** Junta lecturas de movimiento durante `ms` (cuenta atrás en segundos con `onTick`). */
  collectMotion(ms: number, onTick?: (left: number) => void) {
    return new Promise<MotionSample[]>((resolve) => {
      const out: MotionSample[] = [];
      const off = this.onMotion((t, gz, acc) => out.push({ t, gz, acc }));
      const t0 = Date.now();
      const iv = window.setInterval(
        () => onTick?.(Math.max(0, Math.ceil((ms - (Date.now() - t0)) / 1000))),
        250,
      );
      window.setTimeout(() => {
        off();
        window.clearInterval(iv);
        resolve(out);
      }, ms);
    });
  }

  /** Junta lecturas GPS durante `secs` segundos; `stop()` corta antes (cancelar). */
  collectFixes(secs: number, onTick?: (left: number) => void, stop?: () => boolean) {
    return new Promise<Fix[]>((resolve) => {
      const out: Fix[] = [];
      const off = this.onFix((f) => out.push(f));
      const t0 = Date.now();
      const iv = window.setInterval(() => {
        const left = Math.max(0, Math.ceil(secs - (Date.now() - t0) / 1000));
        onTick?.(left);
        if (left <= 0 || stop?.()) {
          off();
          window.clearInterval(iv);
          resolve(out);
        }
      }, 250);
    });
  }
}

export const sensors = new Sensors();

export function vibrate(pattern: number | number[]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
