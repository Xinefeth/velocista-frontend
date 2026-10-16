// Estado compartido de la conexión: salud de la API y tiempo real.
import { createContext, useContext, type ReactNode } from "react";
import { useHealth } from "@/application/hooks/useHealth";
import { useRealtime } from "@/application/hooks/useRealtime";
import type { EstadoConexion, Salud } from "@/infrastructure/contracts/api";
import type { MensajeConsola } from "@/infrastructure/contracts/messages";

interface Conexion {
  salud: Salud | null;
  api: EstadoConexion;
  baseDeDatos: EstadoConexion;
  tiempoReal: EstadoConexion;
  mensajes: MensajeConsola[];
}

const Contexto = createContext<Conexion | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { health, status } = useHealth();
  const { connected, messages } = useRealtime();
  const baseDeDatos: EstadoConexion =
    status === "checking" ? "checking" : health?.database === "ok" ? "ok" : "down";
  const valor: Conexion = {
    salud: health,
    api: status,
    baseDeDatos,
    tiempoReal: connected === null ? "checking" : connected ? "ok" : "down",
    mensajes: messages,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useConnection(): Conexion {
  const c = useContext(Contexto);
  if (!c) throw new Error("useConnection debe usarse dentro de ConnectionProvider");
  return c;
}

/** Como useConnection pero devuelve null si no hay proveedor (no lanza). */
export function useOptionalConnection(): Conexion | null {
  return useContext(Contexto);
}
