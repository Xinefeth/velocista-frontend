// Estado del Trazador de pistas: pista abierta y su edición (almacén), perfil elegido y verificación.
// Es un proveedor propio (no vive en ConsoleContext) y solo se monta dentro de la página del Trazador.
// El almacén (`TrackEditorStore`) es TypeScript puro; aquí se conecta a React con useSyncExternalStore.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTrackProfiles, type TrackProfilesState } from "@/application/hooks/useTrackProfiles";
import {
  TrackEditorStore,
  type EditorOptions,
  type Tool,
} from "@/application/state/trackEditorStore";
import { GEOMETRY_ONLY_RULES, analyze } from "@/domain/track/rules";
import type { Selection } from "@/domain/track/selection";
import type { Analysis, Track, TrackProfile, TrackRules } from "@/domain/track/types";

interface TrackEditor {
  /** Almacén del editor (lo usa el controlador del lienzo para leer y escribir sin pasar por React). */
  store: TrackEditorStore;
  /** Pista abierta, o `null`. */
  track: Track | null;
  openTrack: (track: Track) => void;
  /** Empieza una pista en blanco. */
  newTrack: () => void;
  closeTrack: () => void;
  /** Reemplaza la pista (un cambio del inspector, por ejemplo). */
  applyTrack: (track: Track, selection?: Selection) => void;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  tool: Tool;
  setTool: (tool: Tool) => void;
  options: EditorOptions;
  setOptions: (patch: Partial<EditorOptions>) => void;
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
  const store = useMemo(() => new TrackEditorStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [profileId, setProfileId] = useState<string | null>(null);

  const openTrack = useCallback(
    (next: Track) => {
      store.open(next);
      setProfileId(next.profileId);
    },
    [store],
  );
  const newTrack = useCallback(() => {
    store.newTrack();
    setProfileId(null);
  }, [store]);
  const closeTrack = useCallback(() => {
    store.close();
    setProfileId(null);
  }, [store]);
  const selectProfile = useCallback(
    (id: string | null) => {
      setProfileId(id);
      store.selectIssue(-1);
    },
    [store],
  );

  const profile = useMemo(
    () => profiles.profiles.find((p) => p.id === profileId) ?? null,
    [profiles.profiles, profileId],
  );
  const rules = profile?.rules ?? null;
  const analysis = useMemo<Analysis | null>(() => {
    if (!state.track) return null;
    const result = analyze(state.track, rules ?? GEOMETRY_ONLY_RULES);
    // Sin reglas de pista no se verifica: se conservan la geometría y las estadísticas, no las incidencias.
    return rules ? result : { ...result, issues: [] };
  }, [state.track, rules]);

  const value = useMemo<TrackEditor>(
    () => ({
      store,
      track: state.track,
      openTrack,
      newTrack,
      closeTrack,
      applyTrack: (track, selection) => store.apply(track, selection),
      selection: state.selection,
      setSelection: (s) => store.setSelection(s),
      tool: state.tool,
      setTool: (t) => store.setTool(t),
      options: state.options,
      setOptions: (patch) => store.setOptions(patch),
      profiles,
      profileId,
      profile,
      rules,
      selectProfile,
      analysis,
      issueSel: state.issueSel,
      selectIssue: (i) => store.selectIssue(i),
    }),
    [
      store,
      state,
      openTrack,
      newTrack,
      closeTrack,
      profiles,
      profileId,
      profile,
      rules,
      selectProfile,
      analysis,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTrackEditor(): TrackEditor {
  const value = useContext(Context);
  if (!value) throw new Error("useTrackEditor debe usarse dentro de TrackEditorProvider");
  return value;
}
