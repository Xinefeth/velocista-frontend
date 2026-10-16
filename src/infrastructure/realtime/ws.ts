import { accessToken } from "@/infrastructure/config";
// Única capa que abre conexiones WebSocket (DO-02, sección 6). La consola solo escucha.
import { socketUrl as consoleUrl } from "@/infrastructure/config";
export { consoleUrl } from "@/infrastructure/config/urls";
import type { MensajeConsola } from "@/infrastructure/contracts/messages";

export const RETRY_MS = 3000;

export interface Subscription {
  close: () => void;
}

/** Se conecta a /ws/console y se reconecta sola cada RETRY_MS mientras no se cierre. */
export function listenConsole(
  onMessage: (m: MensajeConsola) => void,
  onStatusChange: (connected: boolean) => void,
): Subscription {
  let closed = false;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    const url = new URL(consoleUrl(window.location));
    const token = accessToken();
    if (token) url.searchParams.set("token", token);
    socket = new WebSocket(url.href);
    socket.onopen = () => onStatusChange(true);
    socket.onclose = () => {
      onStatusChange(false);
      if (!closed) retryTimer = setTimeout(connect, RETRY_MS);
    };
    socket.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data as string) as MensajeConsola);
      } catch {
        /* se ignoran mensajes no JSON */
      }
    };
  };
  connect();
  return {
    close: () => {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
