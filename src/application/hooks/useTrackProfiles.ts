// Perfiles de reglamento para el Trazador: se leen de GET /api/profiles (sin perfiles de respaldo).
import { useCallback, useEffect, useState } from "react";
import type { TrackProfile } from "@/domain/track/types";
import { ErrorApi } from "@/infrastructure/http/api";
import { profilesApi } from "@/infrastructure/http/profiles";

export interface TrackProfilesState {
  profiles: TrackProfile[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useTrackProfiles(): TrackProfilesState {
  const [profiles, setProfiles] = useState<TrackProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const reload = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    profilesApi
      .list()
      .then((list) => alive && setProfiles(list))
      .catch(
        (e) =>
          alive &&
          setError(
            "No se pudieron cargar los perfiles: " +
              (e instanceof ErrorApi ? e.message : "sin conexión con la API"),
          ),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [request]);

  return { profiles, loading, error, reload };
}
