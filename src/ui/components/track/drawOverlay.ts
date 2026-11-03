// Capa de edición sobre la escena: puntos de control, tramo y zonas seleccionados, recuadro del grupo,
// vista previa del próximo punto y rectángulos de arrastre. Solo usa tokens de la consola
// (`themeColors()`); la transparencia se hace con `globalAlpha`.
import type { Geometry } from "@/domain/track/types";
import { groupBox, visibleNodes, type Hit } from "@/ui/components/track/hitTest";
import type { Scene } from "@/ui/components/track/drawScene";
import { worldToScreen, type Viewport } from "@/ui/components/track/viewport";

type Colors = Record<string, string>;

/** Rectángulo en pantalla (píxeles). */
export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Estado transitorio del puntero que solo existe mientras se interactúa. */
export interface Overlay {
  hover: Hit | null;
  /** Dónde caería el próximo punto al dibujar (ya ajustado), en el tablero. */
  ghost: { x: number; y: number } | null;
  /** Rectángulo de selección por arrastre, en pantalla. */
  box: ScreenBox | null;
  /** Zona que se está dibujando, en el tablero. */
  newZone: { x0: number; y0: number; x1: number; y1: number } | null;
}

export const EMPTY_OVERLAY: Overlay = { hover: null, ghost: null, box: null, newZone: null };

function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  selected: boolean,
  hovered: boolean,
  c: Colors,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, selected ? 6 : 4.5, 0, Math.PI * 2);
  ctx.fillStyle = selected ? c["--red"] : c["--bg"];
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = c["--ink"];
  ctx.stroke();
  if (hovered) {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = c["--mid"];
    ctx.stroke();
  }
  ctx.restore();
}

/** Dibuja la capa de edición de `scene` (si no hay selección ni herramienta, no dibuja nada). */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  g: Geometry | null,
  scene: Scene,
  overlay: Overlay,
  c: Colors,
): void {
  const { track } = scene;
  const selection = scene.selection;
  const tool = scene.tool ?? "select";
  if (!selection) return;

  // Tramo elegido
  if (selection.edge !== null && g) {
    const st = g.straights.find((s) => s.e === selection.edge);
    if (st) {
      const [ax, ay] = worldToScreen(vp, st.a.x, st.a.y);
      const [bx, by] = worldToScreen(vp, st.b.x, st.b.y);
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = c["--yellow"];
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Zonas elegidas (con asa de redimensionado si es una sola)
  for (const i of selection.zones) {
    const z = track.zones[i];
    if (!z) continue;
    const [zx, zy] = worldToScreen(vp, z.x, z.y + z.height);
    ctx.save();
    ctx.strokeStyle = c["--ink"];
    ctx.lineWidth = 2;
    ctx.strokeRect(zx, zy, z.width * vp.z, z.height * vp.z);
    if (selection.zones.length === 1 && selection.points.length === 0) {
      const [hx, hy] = worldToScreen(vp, z.x + z.width, z.y);
      ctx.fillStyle = c["--ink"];
      ctx.fillRect(hx - 4, hy - 4, 8, 8);
    }
    ctx.restore();
  }

  // Puntos de control
  const issueRef = scene.analysis?.issues[scene.issueSel]?.ref;
  const nodeCtx = {
    track,
    selection,
    tool,
    showNodes: !!scene.showNodes,
    hover: overlay.hover,
    issueVertex: issueRef && issueRef.v !== undefined ? issueRef.v : null,
  };
  const shown = visibleNodes(nodeCtx);
  const hoveredIndex = overlay.hover && overlay.hover.type === "v" ? overlay.hover.i : -1;
  track.points.forEach((p, i) => {
    if (!shown.has(i)) return;
    const [x, y] = worldToScreen(vp, p.x, p.y);
    drawNode(ctx, x, y, selection.points.includes(i), i === hoveredIndex, c);
  });

  // Recuadro del grupo con asas de giro y escala
  if (tool === "select") {
    const gb = groupBox({ track, selection, vp });
    if (gb && !overlay.box) {
      ctx.save();
      ctx.strokeStyle = c["--blue"];
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(gb.x0, gb.y0, gb.x1 - gb.x0, gb.y1 - gb.y0);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(gb.rx, gb.y0);
      ctx.lineTo(gb.rx, gb.ry);
      ctx.stroke();
      ctx.fillStyle = c["--bg"];
      ctx.beginPath();
      ctx.arc(gb.rx, gb.ry, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const [cx, cy] of gb.corners) {
        ctx.fillStyle = c["--bg"];
        ctx.fillRect(cx - 5, cy - 5, 10, 10);
        ctx.strokeRect(cx - 5, cy - 5, 10, 10);
      }
      ctx.restore();
    }
  }

  // Vista previa del próximo punto al dibujar
  if (tool === "draw" && overlay.ghost) {
    const [gx, gy] = worldToScreen(vp, overlay.ghost.x, overlay.ghost.y);
    ctx.save();
    const last = track.points[track.points.length - 1];
    if (last && !track.closed) {
      const [lx, ly] = worldToScreen(vp, last.x, last.y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = c["--mid"];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = c["--red-hi"];
    ctx.beginPath();
    ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Rectángulo de selección por arrastre
  if (overlay.box) {
    const b = overlay.box;
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = c["--blue"];
    ctx.fillRect(
      Math.min(b.x0, b.x1),
      Math.min(b.y0, b.y1),
      Math.abs(b.x1 - b.x0),
      Math.abs(b.y1 - b.y0),
    );
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c["--blue"];
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(
      Math.min(b.x0, b.x1),
      Math.min(b.y0, b.y1),
      Math.abs(b.x1 - b.x0),
      Math.abs(b.y1 - b.y0),
    );
    ctx.restore();
  }

  // Zona que se está dibujando
  if (overlay.newZone) {
    const z = overlay.newZone;
    const [ax, ay] = worldToScreen(vp, Math.min(z.x0, z.x1), Math.max(z.y0, z.y1));
    const [bx, by] = worldToScreen(vp, Math.max(z.x0, z.x1), Math.min(z.y0, z.y1));
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = c["--yellow"];
    ctx.fillRect(ax, ay, bx - ax, by - ay);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c["--yellow"];
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(ax, ay, bx - ax, by - ay);
    ctx.restore();
  }
}
