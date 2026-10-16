import { useEffect, useState } from "react";
import { listenConsole } from "@/infrastructure/realtime/ws";
import type { MensajeConsola } from "@/infrastructure/contracts/messages";

export const MAX_MESSAGES = 50;

/** Mantiene la conexión con /ws/console y los últimos mensajes recibidos. */
export function useRealtime(): { connected: boolean | null; messages: MensajeConsola[] } {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<MensajeConsola[]>([]);

  useEffect(() => {
    const s = listenConsole(
      (m) => setMessages((prev) => [m, ...prev].slice(0, MAX_MESSAGES)),
      setConnected,
    );
    return () => s.close();
  }, []);

  return { connected, messages };
}
