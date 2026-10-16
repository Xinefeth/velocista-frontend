import { useEffect, useState } from "react";
import { api } from "@/infrastructure/http/api";
import type { EstadoConexion, Salud } from "@/infrastructure/contracts/api";

export const HEALTH_INTERVAL_MS = 5000;

/** Consulta /api/health al montar y cada HEALTH_INTERVAL_MS. */
export function useHealth(): { health: Salud | null; status: EstadoConexion } {
  const [health, setHealth] = useState<Salud | null>(null);
  const [status, setStatus] = useState<EstadoConexion>("checking");

  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .health()
        .then((s) => alive && (setHealth(s), setStatus("ok")))
        .catch(() => alive && (setHealth(null), setStatus("down")));
    check();
    const id = setInterval(check, HEALTH_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { health, status };
}
