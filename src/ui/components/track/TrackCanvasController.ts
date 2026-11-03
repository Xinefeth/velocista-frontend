// Controlador del lienzo del Trazador: clase tipada que traduce el puntero y el teclado a comandos
// del dominio y maneja la vista (zoom/desplazamiento). Se envuelve con `TrackCanvas.tsx`.
// Cubre vista, dibujo, selección (puntos, tramos, zonas y grupo), movimiento con ajuste a rejilla y ángulo,
// zonas, plantillas, giro y escala del grupo, borrado, deshacer/rehacer y el menú contextual.
// El estado transitorio (arrastre, zoom, hover) vive aquí, no en React; el documento llega por `host`.
import { fit, themeColors } from "@/domain/canvas";
import type { EditorOptions, Tool } from "@/application/state/trackEditorStore";
import {
  appendPoint,
  closeTrack,
  deleteSelection,
  insertPointAt,
  moveStartTo,
  moveZoneTo,
  newZone,
  resizeZone,
} from "@/domain/track/commands";
import { build, edgesOf } from "@/domain/track/geometry";
import { fmt } from "@/domain/track/rules";
import {
  EMPTY_SELECTION,
  edgeSelection,
  groupSize,
  pointSelection,
  selectAll,
  selectionTarget,
  toggleIndex,
  type Selection,
} from "@/domain/track/selection";
import { angleSnap, snapPoint } from "@/domain/track/snap";
import { TEMPLATES, insertTemplate } from "@/domain/track/templates";
import { mirror, move, rotate, scale, type Target } from "@/domain/track/transforms";
import { DEG, type Geometry, type Track } from "@/domain/track/types";
import { drawOverlay, EMPTY_OVERLAY, type Overlay } from "@/ui/components/track/drawOverlay";
import { drawScene, type Scene } from "@/ui/components/track/drawScene";
import { groupBox, hitTest, type Hit, type HitContext } from "@/ui/components/track/hitTest";
import {
  fitViewport,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Viewport,
} from "@/ui/components/track/viewport";

/** Petición de menú contextual: dónde abrirlo y sobre qué. */
export interface MenuRequest {
  /** Posición en pantalla (coordenadas de la ventana). */
  x: number;
  y: number;
  hit: Hit;
  /** Punto del tablero bajo el puntero (cm). */
  world: [number, number];
}

/** Lo que el controlador necesita de la aplicación (se reemplaza por un doble en las pruebas). */
export interface TrackCanvasHost {
  getScene(): Scene | null;
  /** Opciones del editor: radio de los puntos nuevos, rejilla y paso de ángulo. */
  getOptions(): EditorOptions;
  /** Plantilla elegida para la herramienta de plantillas, o `null`. */
  getTemplate(): string | null;
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
  /** Alterna mostrar todos los puntos. */
  toggleNodes(): void;
  /** Alterna el ajuste a la rejilla. */
  toggleSnap(): void;
  /** Mensaje breve para el piloto. */
  notify(message: string): void;
  /** Texto de coordenadas bajo el puntero (opcional). */
  coords?(text: string): void;
  /** Abre / cierra el menú contextual (opcional). */
  openMenu?(request: MenuRequest): void;
  closeMenu?(): void;
}

interface Anchor {
  x: number;
  y: number;
}

