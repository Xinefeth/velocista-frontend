// Estado del Trazador de pistas: pista abierta y su edición (almacén), perfil elegido, verificación y guardado.
// Es un proveedor propio (no vive en ConsoleContext) y solo se monta dentro de la página del Trazador.
// El almacén (`TrackEditorStore`) es TypeScript puro; aquí se conecta a React con useSyncExternalStore.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import {
  NO_LENGTH_MESSAGE,
  TrackSimulation,
  type SimulationState,
} from "@/application/state/trackSimulation";
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

/** Simulación de vuelta con el robot de prueba (no cambia el documento). */
export interface SimulationControls {
  state: SimulationState;
  /** Abre la barra de simulación; devuelve el motivo si no se pudo (la pista no tiene largo). */
  open: () => string | null;
  close: () => void;
  toggle: () => void;
  /** Coloca el robot a una fracción (0..1) de la vuelta. */
  seek: (fraction: number) => void;
  setParams: TrackSimulation["setParams"];
  /** Posición (0..1) y tiempos transcurrido / total, en segundos. */
  progress: { fraction: number; elapsed: number; total: number };
  /** Para el controlador del lienzo, que lo lee sin pasar por React. */
  store: TrackSimulation;
}

interface TrackEditor {
  /** Almacén del editor (lo usa el controlador del lienzo para leer y escribir sin pasar por React). */
  store: TrackEditorStore;
  /** Pista abierta, o `null`. */
  track: Track | null;
  openTrack: (track: Track) => void;
  /** Abre una pista que aún no está en la API (importada o recuperada): queda con cambios pendientes. */
  restoreTrack: (track: Track) => void;
  /** Empieza una pista en blanco. */
  newTrack: () => void;
  closeTrack: () => void;
  /** Reemplaza la pista (un cambio del inspector, por ejemplo): un paso de historial. */
  applyTrack: (track: Track, selection?: Selection) => void;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  tool: Tool;
  /** Plantilla elegida cuando la herramienta es `tpl`. */
  template: string | null;
  setTool: (tool: Tool, template?: string | null) => void;
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
  sim: SimulationControls;
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
  const simStore = useMemo(() => new TrackSimulation(), []);
  const sim = useSyncExternalStore(simStore.subscribe, simStore.getState);
  const [saveState, setSaveState] = useState<SaveState>(IDLE);
  const saving = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const openTrack = useCallback(
    (next: Track) => {
      simStore.close();
      store.open(next);
      setSaveState(IDLE);
    },
    [store, simStore],
  );
  const restoreTrack = useCallback(
    (next: Track) => {
      simStore.close();
      store.restore(next);
      setSaveState(IDLE);
    },
    [store, simStore],
  );
  const newTrack = useCallback(() => {
    simStore.close();
    store.newTrack();
    setSaveState(IDLE);
  }, [store, simStore]);
  const closeTrack = useCallback(() => {
    simStore.close();
    store.close();
    setSaveState(IDLE);
  }, [store, simStore]);
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

  // La geometría viva para la simulación: se lee desde el bucle de animación sin volver a suscribirse.
  const liveRef = useRef<{ analysis: Analysis | null; start: Track["start"] | null }>({
    analysis: null,
    start: null,
  });
  liveRef.current = { analysis, start: state.track?.start ?? null };

  // Si la pista editada se queda sin largo, la simulación se cierra sola.
  const noLength = !analysis || analysis.g.L <= 0;
  useEffect(() => {
    if (noLength) simStore.close();
  }, [noLength, simStore]);

  // Bucle de animación: solo corre mientras se reproduce.
  useEffect(() => {
    if (!sim.playing) return;
    let raf = 0;
    let last = 0;
    const frame = (ts: number) => {
      const g = liveRef.current.analysis?.g;
      if (!g) return;
      simStore.tick(g, last ? (ts - last) / 1000 : 0);
      last = ts;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sim.playing, simStore]);

  const simControls = useMemo<SimulationControls>(
    () => ({
      state: sim,
      open: () => {
        const { analysis: a, start } = liveRef.current;
        if (!a || !start || !simStore.open(a.g, start)) return NO_LENGTH_MESSAGE;
        return null;
      },
      close: () => simStore.close(),
      toggle: () => {
        const g = liveRef.current.analysis?.g;
        if (g) simStore.toggle(g);
      },
      seek: (f) => {
        const { analysis: a, start } = liveRef.current;
        if (a && start) simStore.seek(a.g, start, f);
      },
      setParams: (p) => simStore.setParams(p),
      progress:
        analysis && state.track
          ? simStore.progress(analysis.g, state.track.start)
          : { fraction: 0, elapsed: 0, total: 0 },
      store: simStore,
    }),
    // `sim` cambia en cada cuadro: el progreso se recalcula con él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim, simStore, analysis, state.track?.start],
  );

  const value = useMemo<TrackEditor>(
    () => ({
      store,
      track: state.track,
      openTrack,
      restoreTrack,
      newTrack,
      closeTrack,
      applyTrack: (track, selection) => store.apply(track, selection),
      selection: state.selection,
      setSelection: (s) => store.setSelection(s),
      tool: state.tool,
      template: state.template,
      setTool: (t, tpl) => store.setTool(t, tpl ?? null),
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
      sim: simControls,
    }),
    [
      store,
      state,
      openTrack,
      restoreTrack,
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
      simControls,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTrackEditor(): TrackEditor {
  const value = useContext(Context);
  if (!value) throw new Error("useTrackEditor debe usarse dentro de TrackEditorProvider");
  return value;
}
