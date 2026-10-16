// Lógica de dominio pura: hechos de un robot, compatibilidad (HU-08), cumplimiento del
// reglamento (HU-10) y manifiesto (EN-02). Portada del prototipo (Protoripo.html).
// Las funciones reciben el catálogo/robots para no depender de estado global (testeable).
import type {
  Check,
  Component,
  Facts,
  Profile,
  Parts,
  RobotDef,
  Severity,
  Version,
} from "@/domain/models/domain";
import type { RobotApi } from "@/infrastructure/contracts/api";
import { CTRL, PDEF } from "@/shared/data/controllers";
import { clone, fmt, num } from "@/domain/format";

export const byId = (cat: Component[], id: string): Component | undefined =>
  cat.find((c) => c.id === id);

export const robotById = (robots: RobotDef[], id: string): RobotDef | undefined =>
  robots.find((r) => r.id === id);

/**
 * Fusiona el resumen de robots de la API (HU-13) sobre los robots locales: por id, toma del
 * backend el tipo y el firmware (los campos que la API expone), y conserva las versiones y
 * piezas locales, que la API no entrega. Los robots sin coincidencia local se omiten (sin
 * piezas no se pueden armar sus paneles); si la API no respondió, se usa la lista local tal cual.
 */
export const mergeApiRobots = (locales: RobotDef[], resumen: RobotApi[]): RobotDef[] => {
  const porId = new Map(resumen.map((r) => [r.id, r]));
  return locales.map((r) => {
    const s = porId.get(r.id);
    return s ? { ...r, type: s.type, fw: s.firmware } : r;
  });
};

/** Versión actual de un robot (la última). */
export const currentVersion = (r: RobotDef): Version => r.versions[r.versions.length - 1];

export const profileById = (perfiles: Profile[], id: string): Profile | undefined =>
  perfiles.find((p) => p.id === id);

/** Robots que usan un componente en su versión actual, con la pieza concreta. */
export const usedIn = (robots: RobotDef[], id: string): { r: RobotDef; q: number }[] =>
  robots
    .map((r) => {
      const p = Object.values(currentVersion(r).parts).find((x) => x && x.id === id);
      return p ? { r, q: p.qty } : null;
    })
    .filter((x): x is { r: RobotDef; q: number } => x != null);

export const usedQty = (robots: RobotDef[], id: string): number =>
  usedIn(robots, id).reduce((a, x) => a + x.q, 0);