type Drag =
  | { type: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { type: "box"; add: boolean; base: Selection; sx0: number; sy0: number }
  | {
      type: "move";
      before: Track;
      target: Target;
      wx0: number;
      wy0: number;
      /** Punto de referencia que se ajusta a la rejilla mientras se arrastra. */
      oa: Anchor;
      /** Pista de partida del arrastre si difiere de `before` (insertar y arrastrar = un solo paso). */
      base?: Track;
      /** Ya hubo un movimiento: desde entonces cada cuadro cuenta, incluso volver al origen. */
      moved?: boolean;
    }
  | { type: "start"; before: Track }
  | { type: "zmove"; before: Track; i: number; wx0: number; wy0: number; moved?: boolean }
  | { type: "zresize"; before: Track; i: number }
  | { type: "newzone"; x0: number; y0: number; cur: [number, number] }
  | {
      type: "grot" | "gscale";
      before: Track;
      target: Target;
      cx: number;
      cy: number;
      a0: number;
      d0: number;
    };

/** Redondeo a un decimal (0,1 cm). */
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

  /** Ajusta a la rejilla (Alt la desactiva). */
  private snap(x: number, y: number, alt: boolean): [number, number] {
    return snapPoint(x, y, this.host.getOptions(), alt);
  }

  /** Punto del tablero para un clic de dibujo: con Mayús, ángulo respecto al último punto. */
  private drawPoint(
    track: Track,
    p: { x: number; y: number },
    e: { shiftKey: boolean; altKey: boolean },
  ): [number, number] {
    const last = track.points[track.points.length - 1];
    if (e.shiftKey && last && !track.closed)
      return angleSnap(last, p.x, p.y, this.host.getOptions());
    return this.snap(p.x, p.y, e.altKey);
  }

  private onPointerDown = (e: PointerEvent) => {
    const scene = this.host.getScene();
    if (!scene || !this.vp || !this.cv) return;
    this.host.closeMenu?.();
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
    if (tool === "draw") this.drawDown(scene, hit, p, e);
    else if (tool === "zone") {
      if (hit.type === "z" || hit.type === "zr") this.selectDown(scene, hit, p, e);
      else {
        const [x, y] = this.snap(p.x, p.y, e.altKey);
        this.drag = { type: "newzone", x0: x, y0: y, cur: [x, y] };
      }
    } else if (tool === "tpl") this.templateDown(scene, hit, p);
    else this.selectDown(scene, hit, p, e);
  };

  /** Herramienta de dibujo: agrega puntos, cierra el circuito o edita uno existente. */
  private drawDown(
    scene: Scene,
    hit: Hit,
    p: { x: number; y: number },
    e: { shiftKey: boolean; altKey: boolean },
  ) {
    const { track } = scene;
    const radius = this.host.getOptions().radius;
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
          target: { v: [r.index], z: [] },
          wx0: p.x,
          wy0: p.y,
          oa: { x: r.track.points[r.index].x, y: r.track.points[r.index].y },
          base: r.track,
        };
      } else if (hit.type === "v") {
        this.host.setSelection(pointSelection(hit.i));
        this.startMove(track, { v: [hit.i], z: [] }, hit.i, p);
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
      this.startMove(track, { v: [hit.i], z: [] }, hit.i, p);
      return;
    }
    const [x, y] = this.drawPoint(track, p, e);
    this.host.apply(appendPoint(track, x, y, radius), pointSelection(track.points.length));
  }

  /** Plantillas: un clic sobre un tramo recto inserta la figura hacia el lado del clic. */
  private templateDown(scene: Scene, hit: Hit, p: { x: number; y: number }) {
    const { track } = scene;
    const id = this.host.getTemplate();
    if (hit.type !== "e" || !id) {
      this.host.notify("Haz clic sobre un tramo recto de la línea.");
      return;
    }
    const edge = edgesOf(track)[hit.i];
    if (!edge) return;
    const A = track.points[edge[0]];
    const B = track.points[edge[1]];
    const side = (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x) >= 0 ? 1 : -1;
    const r = insertTemplate(track, hit.i, p.x, p.y, id, side);
    if (!r) return;
    this.host.apply(r.track, {
      points: Array.from({ length: r.count }, (_, k) => r.from + k),
      edge: null,
      zones: [],
    });
    const name = TEMPLATES.find((t) => t.id === id)?.name ?? "Figura";
    this.host.notify(`${name} insertada. Arrástrala o ajústala con clic derecho.`);
  }

  /** Arranca un movimiento del objetivo; `anchorPoint` es el punto que sirve de referencia (o `null` = esquina del grupo). */
  private startMove(
    track: Track,
    target: Target,
    anchorPoint: number | null,
    p: { x: number; y: number },
  ) {
    const gb = groupBox({
      track,
      selection: { points: target.v, edge: null, zones: target.z },
      vp: this.vp!,
    });
    let oa: Anchor = { x: p.x, y: p.y };
    if (anchorPoint !== null && track.points[anchorPoint])
      oa = { x: track.points[anchorPoint].x, y: track.points[anchorPoint].y };
    else if (gb) oa = { x: gb.world.x0, y: gb.world.y0 };
    else if (target.z.length === 1 && track.zones[target.z[0]])
      oa = { x: track.zones[target.z[0]].x, y: track.zones[target.z[0]].y };
    this.drag = { type: "move", before: track, target, wx0: p.x, wy0: p.y, oa };
  }

  /** Herramienta de selección: elige puntos, tramos o zonas; arranca un movimiento, un giro, una escala o un recuadro. */
  private selectDown(
    scene: Scene,
    hit: Hit,
    p: { sx: number; sy: number; x: number; y: number },
    e: { shiftKey: boolean },
  ) {
    const { track } = scene;
    const shift = e.shiftKey;
    const sel = scene.selection ?? EMPTY_SELECTION;
    if (hit.type === "grot" || hit.type === "gscale") {
      const gb = groupBox({ track, selection: sel, vp: this.vp! });
      if (!gb) return;
      const { cx, cy } = gb.world;
      this.drag = {
        type: hit.type,
        before: track,
        target: selectionTarget(sel),
        cx,
        cy,
        a0: Math.atan2(p.y - cy, p.x - cx),
        d0: Math.max(1e-6, Math.hypot(p.x - cx, p.y - cy)),
      };
      return;
    }
    if (hit.type === "gin") {
      this.startMove(track, selectionTarget(sel), null, p);
      return;
    }
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
      if (next.points.includes(i)) {
        const target =
          groupSize(next) >= 2 ? selectionTarget(next) : { v: [...next.points], z: [] };
        this.startMove(track, target, i, p);
      }
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
        !(sel.points.includes(edge[0]) && sel.points.includes(edge[1]) && groupSize(sel) > 2)
      ) {
        next = edgeSelection(track, hit.i);
      }
      this.host.setSelection(next);
      this.startMove(track, selectionTarget(next), edge[0], p);
      return;
    }
    if (hit.type === "z" || hit.type === "zr") {
      if (shift && hit.type === "z") {
        this.host.setSelection({
          points: sel.points,
          edge: null,
          zones: toggleIndex(sel.zones, hit.i),
        });
        return;
      }
      if (hit.type === "z" && sel.zones.includes(hit.i) && groupSize(sel) >= 2) {
        this.startMove(track, selectionTarget(sel), null, p);
        return;
      }
      this.host.setSelection({ points: [], edge: null, zones: [hit.i] });
      this.drag =
        hit.type === "zr"
          ? { type: "zresize", before: track, i: hit.i }
          : { type: "zmove", before: track, i: hit.i, wx0: p.x, wy0: p.y };
      return;
    }
    // Zona vacía: se limpia la selección (salvo con Mayús) y empieza un recuadro.
    if (!shift) this.host.setSelection(EMPTY_SELECTION);
    this.drag = {
      type: "box",
      add: shift,
      base: shift ? sel : EMPTY_SELECTION,
      sx0: p.sx,
      sy0: p.sy,
    };
    this.overlay = { ...this.overlay, box: { x0: p.sx, y0: p.sy, x1: p.sx, y1: p.sy } };
    this.schedule();
  }

  private cursorFor(tool: Tool, hit: Hit): string {
    if (this.spaceDown) return "grab";
    if (tool === "draw") return hit.type === "v" ? "move" : "crosshair";
    if (tool === "zone") return hit.type === "z" || hit.type === "zr" ? "move" : "crosshair";
    if (tool === "tpl") return hit.type === "e" ? "copy" : "not-allowed";
    switch (hit.type) {
      case "start":
        return "ew-resize";
      case "grot":
        return "grab";
      case "gscale":
      case "zr":
        return "nwse-resize";
      case "v":
      case "z":
      case "gin":
        return "move";
      case "e":
      case "arc":
        return "pointer";
      default:
        return "default";
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    const scene = this.host.getScene();
    if (!scene || !this.vp || !this.cv) return;
    const p = this.pointer(e);
    const d = this.drag;
    const opts = this.host.getOptions();
    if (!d) {
      const hit = hitTest(p.sx, p.sy, this.hitContext(scene));
      const tool = scene.tool ?? "select";
      const [gx, gy] = tool === "draw" ? this.drawPoint(scene.track, p, e) : [0, 0];
      this.overlay = {
        ...this.overlay,
        hover: hit,
        ghost: tool === "draw" ? { x: r1(gx), y: r1(gy) } : null,
      };
      this.cv.style.cursor = this.cursorFor(tool, hit);
      const [cx, cy] = tool === "draw" ? [gx, gy] : this.snap(p.x, p.y, e.altKey);
      this.host.coords?.(`x ${fmt(r1(cx))} · y ${fmt(r1(cy))} cm`);
      this.schedule();
      return;
    }
    if (d.type === "pan") {
      this.vp = { ...this.vp, vx: d.vx + (p.sx - d.sx), vy: d.vy + (p.sy - d.sy) };
    } else if (d.type === "box") {
      this.overlay = { ...this.overlay, box: { x0: d.sx0, y0: d.sy0, x1: p.sx, y1: p.sy } };
    } else if (d.type === "move") {
      let tx = d.oa.x + (p.x - d.wx0);
      let ty = d.oa.y + (p.y - d.wy0);
      [tx, ty] = this.snap(tx, ty, e.altKey);
      const dx = tx - d.oa.x;
      const dy = ty - d.oa.y;
      if (!d.moved && Math.hypot(dx, dy) < 1e-9) return;
      d.moved = true;
      this.host.preview(move(d.base ?? d.before, d.target, dx, dy));
      this.host.coords?.(`Δ ${fmt(dx)}, ${fmt(dy)} cm`);
    } else if (d.type === "start") {
      this.host.preview(moveStartTo(d.before, p.x, p.y));
    } else if (d.type === "zmove") {
      const o = d.before.zones[d.i];
      const [nx, ny] = this.snap(o.x + (p.x - d.wx0), o.y + (p.y - d.wy0), e.altKey);
      d.moved = true;
      this.host.preview(moveZoneTo(d.before, d.i, nx, ny));
    } else if (d.type === "zresize") {
      const [cx, cy] = this.snap(p.x, p.y, e.altKey);
      this.host.preview(resizeZone(d.before, d.i, cx, cy));
    } else if (d.type === "newzone") {
      d.cur = this.snap(p.x, p.y, e.altKey);
      this.overlay = {
        ...this.overlay,
        newZone: { x0: d.x0, y0: d.y0, x1: d.cur[0], y1: d.cur[1] },
      };
    } else if (d.type === "grot") {
      let ang = (Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0) / DEG;
      ang = ((ang + 540) % 360) - 180;
      if (!e.altKey) {
        const st = opts.angStep > 0 ? opts.angStep : 15;
        ang = Math.round(ang / st) * st;
      }
      this.host.preview(rotate(d.before, d.target, ang));
      this.host.coords?.(`giro ${fmt(ang)}°`);
    } else if (d.type === "gscale") {
      let f = Math.hypot(p.x - d.cx, p.y - d.cy) / d.d0;
      if (!e.altKey) f = Math.round(f * 20) / 20;
      f = Math.max(0.1, Math.min(10, f));
      this.host.preview(scale(d.before, d.target, f));
      this.host.coords?.(`escala ${Math.round(f * 100)} %`);
    }
    this.schedule();
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (this.cv?.hasPointerCapture?.(e.pointerId)) this.cv.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (
      d.type === "move" ||
      d.type === "start" ||
      d.type === "zmove" ||
      d.type === "zresize" ||
      d.type === "grot" ||
      d.type === "gscale"
    )
      this.host.commit(d.before);
    if (d.type === "box" && this.vp) {
      const scene = this.host.getScene();
      const box = this.overlay.box;
      this.overlay = { ...this.overlay, box: null };
      if (scene && box && (Math.abs(box.x1 - box.x0) > 3 || Math.abs(box.y1 - box.y0) > 3)) {
        const x0 = Math.min(box.x0, box.x1);
        const x1 = Math.max(box.x0, box.x1);
        const y0 = Math.min(box.y0, box.y1);
        const y1 = Math.max(box.y0, box.y1);
        const points = scene.track.points.flatMap((pt, i) => {
          const [x, y] = worldToScreen(this.vp!, pt.x, pt.y);
          return x >= x0 && x <= x1 && y >= y0 && y <= y1 ? [i] : [];
        });
        // Una zona se elige si queda ENTERA dentro del recuadro.
        const zones = scene.track.zones.flatMap((z, i) => {
          const [a, b] = worldToScreen(this.vp!, z.x, z.y + z.height);
          const [c, f] = worldToScreen(this.vp!, z.x + z.width, z.y);
          return a >= x0 && c <= x1 && b >= y0 && f <= y1 ? [i] : [];
        });
        this.host.setSelection({
          points: [...new Set([...(d.add ? d.base.points : []), ...points])],
          edge: null,
          zones: [...new Set([...(d.add ? d.base.zones : []), ...zones])],
        });
      }
    } else if (d.type === "newzone") {
      const scene = this.host.getScene();
      this.overlay = { ...this.overlay, newZone: null };
      if (scene) {
        const next = newZone(scene.track, d.x0, d.y0, d.cur[0], d.cur[1]);
        if (next) this.host.apply(next, { points: [], edge: null, zones: [next.zones.length - 1] });
        else if (scene.track.zones.length >= 100) this.host.notify("Máximo 100 zonas por pista.");
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
    const r = insertPointAt(scene.track, hit.i, p.x, p.y, this.host.getOptions().radius);
    if (r) this.host.apply(r.track, pointSelection(r.index));
  };

  /** Clic derecho: elige lo que hay bajo el puntero y pide abrir el menú contextual. */
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const scene = this.host.getScene();
    if (!scene || !this.vp || !this.host.openMenu) return;
    const p = this.pointer(e);
    const hit = hitTest(p.sx, p.sy, this.hitContext(scene), true);
    const sel = scene.selection ?? EMPTY_SELECTION;
    if (hit.type === "v" || hit.type === "arc") {
      if (!sel.points.includes(hit.i)) this.host.setSelection(pointSelection(hit.i));
    } else if (hit.type === "e") {
      this.host.setSelection(edgeSelection(scene.track, hit.i));
    } else if (hit.type === "z" || hit.type === "zr") {
      if (!sel.zones.includes(hit.i))
        this.host.setSelection({ points: [], edge: null, zones: [hit.i] });
    }
    this.host.openMenu({ x: e.clientX + 2, y: e.clientY + 2, hit, world: [p.x, p.y] });
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.vp || !this.cv) return;
    e.preventDefault();
    this.host.closeMenu?.();
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
    const opts = this.host.getOptions();
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
    else if (k === "z") this.host.setTool("zone");
    else if (k === "enter" && scene.tool === "draw") this.host.setTool("select");
    else if (k === "escape") {
      this.host.closeMenu?.();
      if ((scene.tool ?? "select") !== "select") this.host.setTool("select");
      else this.host.setSelection(EMPTY_SELECTION);
    } else if (k === "delete" || k === "backspace") {
      if (groupSize(sel)) this.host.apply(deleteSelection(scene.track, sel), EMPTY_SELECTION);
      else handled = false;
    } else if (k === "r" || k === "m") {
      if (groupSize(sel) < 2)
        this.host.notify(
          k === "r"
            ? "Selecciona varios objetos para girar (Ctrl+A = todo)."
            : "Selecciona varios objetos para reflejar (Ctrl+A = todo).",
        );
      else if (k === "r") {
        const st = opts.angStep > 0 ? opts.angStep : 15;
        this.host.apply(rotate(scene.track, selectionTarget(sel), e.shiftKey ? -st : st));
      } else this.host.apply(mirror(scene.track, selectionTarget(sel), e.shiftKey ? "v" : "h"));
    } else if (k === "0") this.fit();
    else if (k === "+" || k === "=") this.zoomBy(1.25);
    else if (k === "-") this.zoomBy(0.8);
    else if (k === "n") this.host.toggleNodes();
    else if (k === "g") this.host.toggleSnap();
    else if (k.startsWith("arrow")) {
      const step = (opts.snap ? opts.step : 1) * (e.shiftKey ? 10 : 1);
      const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
      const dy = k === "arrowdown" ? -step : k === "arrowup" ? step : 0;
      if (groupSize(sel)) this.host.apply(move(scene.track, selectionTarget(sel), dx, dy));
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
    cv.addEventListener("pointerdown", this.onPointerDown);
    cv.addEventListener("pointermove", this.onPointerMove);
    cv.addEventListener("pointerup", this.onPointerUp);
    cv.addEventListener("pointercancel", this.onPointerUp);
    cv.addEventListener("pointerleave", this.onLeave);
    cv.addEventListener("dblclick", this.onDoubleClick);
    cv.addEventListener("contextmenu", this.onContextMenu);
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
      cv.removeEventListener("contextmenu", this.onContextMenu);
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
