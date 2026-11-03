// Almacén del editor de pistas: pista abierta, historial (deshacer/rehacer), selección, herramienta y opciones.
// Es TypeScript puro (sin React) para poder probarlo y para que el controlador del lienzo lo use por
// una interfaz pequeña. Un gesto del ratón = un paso de historial: durante el arrastre se llama a
// `preview()` (sin historial, React se entera una vez por cuadro) y al soltar a `commit(antes)`.
// El borrador local llega en el siguiente punto de EN-28.
import { blankTrack } from "@/domain/track/commands";
import {
  emptyHistory,
  pushHistory,
  redoHistory,
  sameValue,
  undoHistory,
  type History,
} from "@/domain/track/history";
import {
  EMPTY_SELECTION,
  sameSelection,
  sanitizeSelection,
  type Selection,
} from "@/domain/track/selection";
import { DEFAULT_SNAP, type SnapOptions } from "@/domain/track/snap";
import type { Track } from "@/domain/track/types";

export type Tool = "select" | "draw" | "zone" | "tpl";

export interface EditorOptions extends SnapOptions {
  /** Radio con el que nace cada punto nuevo, en cm. */
  radius: number;
  /** Mostrar siempre todos los puntos de control. */
  nodes: boolean;
  /** Mostrar las cotas (largos, radios y ángulos). Activas por defecto, como en el prototipo. */
  dims: boolean;
}

export const DEFAULT_OPTIONS: EditorOptions = {
  ...DEFAULT_SNAP,
  radius: 15,
  nodes: false,
  dims: true,
};

export interface EditorState {
  /** Pista abierta, o `null`. */
  track: Track | null;
  selection: Selection;
  tool: Tool;
  /** Plantilla elegida cuando `tool` es `tpl`. */
  template: string | null;
  options: EditorOptions;
  /** Historial de la pista abierta (en memoria, hasta 200 pasos). */
  history: History<Track>;
  /** La pista como estaba al abrirla o al guardarla: con ella se decide si hay cambios pendientes. */
  clean: Track | null;
  /** Hay cambios respecto a `clean` (se apagan solos si se deshace hasta ese punto). */
  dirty: boolean;
  /** Incidencia elegida en la lista de verificación, o -1. */
  issueSel: number;
}

const initial = (): EditorState => ({
  track: null,
  selection: EMPTY_SELECTION,
  tool: "select",
  template: null,
  options: DEFAULT_OPTIONS,
  history: emptyHistory<Track>(),
  clean: null,
  dirty: false,
  issueSel: -1,
});

type Listener = () => void;

/** Un estado del historial conserva la identidad (id y fechas) de la pista actual: deshacer no «desguarda». */
const keepIdentity = (identity: Track, state: Track): Track => ({
  ...state,
  id: identity.id,
  createdAt: identity.createdAt,
  updatedAt: identity.updatedAt,
});

export class TrackEditorStore {
  private state: EditorState = initial();
  private listeners = new Set<Listener>();
  private frame = 0;

