// Estado del Trazador de pistas: pista abierta, perfil elegido, incidencia elegida y verificación.
// Es un proveedor propio (no vive en ConsoleContext) y solo se monta dentro de la página del Trazador.
// En S2 el documento es de solo lectura; la edición, el historial y el guardado llegan en S3.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTrackProfiles, type TrackProfilesState } from "@/application/hooks/useTrackProfiles";
import { GEOMETRY_ONLY_RULES, analyze } from "@/domain/track/rules";
import type { Analysis, Track, TrackProfile, TrackRules } from "@/domain/track/types";

interface TrackEditor {
  /** Pista abierta, o `null`. */
  track: Track | null;
  openTrack: (track: Track) => void;
  closeTrack: () => void;
  profiles: TrackProfilesState;
  profileId: string | null;
  /** Perfil elegido (puede no tener reglas de pista). */
  profile: TrackProfile | null;
  /** Reglas de pista del perfil elegido, o `null` (sin perfil o perfil sin `rules.track`). */
  rules: TrackRules | null;
  selectProfile: (id: string | null) => void;
  /** Geometría y estadísticas siempre; incidencias solo si hay reglas de pista. */
  analysis: Analysis | null;
  issueSel: number;
  selectIssue: (index: number) => void;
}

const Context = createContext<TrackEditor | null>(null);

export function TrackEditorProvider({ children }: { children: ReactNode }) {
  const profiles = useTrackProfiles();
  const [track, setTrack] = useState<Track | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [issueSel, setIssueSel] = useState(-1);

  const openTrack = useCallback((next: Track) => {
    setTrack(next);
    setProfileId(next.profileId);
    setIssueSel(-1);
  }, []);
  const closeTrack = useCallback(() => {
    setTrack(null);
    setProfileId(null);
    setIssueSel(-1);
  }, []);
  const selectProfile = useCallback((id: string | null) => {
    setProfileId(id);
    setIssueSel(-1);
  }, []);

  const profile = useMemo(
    () => profiles.profiles.find((p) => p.id === profileId) ?? null,
    [profiles.profiles, profileId],
  );
  const rules = profile?.rules ?? null;
  const analysis = useMemo<Analysis | null>(() => {
    if (!track) return null;
    const result = analyze(track, rules ?? GEOMETRY_ONLY_RULES);
    // Sin reglas de pista no se verifica: se conservan la geometría y las estadísticas, no las incidencias.
    return rules ? result : { ...result, issues: [] };
  }, [track, rules]);

  const value = useMemo<TrackEditor>(
    () => ({
      track,
      openTrack,
      closeTrack,
      profiles,
      profileId,
      profile,
      rules,
      selectProfile,
      analysis,
      issueSel,
      selectIssue: setIssueSel,
    }),
    [
      track,
      openTrack,
      closeTrack,
      profiles,
      profileId,
      profile,
      rules,
      selectProfile,
      analysis,
      issueSel,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTrackEditor(): TrackEditor {
  const value = useContext(Context);
  if (!value) throw new Error("useTrackEditor debe usarse dentro de TrackEditorProvider");
  return value;
}