/** Siguiente id libre del catálogo ("c26"): el mayor número usado más uno. */
export function nextComponentId(cat: Component[]): string {
  const mayor = cat.reduce((m, c) => {
    const n = /^c(\d+)$/.exec(c.id);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return "c" + String(mayor + 1).padStart(2, "0");
}

/**
 * Guarda las piezas elegidas de un robot (HU-06). Si la versión actual no tiene piezas (robot recién
 * creado) la completa, así el robot queda con su versión 1 y su lista de piezas; si ya las tiene,
 * crea la versión siguiente y deja la actual como anterior.
 */
export function saveParts(
  r: RobotDef,
  piezas: Parts,
  nota: string,
): { robot: RobotDef; version: Version } {
  const actual = currentVersion(r);
  const estado = r.fw ? "current" : actual.status === "draft" ? "draft" : "concept";
  if (Object.keys(actual.parts).length === 0) {
    const version: Version = { ...actual, note: nota, status: estado, parts: clone(piezas) };
    return { robot: { ...r, versions: [...r.versions.slice(0, -1), version] }, version };
  }
  const version: Version = {
    v: "v" + (parseInt(actual.v.slice(1), 10) + 1),
    date: "hoy",
    note: nota,
    status: estado,
    parts: clone(piezas),
  };
  const anteriores = r.versions.map((vv, i) =>
    i === r.versions.length - 1 && vv.status === "current" ? { ...vv, status: "previous" } : vv,
  );
  return { robot: { ...r, versions: [...anteriores, version] }, version };
}

/** Datos derivados de las piezas de una versión. */
export function facts(parts: Parts, cat: Component[]): Facts {
  const g = (k: string): Component | undefined => {
    const p = parts[k];
    return p ? byId(cat, p.id) : undefined;
  };
  const q = (k: string): number => (parts[k] ? parts[k]!.qty : 0);
  let cost = 0,
    mass = 0,
    cur = 0;
  Object.values(parts).forEach((p) => {
    if (!p) return;
    const c = byId(cat, p.id);
    if (!c) return;
    cost += c.price * p.qty;
    mass += c.mass * p.qty;
    cur += (c.amps || 0) * p.qty;
  });
  const line = g("linea"),
    ch = g("chasis"),
    mcu = g("mcu");
  return {
    cost,
    mass: mass ? mass + 8 : 0,
    current: cur,
    line,
    sensors: line ? num(line.specs.canales) * q("linea") : 0,
    sensorMdth: q("linea"),
    motor: g("motor"),
    motors: q("motor"),
    mcu,
    driver: g("driver"),
    drivers: q("driver"),
    bat: g("bat"),
    reg: g("reg"),
    mux: g("mux"),
    exp: g("exp"),
    rueda: g("rueda"),
    chassis: ch,
    ancho: ch ? num(ch.specs.ancho) : 0,
    length: ch ? num(ch.specs.largo) : 0,
    enc: g("enc"),
    imu: g("imu"),
    turbine: g("turb"),
    radio: mcu ? String(mcu.specs.radio) : "Ninguna",
  };
}

const C = (s: Severity, t: string, d: string): Check => [s, t, d];

/** Revisión de compatibilidad de las piezas (HU-08). */
export function compat(f: Facts): Check[] {
  const L: Check[] = [];
  if (!f.mcu)
    L.push(
      C("bad", "Falta el microcontrolador", "Sin él no hay firmware ni conexión con la consola."),
    );
  if (f.line && f.mcu) {
    const need = f.line.specs.salida === "Analógica" ? f.sensors : 0;
    if (need) {
      if (f.mux) {
        L.push(
          f.sensors <= num(f.mux.specs.canales)
            ? C(
                "ok",
                `${f.sensors} canales por el multiplexor`,
                `Usa 1 entrada analógica y 4 pines de selección del ${f.mcu.name.split(" ")[0]}.`,
              )
            : C(
                "bad",
                "El multiplexor no alcanza",
                `${f.sensors} canales > ${f.mux.specs.canales} del multiplexor.`,
              ),
        );
      } else {
        L.push(
          need <= num(f.mcu.specs.adc)
            ? C(
                "ok",
                "Entradas analógicas suficientes",
                `${need} de ${f.mcu.specs.adc} disponibles.`,
              )
            : C(
                "bad",
                "Faltan entradas analógicas",
                `${need} sensores y solo ${f.mcu.specs.adc} entradas usables${
                  /WiFi/.test(f.radio) ? " con WiFi activo (ADC2 no funciona con WiFi)" : ""
                }. Agrega un multiplexor.`,
              ),
        );
      }
    }
  }
  if (f.motor && f.driver) {
    const ip = num(f.motor.specs.ipico),
      ic = num(f.motor.specs.inom);
    L.push(
      ip <= num(f.driver.specs.ipico) && ic <= num(f.driver.specs.icont)
        ? C(
            "ok",
            "El driver soporta los motores",
            `Arranque ${ip} A ≤ ${f.driver.specs.ipico} A pico; nominal ${ic} A ≤ ${f.driver.specs.icont} A continuos.`,
          )
        : C(
            "bad",
            "El driver no soporta los motores",
            `Arranque ${ip} A frente a ${f.driver.specs.ipico} A pico.`,
          ),
    );
  }
  if (f.bat && f.driver) {
    const v = num(f.bat.specs.vmax);
    L.push(
      v >= num(f.driver.specs.vmin) && v <= num(f.driver.specs.vmax)
        ? C(
            "ok",
            "Batería dentro del rango del driver",
            `${v} V en ${f.driver.specs.vmin}–${f.driver.specs.vmax} V.`,
          )
        : C(
            "bad",
            "Batería fuera del rango del driver",
            `${v} V fuera de ${f.driver.specs.vmin}–${f.driver.specs.vmax} V.`,
          ),
    );
  }
  if (f.bat && f.motor) {
    const lim = num(f.motor.specs.v) * 1.2,
      pct = Math.round((lim / num(f.bat.specs.vmax)) * 100);
    L.push(
      pct < 100
        ? C(
            "warn",
            `Motores de ${f.motor.specs.v} V con batería de ${f.bat.specs.vmax} V`,
            `Limita el PWM máximo a ${pct} % para no pasar de ${fmt(lim, 1)} V.`,
          )
        : C("ok", "Voltaje de motores compatible", ""),
    );
  }
  if (f.reg && f.mcu) {
    const logic =
      (f.mcu.amps || 0) +
      (f.line ? num(f.line.specs.i) * f.sensorMdth : 0) +
      (f.imu ? f.imu.amps || 0 : 0);
    L.push(
      logic <= num(f.reg.specs.imax)
        ? C("ok", "El regulador cubre la lógica", `${fmt(logic, 2)} A de ${f.reg.specs.imax} A.`)
        : C("bad", "El regulador no alcanza", `${fmt(logic, 2)} A > ${f.reg.specs.imax} A.`),
    );
  }
  if (f.turbine && f.bat) {
    const need = num(f.turbine.specs.imax) + (f.motor ? num(f.motor.specs.inom) * f.motors : 0),
      can = (num(f.bat.specs.mah) / 1000) * num(f.bat.specs.c);
    L.push(
      need <= can
        ? C(
            "ok",
            "La batería soporta turbina y motores",
            `${fmt(need, 1)} A de ${fmt(can, 1)} A de descarga.`,
          )
        : C("bad", "La batería no soporta la turbina", `${fmt(need, 1)} A > ${fmt(can, 1)} A.`),
    );
  }
  if (f.enc && f.motor && f.motor.specs.familia === "TT amarillo")
    L.push(
      C(
        "warn",
        "Encoders con motores TT",
        "Los encoders del catálogo son para motores N20 o Micro Metal.",
      ),
    );
  return L;
}

/** Cumplimiento del reglamento de un perfil (HU-10). */
export function checks(f: Facts, prof: Profile): Check[] {
  const r = prof.rules,
    L: Check[] = [];
  if (r.dim)
    L.push(
      f.ancho <= r.dim[0] && f.length <= r.dim[1]
        ? C("ok", "Dimensiones", `${f.ancho} × ${f.length} mm ≤ ${r.dim[0]} × ${r.dim[1]} mm`)
        : C(
            "bad",
            "Dimensiones",
            `${f.ancho} × ${f.length} mm supera ${r.dim[0]} × ${r.dim[1]} mm`,
          ),
    );
  L.push(
    r.maxSensors && f.sensors > r.maxSensors
      ? C("bad", "Sensores", `${f.sensors} sensores; máximo ${r.maxSensors} en ${prof.cat}`)
      : C(
          "ok",
          "Sensores",
          `${f.sensors} canales${r.maxSensors ? ` (máx. ${r.maxSensors})` : " · libre"}`,
        ),
  );
  if (r.motors)
    L.push(
      f.motors <= r.motors
        ? C("ok", "Motores", `${f.motors} de máximo ${r.motors}`)
        : C("bad", "Motores", `${f.motors} > ${r.motors}`),
    );
  if (r.motorFam)
    L.push(
      f.motor && r.motorFam.includes(String(f.motor.specs.familia))
        ? C("ok", "Tipo de motor", String(f.motor.specs.familia))
        : C("bad", "Tipo de motor", "Solo motorreductores amarillos o celestes sin modificar"),
    );
  if (r.mcu)
    L.push(
      f.mcu &&
        r.mcu.some((m) => f.mcu!.name.includes(m.split(" ").pop() ?? m) || f.mcu!.name.includes(m))
        ? C("ok", "Microcontrolador", f.mcu.name)
        : C("bad", "Microcontrolador", `Permitidos: ${r.mcu.join(", ")}`),
    );
  if (r.commercialPcb === false && f.exp && f.exp.specs.comercial === "Sí")
    L.push(C("bad", "PCB comercial", "No permitida en Amateur (el robot pasa a Senior)"));
  if (r.chasisMat)
    L.push(
      f.chassis && r.chasisMat.some((m) => String(f.chassis!.specs.material).includes(m))
        ? C("ok", "Chasis", String(f.chassis.specs.material))
        : C("bad", "Chasis", "Obligatorio de impresión 3D o MDF"),
    );
  L.push(
    f.turbine && !r.turbine
      ? C("bad", "Turbina", `No permitida en ${prof.cat}`)
      : C("ok", "Turbina", f.turbine ? "Permitida" : "No lleva"),
  );
  L.push(
    f.enc && !r.enc
      ? C("bad", "Encoders", "Prohibidos: el robot solo puede guiarse por la línea")
      : C("ok", "Encoders", f.enc ? "Permitidos" : "No lleva"),
  );
  if (f.imu && !r.imu) L.push(C("bad", "IMU", "Prohibida: solo sensado de línea"));
  L.push(
    r.wireless && f.radio === "Ninguna"
      ? C("bad", "Arranque", "Requiere arranque inalámbrico")
      : C("ok", "Arranque", r.wireless ? `Inalámbrico por ${f.radio}` : "Libre"),
  );
  return L;
}

/** True si el robot cumple el perfil (ningún chequeo en "bad"). */
export const complies = (robot: RobotDef, prof: Profile, cat: Component[]): boolean =>
  !checks(facts(currentVersion(robot).parts, cat), prof).some((x) => x[0] === "bad");

export interface Manifiesto {
  tipo: "manifiesto";
  robot: string;
  nombre: string;
  version: string;
  firmware: string | null;
  sensores: Record<string, unknown>[];
  actuadores: Record<string, unknown>[];
  controlador: {
    activo: string;
    disponibles: string[];
    parametros: Record<string, { min: number; max: number; paso: number }>;
  };
  telemetria: { estado_hz: number; senales_hz: number; lazo_hz: number };
  arranque: "inalambrico" | "interruptor";
  compensacion_bateria: boolean;
}

/** Manifiesto que el robot envía al conectarse (EN-02). */
export function manifest(
  r: RobotDef,
  cat: Component[],
  ctrlActivo: string,
  compensacionBateria: boolean,
): Manifiesto {
  const v = currentVersion(r),
    f = facts(v.parts, cat);
  const m: Manifiesto = {
    tipo: "manifiesto",
    robot: r.id,
    nombre: r.name,
    version: v.v,
    firmware: r.fw || null,
    sensores: [],
    actuadores: [],
    controlador: {
      activo: ctrlActivo,
      disponibles: Object.keys(CTRL),
      parametros: Object.fromEntries(
        CTRL[ctrlActivo].keys.map((k) => [
          k,
          { min: PDEF[k].min, max: PDEF[k].max, paso: PDEF[k].step },
        ]),
      ),
    },
    telemetria: { estado_hz: 1, senales_hz: 20, lazo_hz: 1000 },
    arranque: f.radio !== "Ninguna" ? "inalambrico" : "interruptor",
    compensacion_bateria: compensacionBateria,
  };
  if (f.sensors)
    m.sensores.push({
      id: "regleta",
      tipo: "linea",
      canales: f.sensors,
      modulos: f.sensorMdth,
      via: f.mux ? "multiplexor" : "directo",
    });
  if (f.bat) m.sensores.push({ id: "bateria", tipo: "voltaje", unidad: "V" });
  if (f.enc) m.sensores.push({ id: "encoders", tipo: "encoder", cpr: f.enc.specs.cpr, ruedas: 2 });
  if (f.imu) m.sensores.push({ id: "imu", tipo: "imu", ejes: f.imu.specs.ejes });
  if (f.motors)
    ["motor_izq", "motor_der"]
      .slice(0, f.motors)
      .forEach((id) => m.actuadores.push({ id, tipo: "motor", pwm: [-100, 100] }));
  if (f.turbine) m.actuadores.push({ id: "turbina", tipo: "turbina", pwm: [0, 100] });
  return m;
}

/** Nombre legible de cada panel de dispositivo, por id declarado en el manifiesto. */
const PANEL_NAMES: Record<string, string> = {
  regleta: "Regleta de línea",
  bateria: "Batería",
  encoders: "Encoders",
  imu: "IMU",
  motor_izq: "Motor izquierdo",
  motor_der: "Motor derecho",
  turbina: "Turbina",
};

/**
 * Paneles de dispositivo que la consola arma a partir del manifiesto (HU-13): un panel por cada
 * sensor y actuador declarado, en ese orden. Lo que el robot no declara no produce panel, así
 * que, p. ej., sin encoder no aparece el panel de encoder.
 */
export const manifestPanels = (m: Manifiesto): { id: string; nombre: string }[] =>
  [...m.sensores, ...m.actuadores].map((d) => {
    const id = String(d.id);
    return { id, nombre: PANEL_NAMES[id] ?? id };
  });
