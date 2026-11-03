// Controlador del lienzo del Trazador: clase tipada que traduce el puntero y el teclado a comandos
// del dominio y maneja la vista (zoom/desplazamiento). Se envuelve con `TrackCanvas.tsx`.
// Se porta por rebanadas: en este punto hay vista, dibujo, selección, movimiento, insertar y borrar;
// el historial, las zonas, las plantillas y las transformaciones llegan en los siguientes puntos.
// El estado transitorio (arrastre, zoom, hover) vive aquí, no en React; el documento llega por `host`.
import { fit, themeColors } from "@/domain/canvas";
import type { Tool } from "@/application/state/trackEditorStore";
import {
  appendPoint,
  closeTrack,
  deletePoints,
  insertPointAt,
  moveStartTo,
} from "@/domain/track/commands";
import { build, edgesOf } from "@/domain/track/geometry";
import { fmt } from "@/domain/track/rules";
import {
  EMPTY_SELECTION,
  edgeSelection,
  pointSelection,
  selectAll,
  selectionTarget,
  toggleIndex,
  type Selection,
} from "@/domain/track/selection";
import { move } from "@/domain/track/transforms";
import type { Geometry, Track } from "@/domain/track/types";
import { drawOverlay, EMPTY_OVERLAY, type Overlay } from "@/ui/components/track/drawOverlay";
import { drawScene, type Scene } from "@/ui/components/track/drawScene";
import { hitTest, type Hit, type HitContext } from "@/ui/components/track/hitTest";
import {
  fitViewport,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Viewport,
} from "@/ui/components/track/viewport";

/** Lo que el controlador necesita de la aplicación (se reemplaza por un doble en las pruebas). */
export interface TrackCanvasHost {
  getScene(): Scene | null;
  /** Radio con el que nace cada punto nuevo, en cm. */
  getRadius(): number;
  /** Cambio durante un arrastre: React se entera una vez por cuadro. */
  preview(track: Track): void;
  /** Cambio terminado (un paso de historial), con la selección que debe quedar. */
  apply(track: Track, selection?: Selection): void;
  /** Cierra un arrastre: `before` es la pista al empezar el gesto; todo el gesto es un solo paso de historial. */
  commit(before: Track): void;
  undo(): void;
  redo(): void;
  /** Guardar en la API (Ctrl+S); opcional. */
  save?(): void;
  setSelection(selection: Selection): void;
  setTool(tool: Tool): void;
  toggleNodes(): void;
  /** Mensaje breve para el piloto. */
  notify(message: string): void;
  /** Texto de coordenadas bajo el puntero (opcional). */
  coords?(text: string): void;
}

type Drag =
  | { type: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { type: "box"; add: boolean; base: number[]; sx0: number; sy0: number }
  | {
      type: "move";
      before: Track;
      idxs: number[];
      wx0: number;
      wy0: number;
      base?: Track;
      /** Ya hubo un movimiento: desde entonces cada cuadro cuenta, incluso volver al origen. */
      moved?: boolean;
    }
  | { type: "start"; before: Track };

/** Redondeo a un decimal (0,1 cm), como el prototipo sin ajuste. */
const r1 = (v: number) => Math.round(v * 10) / 10;

const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return /^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable;
};

export class TrackCanvasController {
  private vp: Viewport | null = null;
  private fitKey = "";
  private size = { w: 0, h: 0 };
  private cv: HTMLCanvasElement | null = null;
  private drag: Drag | null = null;
  private overlay: Overlay = EMPTY_OVERLAY;
  private spaceDown = false;
  private frame = 0;
  private geometries = new WeakMap<Track, Geometry>();

  constructor(private readonly host: TrackCanvasHost) {}

  /** Vista actual (para pruebas). */
  get viewport(): Viewport | null {
    return this.vp;
  }

