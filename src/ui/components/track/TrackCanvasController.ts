// Controlador del lienzo del Trazador: clase tipada que maneja el puntero, el teclado y la vista
// (zoom/desplazamiento). Se envuelve con `TrackCanvas.tsx`. Se porta por rebanadas: en S2 solo
// hay vista (desplazar, acercar, ajustar); dibujar y editar llegan en S3.
// El estado transitorio (arrastre, zoom) vive aquí, no en React; el documento llega por el `host`.
import { fit, themeColors } from "@/domain/canvas";
import { drawScene, type Scene } from "@/ui/components/track/drawScene";
import { fitViewport, panBy, zoomAt, type Viewport } from "@/ui/components/track/viewport";

/** Lo que el controlador necesita de la aplicación (se reemplaza por un doble en las pruebas). */
export interface TrackCanvasHost {
  getScene(): Scene | null;
}

export class TrackCanvasController {
  private vp: Viewport | null = null;
  private fitKey = "";
  private size = { w: 0, h: 0 };
  private cv: HTMLCanvasElement | null = null;
  private drag: { x: number; y: number } | null = null;
  private frame = 0;

  constructor(private readonly host: TrackCanvasHost) {}

  /** Vista actual (para pruebas). */
  get viewport(): Viewport | null {
    return this.vp;
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
    drawScene(surface.ctx, surface.w, surface.h, this.vp, scene, themeColors());
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

  /** Conecta los eventos al lienzo y devuelve la función que los quita. */
  attach(cv: HTMLCanvasElement): () => void {
    this.cv = cv;
    const down = (e: PointerEvent) => {
      this.drag = { x: e.clientX, y: e.clientY };
      cv.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!this.drag || !this.vp) return;
      this.vp = panBy(this.vp, e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag = { x: e.clientX, y: e.clientY };
      this.schedule();
    };
    const up = (e: PointerEvent) => {
      this.drag = null;
      if (cv.hasPointerCapture?.(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      if (!this.vp) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.vp = zoomAt(
        this.vp,
        Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)),
        e.clientX - r.left,
        e.clientY - r.top,
      );
      this.schedule();
    };
    // Los atajos solo funcionan con el lienzo enfocado: no secuestran teclas de otras vistas.
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "0") this.fit();
      else if (k === "+" || k === "=") this.zoomBy(1.25);
      else if (k === "-") this.zoomBy(0.8);
      else if (k.startsWith("arrow") && this.vp) {
        const s = e.shiftKey ? 80 : 20;
        this.vp = panBy(
          this.vp,
          k === "arrowleft" ? s : k === "arrowright" ? -s : 0,
          k === "arrowup" ? s : k === "arrowdown" ? -s : 0,
        );
        this.schedule();
      } else return;
      e.preventDefault();
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", wheel, { passive: false });
    cv.addEventListener("keydown", key);
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("wheel", wheel);
      cv.removeEventListener("keydown", key);
      cancelAnimationFrame(this.frame);
      this.cv = null;
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
