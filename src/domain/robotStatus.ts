// Deriva el estado en vivo del robot (HU-14) a partir de los mensajes de /ws/console.
// Fuente: mensajes `status` (EstadoRobot) y `link`/`hello` que la API reenvía.
import type { EstadoRobot } from "@/infrastructure/contracts/contract";
import type { MensajeConsola } from "@/infrastructure/contracts/messages";

export interface RobotStatus {
  /** ¿El velocista está enlazado? */
  connected: boolean;
  /** Estado del robot, o null si aún no llegó un `status`. */
  state: EstadoRobot["state"] | null;
  /** Batería en voltios (canal `bateria_v`), o null. */
  battery: number | null;
  /** RSSI del enlace en dBm (`rssi_dbm`), o null. */
  rssiDbm: number | null;
  /** Frecuencia del lazo de control en Hz (`loop_hz`), o null. */
  loopHz: number | null;
}

export const EMPTY_STATUS: RobotStatus = {
  connected: false,
  state: null,
  battery: null,
  rssiDbm: null,
  loopHz: null,
};

/**
 * Recorre los mensajes (más nuevo primero, como los entrega useTiempoReal) y arma el
 * último estado conocido del velocista. Si llegó un `status` reciente, se considera
 * enlazado aunque no haya llegado el mensaje `link`.
 */
export function robotStatusFromMessages(messages: MensajeConsola[]): RobotStatus {
  let state: RobotStatus["state"] = null;
  let battery: number | null = null;
  let rssiDbm: number | null = null;
  let loopHz: number | null = null;
  let connected: boolean | null = null;

  for (const m of messages) {
    if (state === null && m.sender === "robot" && m.type === "status") {
      const d = m.data as unknown as EstadoRobot;
      state = d.state ?? null;
      loopHz = typeof d.loop_hz === "number" ? d.loop_hz : null;
      rssiDbm = typeof d.rssi_dbm === "number" ? d.rssi_dbm : null;
      // La clave de canal `bateria_v` la define el firmware; se migrará con él.
      const bv = d.channels?.bateria_v;
      battery = typeof bv === "number" ? bv : null;
    }
    if (connected === null && m.sender === "api" && m.type === "link") {
      const d = m.data as { device?: string; connected?: boolean };
      if (d.device === "robot") connected = Boolean(d.connected);
    }
    if (connected === null && m.sender === "api" && m.type === "hello") {
      const d = m.data as { devices?: Record<string, boolean> };
      if (d.devices && "robot" in d.devices) {
        connected = Boolean(d.devices.robot);
      }
    }
    if (state !== null && connected !== null) break;
  }

  if (connected === null) connected = state !== null;
  return { connected, state, battery, rssiDbm, loopHz };
}