  /** Geometría de una pista, con caché por objeto: así el arrastre no recalcula en cada consulta. */
  private geometryOf(track: Track): Geometry {
    let g = this.geometries.get(track);
    if (!g) {
      g = build(track);
      this.geometries.set(track, g);
    }
    return g;
  }

  /** Dibuja la escena; reencuadra la primera vez y cuando cambia la pista abierta o su tablero. */
  render(cv: HTMLCanvasElement): void {
    this.cv = cv;
    const surface = fit(cv);
    if (!surface) return;
    this.size = { w: surface.w, h: surface.h };
    const scene = this.host.getScene();
    if (!scene) {
      // Sin pista abierta (p. ej. se borró): se limpia el lienzo para no dejar el dibujo anterior.
      surface.ctx.clearRect(0, 0, surface.w, surface.h);
      this.vp = null;
      this.fitKey = "";
      return;
    }
    const key = `${scene.track.id ?? "nueva"}:${scene.track.board.widthCm}x${scene.track.board.heightCm}`;
    if (!this.vp || key !== this.fitKey) {
      this.vp = fitViewport(scene.track.board, surface.w, surface.h);
      this.fitKey = key;
    }
    // La línea se dibuja con la geometría viva (la verificación de React puede ir un cuadro atrás).
    const g = this.geometryOf(scene.track);
    const live: Scene = scene.analysis ? { ...scene, analysis: { ...scene.analysis, g } } : scene;
    const colors = themeColors();
    drawScene(surface.ctx, surface.w, surface.h, this.vp, live, colors);
    drawOverlay(surface.ctx, this.vp, g, live, this.overlay, colors);
  }

  /** Reencuadra todo el tablero. */
  fit(): void {
    const scene = this.host.getScene();
    if (!scene || !this.size.w) return;
    this.vp = fitViewport(scene.track.board, this.size.w, this.size.h);
    this.schedule();
  }

  /** Acerca (f > 1) o aleja (f < 1) respecto al centro del lienzo. */
  zoomBy(f: number): void {
    if (!this.vp) return;
    this.vp = zoomAt(this.vp, f, this.size.w / 2, this.size.h / 2);
    this.schedule();
  }

  // ---------------------------------------------------------------- puntero

  private pointer(e: { clientX: number; clientY: number }) {
    const r = this.cv!.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const [x, y] = screenToWorld(this.vp!, sx, sy);
    return { sx, sy, x, y };
  }

  private hitContext(scene: Scene): HitContext {
    const issueRef = scene.analysis?.issues[scene.issueSel]?.ref;
    return {
      track: scene.track,
      geometry: this.geometryOf(scene.track),
      vp: this.vp!,
      selection: scene.selection ?? EMPTY_SELECTION,
      tool: scene.tool ?? "select",
      showNodes: !!scene.showNodes,
      hover: this.overlay.hover,
      issueVertex: issueRef && issueRef.v !== undefined ? issueRef.v : null,
    };
  }

  private onPointerDown = (e: PointerEvent) => {
    const scene = this.host.getScene();
    if (!scene || !this.vp || !this.cv) return;
    const p = this.pointer(e);
    const hit = hitTest(p.sx, p.sy, this.hitContext(scene), true);
    this.cv.focus?.({ preventScroll: true });
    this.cv.setPointerCapture?.(e.pointerId);
    const tool = scene.tool ?? "select";
    if (
      e.button === 1 ||
      (e.button === 0 && this.spaceDown) ||
      (e.pointerType === "touch" && hit.type === "none" && tool === "select")
    ) {
      this.drag = { type: "pan", sx: p.sx, sy: p.sy, vx: this.vp.vx, vy: this.vp.vy };
      return;
    }
    if (e.button !== 0) return;
    if (tool === "draw") this.drawDown(scene, hit, p);
    else this.selectDown(scene, hit, p, e.shiftKey);
  };

