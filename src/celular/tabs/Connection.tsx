// 1. Conexión: el backend responde, se activan los sensores y se ve el código de este celular.
// Si se cambia de enlace, se recupera el código anterior para seguir viendo las mediciones.
import { useEffect, useReducer, useState } from "react";
import { Msg, NO_MSG, usePhone, type MsgState } from "@/celular/context";
import { sensors } from "@/celular/sensors";
import { deviceCode, errorText, fmtEs } from "@/domain/measurement/labels";
import { api } from "@/infrastructure/http/api";
import { measurementsApi } from "@/infrastructure/http/measurements";

/** Busca entre los celulares con mediciones uno solo cuyo código empiece igual. */
export function findDevice(code: string, deviceIds: string[]): { id: string } | { error: string } {
  const c = code.trim().toLowerCase().replace(/^cel-/, "");
  if (c.length < 6) return { error: "Escribe al menos los 6 primeros caracteres de tu código." };
  const found = [...new Set(deviceIds)].filter((d) => d.replace(/^cel-/, "").startsWith(c));
  if (found.length === 1) return { id: found[0] };
  return {
    error: found.length
      ? "Hay varios códigos así: escribe más caracteres."
      : "No encontré mediciones con ese código.",
  };
}

export function Connection() {
  const { device, setDevice, refreshCal } = usePhone();
  const [conn, setConn] = useState<MsgState>(NO_MSG);
  const [sens, setSens] = useState<MsgState>(NO_MSG);
  const [dev, setDev] = useState<MsgState>(NO_MSG);
  const [old, setOld] = useState("");
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useEffect(() => sensors.subscribe(redraw), []);
  useEffect(() => {
    const id = window.setInterval(redraw, 300);
    return () => window.clearInterval(id);
  }, []);

  async function connect() {
    setConn({ text: "Conectando…", kind: "" });
    try {
      const h = await api.health();
      if (h.database !== "ok") throw new Error("El backend responde pero la base de datos no.");
      await refreshCal();
      setConn({ text: "Conectado ✔ (base de datos lista)", kind: "good" });
    } catch (e) {
      setConn({ text: errorText(e), kind: "err" });
    }
  }

  async function activate() {
    try {
      await sensors.start();
      setSens({ text: "Sensores activados. Mueve el celular para verlos.", kind: "good" });
      window.setTimeout(() => {
        if (!sensors.accelAt)
          setSens({
            text: "No llegan datos de movimiento. Recarga la página y acepta los permisos.",
            kind: "err",
          });
        else if (!sensors.gyroAt)
          setSens({
            text: "Este celular no tiene giroscopio: solo podrás medir por GPS.",
            kind: "err",
          });
      }, 3000);
    } catch (e) {
      setSens({ text: (e as Error).message, kind: "err" });
    }
  }

  async function recover() {
    try {
      const page = await measurementsApi.list();
      const found = findDevice(
        old,
        page.items.map((m) => m.device_id),
      );
      if ("error" in found) return setDev({ text: found.error, kind: "err" });
      setDevice(found.id);
      const n = page.items.filter((m) => m.device_id === found.id).length;
      setDev({ text: `Listo ✔ recuperé tus datos (${n} mediciones).`, kind: "good" });
    } catch (e) {
      setDev({ text: errorText(e), kind: "err" });
    }
  }

  return (
    <>
      <section className="card">
        <div className="hd">
          <h2>Conectar con el sistema</h2>
        </div>
        <p className="hint">
          La página usa el mismo backend que la consola. Si pide sesión, inicia sesión.
        </p>
        <div className="row">
          <button type="button" className="sb red wide" onClick={() => void connect()}>
            Conectar
          </button>
        </div>
        <Msg {...conn} />
      </section>
      <section className="card">
        <div className="hd">
          <h2>Sensores del celular</h2>
        </div>
        <p className="hint">Necesita HTTPS. En iPhone hay que aceptar el permiso de movimiento.</p>
        <div className="row">
          <button type="button" className="sb red wide" onClick={() => void activate()}>
            Activar sensores
          </button>
        </div>
        <div className="kv" style={{ marginTop: 10 }}>
          <span>Giroscopio</span>
          <b>{sensors.gyro == null ? "—" : `${fmtEs(sensors.gyro, 1)} °/s`}</b>
          <span>Acelerómetro</span>
          <b>{sensors.accel == null ? "—" : `${fmtEs(Math.hypot(...sensors.accel), 2)} m/s²`}</b>
          <span>GPS (precisión)</span>
          <b>
            {sensors.fix
              ? `± ${fmtEs(sensors.fix.accuracy_m, 1)} m`
              : sensors.gpsError
                ? "Sin permiso o sin señal"
                : "—"}
          </b>
          <span>Pantalla siempre encendida</span>
          <b>{sensors.wake}</b>
          <span>Código de este celular</span>
          <b
            style={{ fontSize: "1.05rem", color: "var(--green)" }}
            aria-label="Código de este celular"
          >
            {deviceCode(device)}
          </b>
        </div>
        <Msg {...sens} />
      </section>
      <section className="card">
        <div className="hd">
          <h2>¿No ves tus mediciones anteriores?</h2>
        </div>
        <p className="hint">
          Cada enlace nuevo crea un código nuevo. Anota tu código (arriba, en verde) y, si cambias
          de enlace, escríbelo aquí para recuperar tus mediciones y calibraciones.
        </p>
        <div className="row">
          <input
            className="inp"
            aria-label="Tu código"
            placeholder="Tu código, ej. 621b8d99"
            autoComplete="off"
            value={old}
            onChange={(e) => setOld(e.target.value)}
            style={{ flex: "2 1 160px" }}
          />
          <button type="button" className="sb red" onClick={() => void recover()}>
            Recuperar
          </button>
        </div>
        <Msg {...dev} />
      </section>
    </>
  );
}
