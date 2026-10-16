import { useEffect, useRef, useState } from "react";
import { useOptionalConnection } from "@/application/state/ConnectionContext";
import type { EstadoRobot, Manifiesto } from "@/infrastructure/contracts/contract";

/** Conserva snapshots aunque los mensajes salgan del buffer de telemetría. */
export function useRobotConnection() {
  const connection = useOptionalConnection();
  const seen = useRef(new WeakSet<object>());
  const [connected, setConnected] = useState(false);
  const [manifest, setManifest] = useState<Manifiesto | null>(null);
  const [status, setStatus] = useState<EstadoRobot | null>(null);
  useEffect(() => {
    for (const message of [...(connection?.mensajes ?? [])].reverse()) {
      if (seen.current.has(message)) continue;
      seen.current.add(message);
      if (message.sender === "api" && message.type === "hello") {
        const devices = message.data.devices as { robot?: boolean } | undefined;
        setConnected(Boolean(devices?.robot));
      } else if (
        message.sender === "api" &&
        message.type === "link" &&
        message.data.device === "robot"
      ) {
        setConnected(Boolean(message.data.connected));
        if (!message.data.connected) {
          setManifest(null);
          setStatus(null);
        }
      } else if (message.sender === "robot" && message.type === "manifest") {
        setManifest(message.data as unknown as Manifiesto);
        setStatus(null);
        setConnected(true);
      } else if (message.sender === "robot" && message.type === "status") {
        setStatus(message.data as unknown as EstadoRobot);
        setConnected(true);
      }
    }
  }, [connection?.mensajes]);
  return { connected: connection?.tiempoReal === "ok" && connected, manifest, status };
}