  /** Herramienta de dibujo: agrega puntos, cierra el circuito o edita uno existente. */
  private drawDown(scene: Scene, hit: Hit, p: { x: number; y: number }) {
    const { track } = scene;
    const radius = this.host.getRadius();
    if (track.closed) {
      if (hit.type === "e") {
        const r = insertPointAt(track, hit.i, p.x, p.y, radius);
        if (!r) return;
        // Insertar y arrastrar el punto nuevo es un solo gesto: un único paso de historial al soltar.
        this.host.preview(r.track);
        this.host.setSelection(pointSelection(r.index));
        this.drag = {
          type: "move",
          before: track,
          idxs: [r.index],
          wx0: p.x,
          wy0: p.y,
          base: r.track,
        };
      } else if (hit.type === "v") {
        this.host.setSelection(pointSelection(hit.i));
        this.drag = { type: "move", before: track, idxs: [hit.i], wx0: p.x, wy0: p.y };
      } else {
        this.host.notify(
          "El circuito ya está cerrado. Haz clic sobre la línea para agregar un punto.",
        );
      }
      return;
    }
    if (hit.type === "v" && hit.i === 0 && track.points.length >= 3) {
      const closed = closeTrack(track);
      if (closed) this.host.apply(closed, EMPTY_SELECTION);
      this.host.notify("Circuito cerrado.");
      this.host.setTool("select");
      return;
    }
    if (hit.type === "v") {
      this.host.setSelection(pointSelection(hit.i));
      this.drag = { type: "move", before: track, idxs: [hit.i], wx0: p.x, wy0: p.y };
      return;
    }
    this.host.apply(appendPoint(track, p.x, p.y, radius), pointSelection(track.points.length));
  }

  /** Herramienta de selección: elige puntos o tramos, arranca un movimiento o un recuadro. */
  private selectDown(
    scene: Scene,
    hit: Hit,
    p: { sx: number; sy: number; x: number; y: number },
    shift: boolean,
  ) {
    const { track } = scene;
    const sel = scene.selection ?? EMPTY_SELECTION;
    if (hit.type === "start") {
      this.drag = { type: "start", before: track };
      return;
    }
    if (hit.type === "v" || hit.type === "arc") {
      const i = hit.i;
      let next = sel;
      if (shift) next = { points: toggleIndex(sel.points, i), edge: null, zones: sel.zones };
      else if (!sel.points.includes(i)) next = pointSelection(i);
      this.host.setSelection(next);
      if (next.points.includes(i))
        this.drag = { type: "move", before: track, idxs: [...next.points], wx0: p.x, wy0: p.y };
      return;
    }
    if (hit.type === "e") {
      const edge = edgesOf(track)[hit.i];
      if (!edge) return;
      let next = sel;
      if (shift) {
        next = {
          points: [...new Set([...sel.points, edge[0], edge[1]])],
          edge: null,
          zones: sel.zones,
        };
      } else if (
        !(sel.points.includes(edge[0]) && sel.points.includes(edge[1]) && sel.points.length > 2)
      ) {
        next = edgeSelection(track, hit.i);
      }
      this.host.setSelection(next);
      this.drag = { type: "move", before: track, idxs: [...next.points], wx0: p.x, wy0: p.y };
      return;
    }
    // Zona vacía: se limpia la selección (salvo con Mayús) y empieza un recuadro.
    if (!shift) this.host.setSelection(EMPTY_SELECTION);
    this.drag = {
      type: "box",
      add: shift,
      base: shift ? [...sel.points] : [],
      sx0: p.sx,
      sy0: p.sy,
    };
    this.overlay = { ...this.overlay, box: { x0: p.sx, y0: p.sy, x1: p.sx, y1: p.sy } };
    this.schedule();
  }