  /** Estado actual (siempre fresco, aunque los avisos a React se agrupen por cuadro). */
  getState = (): EditorState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** Avisa una vez por cuadro durante los arrastres, para no renderizar React por cada movimiento. */
  private emitSoon(): void {
    if (typeof requestAnimationFrame !== "function") return this.emit();
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.emit();
    });
  }

  private set(patch: Partial<EditorState>, soon = false): void {
    const next = { ...this.state, ...patch };
    // Los cambios pendientes salen de comparar con la pista limpia: deshacer hasta ahí los apaga.
    if ("track" in patch || "clean" in patch)
      next.dirty = !!next.track && (!next.clean || !sameValue(next.clean, next.track));
    this.state = next;
    if (soon) this.emitSoon();
    else this.emit();
  }

  // ---- documento ----

  /** Abre una pista (guardada, de ejemplo o importada): historial vacío y sin cambios pendientes. */
  open(track: Track): void {
    this.set({
      track,
      clean: track,
      history: emptyHistory<Track>(),
      selection: EMPTY_SELECTION,
      issueSel: -1,
      tool: "select",
      template: null,
    });
  }

  /** Empieza una pista en blanco con la herramienta de dibujo. */
  newTrack(): void {
    const blank = blankTrack();
    this.set({
      track: blank,
      clean: blank,
      history: emptyHistory<Track>(),
      selection: EMPTY_SELECTION,
      issueSel: -1,
      tool: "draw",
      template: null,
    });
  }

  /** Recupera un borrador: queda como cambio pendiente (no hay pista limpia con la que compararlo). */
  restore(track: Track): void {
    this.set({
      track,
      clean: null,
      history: emptyHistory<Track>(),
      selection: EMPTY_SELECTION,
      issueSel: -1,
      tool: "select",
      template: null,
    });
  }

  close(): void {
    this.set({ ...initial(), options: this.state.options });
  }

  /** Aplica un cambio con su propio paso de historial; no hace nada si no cambia la pista. */
  apply(next: Track, selection?: Selection): void {
    const { track } = this.state;
    if (!track) return;
    if (sameValue(track, next)) {
      if (selection) this.setSelection(selection);
      return;
    }
    this.set({
      track: next,
      history: pushHistory(this.state.history, track),
      selection: sanitizeSelection(selection ?? this.state.selection, next),
      issueSel: -1,
    });
  }

  /** Vista previa durante un arrastre: cambia la pista sin historial; el paso se registra con `commit`. */
  preview(next: Track): void {
    if (!this.state.track) return;
    this.set({ track: next }, true);
  }

  /** Cierra un gesto: si la pista cambió respecto a `before`, `before` entra al historial como un solo paso. */
  commit(before: Track): void {
    const { track } = this.state;
    if (!track) return;
    if (sameValue(before, track)) return; // el gesto no cambió nada (un clic sin mover)
    this.set({
      history: pushHistory(this.state.history, before),
      selection: sanitizeSelection(this.state.selection, track),
      issueSel: -1,
    });
  }

  undo(): void {
    const { track } = this.state;
    if (!track) return;
    const r = undoHistory(this.state.history, track);
    if (!r) return;
    this.set({
      track: keepIdentity(track, r.value),
      history: r.history,
      selection: EMPTY_SELECTION,
      issueSel: -1,
    });
  }

  redo(): void {
    const { track } = this.state;
    if (!track) return;
    const r = redoHistory(this.state.history, track);
    if (!r) return;
    this.set({
      track: keepIdentity(track, r.value),
      history: r.history,
      selection: EMPTY_SELECTION,
      issueSel: -1,
    });
  }

  /**
   * Tras guardar en la API. `sent` es lo que se envió: si el piloto no tocó nada mientras tanto, la pista
   * guardada (con `id` y fechas) reemplaza a la actual y ya no hay cambios. Si siguió editando, conserva
   * sus cambios (queda con el `id` nuevo) y sigue marcada como pendiente.
   */
  markSaved(saved: Track, sent?: Track): void {
    const { track } = this.state;
    if (!track) return;
    const untouched = !sent || sameValue(sent, track);
    this.set({
      track: untouched ? saved : keepIdentity(saved, track),
      clean: saved,
    });
  }

  // ---- selección, herramienta y opciones ----

  setSelection(selection: Selection): void {
    const track = this.state.track;
    const next = track ? sanitizeSelection(selection, track) : EMPTY_SELECTION;
    if (sameSelection(next, this.state.selection)) return;
    this.set({ selection: next });
  }

  setTool(tool: Tool, template: string | null = null): void {
    const tpl = tool === "tpl" ? template : null;
    if (tool === this.state.tool && tpl === this.state.template) return;
    this.set({ tool, template: tpl });
  }

  setOptions(patch: Partial<EditorOptions>): void {
    this.set({ options: { ...this.state.options, ...patch } });
  }

  selectIssue(index: number): void {
    this.set({ issueSel: index });
  }
}

/** ¿Se puede deshacer / rehacer? (para los botones). */
export const canUndo = (s: EditorState): boolean => s.history.past.length > 0;
export const canRedo = (s: EditorState): boolean => s.history.future.length > 0;
