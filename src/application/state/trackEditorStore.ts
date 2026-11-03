// Almacén del editor de pistas: pista abierta, selección, herramienta y opciones.
// Es TypeScript puro (sin React) para poder probarlo y para que el controlador del lienzo lo use por
// una interfaz pequeña. Durante un arrastre se llama a `preview()` muchas veces; React se entera
// una vez por cuadro. El historial, el guardado y el borrador llegan en los siguientes puntos de EN-28.
import { blankTrack } from "@/domain/track/commands";
import {
  EMPTY_SELECTION,
  sameSelection,
  sanitizeSelection,
  type Selection,
} from "@/domain/track/selection";
import { sameValue } from "@/domain/track/history";
import type { Track } from "@/domain/track/types";

export type Tool = "select" | "draw";

export interface EditorOptions {
  /** Radio con el que nace cada punto nuevo, en cm. */
  radius: number;
  /** Mostrar siempre todos los puntos de control. */
  nodes: boolean;
}

export const DEFAULT_OPTIONS: EditorOptions = { radius: 15, nodes: false };

export interface EditorState {
  /** Pista abierta, o `null`. */
  track: Track | null;
  selection: Selection;
  tool: Tool;
  options: EditorOptions;
  /** Incidencia elegida en la lista de verificación, o -1. */
  issueSel: number;
}

const initial = (): EditorState => ({
  track: null,
  selection: EMPTY_SELECTION,
  tool: "select",
  options: DEFAULT_OPTIONS,
  issueSel: -1,
});

type Listener = () => void;

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
    this.state = { ...this.state, ...patch };
    if (soon) this.emitSoon();
    else this.emit();
  }

  // ---- documento ----

  /** Abre una pista (guardada, de ejemplo o importada) con la herramienta de selección. */
  open(track: Track): void {
    this.set({ track, selection: EMPTY_SELECTION, issueSel: -1, tool: "select" });
  }

  /** Empieza una pista en blanco con la herramienta de dibujo. */
  newTrack(): void {
    this.set({ track: blankTrack(), selection: EMPTY_SELECTION, issueSel: -1, tool: "draw" });
  }

  close(): void {
    this.set({ ...initial(), options: this.state.options });
  }

  /** Reemplaza la pista (y opcionalmente la selección); no hace nada si no cambia nada. */
  apply(next: Track, selection?: Selection): void {
    const { track } = this.state;
    if (!track) return;
    if (sameValue(track, next)) {
      if (selection) this.setSelection(selection);
      return;
    }
    this.set({
      track: next,
      selection: sanitizeSelection(selection ?? this.state.selection, next),
      issueSel: -1,
    });
  }

  /** Vista previa durante un arrastre: igual que `apply` pero avisa a React solo una vez por cuadro. */
  preview(next: Track): void {
    if (!this.state.track) return;
    this.set({ track: next }, true);
  }

  // ---- selección, herramienta y opciones ----

  setSelection(selection: Selection): void {
    const track = this.state.track;
    const next = track ? sanitizeSelection(selection, track) : EMPTY_SELECTION;
    if (sameSelection(next, this.state.selection)) return;
    this.set({ selection: next });
  }

  setTool(tool: Tool): void {
    if (tool === this.state.tool) return;
    this.set({ tool });
  }

  setOptions(patch: Partial<EditorOptions>): void {
    this.set({ options: { ...this.state.options, ...patch } });
  }

  selectIssue(index: number): void {
    this.set({ issueSel: index });
  }
}