  private onPointerMove = (e: PointerEvent) => {
    const scene = this.host.getScene();
    if (!scene || !this.vp || !this.cv) return;
    const p = this.pointer(e);
    const d = this.drag;
    if (!d) {
      const hit = hitTest(p.sx, p.sy, this.hitContext(scene));
      const tool = scene.tool ?? "select";
      this.overlay = {
        ...this.overlay,
        hover: hit,
        ghost: tool === "draw" ? { x: r1(p.x), y: r1(p.y) } : null,
      };
      this.cv.style.cursor = this.spaceDown
        ? "grab"
        : tool === "draw"
          ? hit.type === "v"
            ? "move"
            : "crosshair"
          : hit.type === "start"
            ? "ew-resize"
            : hit.type === "v"
              ? "move"
              : hit.type === "e" || hit.type === "arc"
                ? "pointer"
                : "default";
      this.host.coords?.(`x ${fmt(r1(p.x))} · y ${fmt(r1(p.y))} cm`);
      this.schedule();
      return;
    }
    if (d.type === "pan") {
      this.vp = { ...this.vp, vx: d.vx + (p.sx - d.sx), vy: d.vy + (p.sy - d.sy) };
      this.schedule();
    } else if (d.type === "box") {
      this.overlay = { ...this.overlay, box: { x0: d.sx0, y0: d.sy0, x1: p.sx, y1: p.sy } };
      this.schedule();
    } else if (d.type === "move") {
      const dx = p.x - d.wx0;
      const dy = p.y - d.wy0;
      if (!d.moved && Math.hypot(dx, dy) < 1e-9) return;
      d.moved = true;
      this.host.preview(move(d.base ?? d.before, { v: d.idxs, z: [] }, dx, dy));
      this.host.coords?.(`Δ ${fmt(dx)}, ${fmt(dy)} cm`);
      this.schedule();
    } else if (d.type === "start") {
      this.host.preview(moveStartTo(d.before, p.x, p.y));
      this.schedule();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (this.cv?.hasPointerCapture?.(e.pointerId)) this.cv.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.type === "move" || d.type === "start") this.host.commit(d.before);
    if (d.type === "box" && this.vp) {
      const scene = this.host.getScene();
      const box = this.overlay.box;
      this.overlay = { ...this.overlay, box: null };
      if (scene && box && (Math.abs(box.x1 - box.x0) > 3 || Math.abs(box.y1 - box.y0) > 3)) {
        const x0 = Math.min(box.x0, box.x1);
        const x1 = Math.max(box.x0, box.x1);
        const y0 = Math.min(box.y0, box.y1);
        const y1 = Math.max(box.y0, box.y1);
        const inside = scene.track.points.flatMap((pt, i) => {
          const [x, y] = worldToScreen(this.vp!, pt.x, pt.y);
          return x >= x0 && x <= x1 && y >= y0 && y <= y1 ? [i] : [];
        });
        this.host.setSelection({
          points: [...new Set([...(d.add ? d.base : []), ...inside])],
          edge: null,
          zones: [],
        });
      }
    }
    this.schedule();
  };

  private onLeave = () => {
    if (this.drag) return;
    this.overlay = { ...this.overlay, hover: null, ghost: null };
    this.host.coords?.("");
    this.schedule();
  };

