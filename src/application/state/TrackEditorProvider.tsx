// Estado del Trazador de pistas: pista abierta y su edición (almacén), perfil elegido, verificación y guardado.
// Es un proveedor propio (no vive en ConsoleContext) y solo se monta dentro de la página del Trazador.
// El almacén (`TrackEditorStore`) es TypeScript puro; aquí se conecta a React con useSyncExternalStore.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTrackProfiles, type TrackProfilesState } from "@/application/hooks/useTrackProfiles";
import {
  TrackEditorStore,
  canRedo,
  canUndo,
  type EditorOptions,
  type Tool,
} from "@/application/state/trackEditorStore";
import { sameValue } from "@/domain/track/history";
import { normalizeTrack, validateTrack } from "@/domain/track/limits";
import { GEOMETRY_ONLY_RULES, analyze } from "@/domain/track/rules";
import type { Selection } from "@/domain/track/selection";
import type { Analysis, Track, TrackProfile, TrackRules } from "@/domain/track/types";
import { ErrorApi } from "@/infrastructure/http/api";
import type { FieldError } from "@/infrastructure/http/trackErrors";
import { tracksApi } from "@/infrastructure/http/tracks";

/** Resultado del último intento de guardar. */
export interface SaveState {
  status: "idle" | "saving" | "saved" | "error";
  /** Mensaje para el piloto (éxito o resumen del error). */
  message: string;
  /** Errores por campo, con las mismas rutas que usa el servidor (`points[3].radius`). */
  fields: FieldError[];
}

const IDLE: SaveState = { status: "idle", message: "", fields: [] };

interface TrackEditor {
  /** Almacén del editor (lo usa el controlador del lienzo para leer y escribir sin pasar por React). */
  store: TrackEditorStore;
  /** Pista abierta, o `null`. */
  track: Track | null;
  openTrack: (track: Track) => void;
  /** Empieza una pista en blanco. */
  newTrack: () => void;
  closeTrack: () => void;
  /** Reemplaza la pista (un cambio del inspector, por ejemplo): un paso de historial. */
  applyTrack: (track: Track, selection?: Selection) => void;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  tool: Tool;
  setTool: (tool: Tool) => void;
  options: EditorOptions;
  setOptions: (patch: Partial<EditorOptions>) => void;
  /** Hay cambios que la API todavía no tiene. */
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Valida y guarda (crea o actualiza). Devuelve si se guardó. */
  save: () => Promise<boolean>;
  saveState: SaveState;
  clearSaveState: () => void;
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

export function TrackEditorProvider({
  children,
  onSaved,
}: {
  children: ReactNode;
  /** Se llama tras guardar con éxito (la página recarga la lista). */
  onSaved?: (saved: Track) => void;
}) {
  const profiles = useTrackProfiles();
  const store = useMemo(() => new TrackEditorStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  // El perfil forma parte de la pista (`profile_id`): así deshacer, guardar y abrir lo respetan.
  const profileId = state.track?.profileId ?? null;
  const [saveState, setSaveState] = useState<SaveState>(IDLE);
  const saving = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const openTrack = useCallback(
    (next: Track) => {
      store.open(next);
      setSaveState(IDLE);
    },
    [store],
  );
  const newTrack = useCallback(() => {
    store.newTrack();
    setSaveState(IDLE);
  }, [store]);
  const closeTrack = useCallback(() => {
    store.close();
    setSaveState(IDLE);
  }, [store]);
  const selectProfile = useCallback(
    (id: string | null) => {
      store.selectIssue(-1);
      // Cambiar el perfil es un cambio guardable de la pista.
      const t = store.getState().track;
      if (t && t.profileId !== id) store.apply({ ...t, profileId: id });
    },
    [store],
  );

  const save = useCallback(async (): Promise<boolean> => {
    const current = store.getState().track;
    if (!current || saving.current) return false;
    // Se deja la pista en un estado que la API acepta (cerrada solo con ≥ 3 puntos, salida en rango).
    const { track: normalized, warnings } = normalizeTrack(current);
    if (!sameValue(current, normalized)) store.apply(normalized);
    const errors = validateTrack(normalized);
    if (errors.length > 0) {
      setSaveState({
        status: "error",
        message: "Corrige los datos antes de guardar.",
        fields: errors.map((e) => ({ path: e.path, message: e.message })),
      });
      return false;
    }
    saving.current = true;
    setSaveState({ status: "saving", message: "Guardando…", fields: [] });
    try {
      const saved =
        normalized.id === null
          ? await tracksApi.create(normalized)
          : await tracksApi.update(normalized);
      store.markSaved(saved, normalized);
      setSaveState({
        status: "saved",
        message: warnings.length ? `Guardada. ${warnings.join(" ")}` : "Pista guardada en la API.",
        fields: [],
      });
      onSavedRef.current?.(saved);
      return true;
    } catch (e) {
      const api = e instanceof ErrorApi ? e : null;
      setSaveState({
        status: "error",
        message: api
          ? `No se pudo guardar: ${api.message}`
          : "No se pudo guardar: sin conexión con la API.",
        fields: api?.fields ?? [],
      });
      return false;
    } finally {
      saving.current = false;
    }
  }, [store]);

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
      dirty: state.dirty,
      canUndo: canUndo(state),
      canRedo: canRedo(state),
      undo: () => store.undo(),
      redo: () => store.redo(),
      save,
      saveState,
      clearSaveState: () => setSaveState(IDLE),
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
      save,
      saveState,
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
