// Pistas guardadas: lista, abrir y borrar (S2). Guardar y actualizar llegan con la edición (S3).
import { useCallback, useEffect, useState } from "react";
import type { Track } from "@/domain/track/types";
import { ErrorApi } from "@/infrastructure/http/api";
import { tracksApi } from "@/infrastructure/http/tracks";

export interface TracksState {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Lee una pista completa de la API; devuelve `null` y deja el error si falla. */
  open: (id: number) => Promise<Track | null>;
  /** Borra una pista y refresca la lista; devuelve si se borró. */
  remove: (id: number) => Promise<boolean>;
}

const messageOf = (prefix: string, e: unknown) =>
  `${prefix}: ${e instanceof ErrorApi ? e.message : "sin conexión con la API"}`;

export function useTracks(): TracksState {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const reload = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    tracksApi
      .list()
      .then((list) => alive && setTracks(list))
      .catch((e) => alive && setError(messageOf("No se pudieron cargar las pistas", e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [request]);

  const open = useCallback(async (id: number) => {
    try {
      setError(null);
      return await tracksApi.get(id);
    } catch (e) {
      setError(messageOf("No se pudo abrir la pista", e));
      return null;
    }
  }, []);

  const remove = useCallback(
    async (id: number) => {
      try {
        setError(null);
        await tracksApi.remove(id);
        reload();
        return true;
      } catch (e) {
        setError(messageOf("No se pudo borrar la pista", e));
        return false;
      }
    },
    [reload],
  );

  return { tracks, loading, error, reload, open, remove };
}