  /** Doble clic sobre un tramo (herramienta de selección): inserta un punto ahí. */
  private onDoubleClick = (e: MouseEvent) => {
    const scene = this.host.getScene();
    if (!scene || !this.vp || (scene.tool ?? "select") !== "select") return;
    const p = this.pointer(e);
    const hit = hitTest(p.sx, p.sy, this.hitContext(scene));
    if (hit.type !== "e") return;
    const r = insertPointAt(scene.track, hit.i, p.x, p.y, this.host.getRadius());
    if (r) this.host.apply(r.track, pointSelection(r.index));
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.vp || !this.cv) return;
    e.preventDefault();
    const r = this.cv.getBoundingClientRect();
    this.vp = zoomAt(
      this.vp,
      Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)),
      e.clientX - r.left,
      e.clientY - r.top,
    );
    this.schedule();
  };

  // ---------------------------------------------------------------- teclado

  /**
   * Atajos: solo mientras el lienzo está montado y con el foco fuera de los campos de texto.
   * Se escuchan en el documento porque el piloto suele tener el foco en un botón del panel.
   */
  private onKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === " ") {
      this.spaceDown = true;
      if (e.target === document.body || e.target === this.cv) e.preventDefault();
      return;
    }
    const scene = this.host.getScene();
    if (!scene) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const sel = scene.selection ?? EMPTY_SELECTION;
    if (mod && k === "a") {
      e.preventDefault();
      this.host.setSelection(selectAll(scene.track));
      return;
    }
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) this.host.redo();
      else this.host.undo();
      return;
    }
    if (mod && k === "y") {
      e.preventDefault();
      this.host.redo();
      return;
    }
    if (mod && k === "s") {
      e.preventDefault();
      this.host.save?.();
      return;
    }
    if (mod || e.altKey) return;
    let handled = true;
    if (k === "v") this.host.setTool("select");
    else if (k === "p" || k === "d") this.host.setTool("draw");
    else if (k === "enter" && scene.tool === "draw") this.host.setTool("select");
    else if (k === "escape") {
      if ((scene.tool ?? "select") !== "select") this.host.setTool("select");
      else this.host.setSelection(EMPTY_SELECTION);
    } else if (k === "delete" || k === "backspace") {
      if (sel.points.length)
        this.host.apply(deletePoints(scene.track, sel.points), EMPTY_SELECTION);
      else handled = false;
    } else if (k === "0") this.fit();
    else if (k === "+" || k === "=") this.zoomBy(1.25);
    else if (k === "-") this.zoomBy(0.8);
    else if (k === "n") this.host.toggleNodes();
    else if (k.startsWith("arrow")) {
      const step = e.shiftKey ? 10 : 1;
      const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
      const dy = k === "arrowdown" ? -step : k === "arrowup" ? step : 0;
      if (sel.points.length) this.host.apply(move(scene.track, selectionTarget(sel), dx, dy));
      else if (this.vp) {
        const s = e.shiftKey ? 80 : 20;
        this.vp = panBy(this.vp, (-dx * s) / step, (dy * s) / step);
        this.schedule();
      }
    } else handled = false;
    if (handled) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") this.spaceDown = false;
  };

  // ---------------------------------------------------------------- ciclo de vida

  /** Conecta los eventos y devuelve la función que los quita. */
  attach(cv: HTMLCanvasElement): () => void {
    this.cv = cv;
    const prevent = (e: Event) => e.preventDefault();
    cv.addEventListener("pointerdown", this.onPointerDown);
    cv.addEventListener("pointermove", this.onPointerMove);
    cv.addEventListener("pointerup", this.onPointerUp);
    cv.addEventListener("pointercancel", this.onPointerUp);
    cv.addEventListener("pointerleave", this.onLeave);
    cv.addEventListener("dblclick", this.onDoubleClick);
    cv.addEventListener("contextmenu", prevent);
    cv.addEventListener("wheel", this.onWheel, { passive: false });
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    return () => {
      cv.removeEventListener("pointerdown", this.onPointerDown);
      cv.removeEventListener("pointermove", this.onPointerMove);
      cv.removeEventListener("pointerup", this.onPointerUp);
      cv.removeEventListener("pointercancel", this.onPointerUp);
      cv.removeEventListener("pointerleave", this.onLeave);
      cv.removeEventListener("dblclick", this.onDoubleClick);
      cv.removeEventListener("contextmenu", prevent);
      cv.removeEventListener("wheel", this.onWheel);
      document.removeEventListener("keydown", this.onKeyDown);
      document.removeEventListener("keyup", this.onKeyUp);
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.cv = null;
      this.drag = null;
    };
  }

  /** Redibuja en el próximo cuadro (sin renders de React por cada movimiento del ratón). */
  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.cv) this.render(this.cv);
    });
  }
}
