// Dibujo de la escena del Trazador de pistas (tablero, rejilla, línea, zonas, salida, incidencias).
// Función pura sobre un contexto 2D: la usan el lienzo en vivo y, más adelante, las exportaciones.
// Todos los colores salen de `themeColors()` (tokens de la consola); la transparencia se hace con
// `globalAlpha`, nunca con colores literales.
import { simPose, simStartS } from "@/domain/track/simulation";
import { splitGaps } from "@/domain/track/svg";
import type { Analysis, Track, TrackIssue, TrackRules } from "@/domain/track/types";
import { worldToScreen, type Viewport } from "@/ui/components/track/viewport";

export interface Scene {
  track: Track;
  analysis: Analysis | null;
  rules: TrackRules | null;
  /** Índice de la incidencia elegida en `analysis.issues`, o -1. */
  issueSel: number;
}

type Colors = Record<string, string>;

/** Cuadrícula: paso en cm y token de color; la más fina solo se dibuja si deja ≥ 8 px entre líneas. */
const GRID: { step: number; token: string; minPx: number }[] = [
  { step: 10, token: "--line", minPx: 8 },
  { step: 50, token: "--line2", minPx: 0 },
  { step: 100, token: "--line3", minPx: 0 },
];

function drawGrid(ctx: CanvasRenderingContext2D, vp: Viewport, W: number, H: number, c: Colors) {
  ctx.save();
  const [bx, by] = worldToScreen(vp, 0, H);
  ctx.beginPath();
  ctx.rect(bx, by, W * vp.z, H * vp.z);
  ctx.clip();
  ctx.lineWidth = 1;
  for (const g of GRID) {
    if (g.step * vp.z < g.minPx) continue;
    ctx.strokeStyle = c[g.token];
    ctx.beginPath();
    for (let x = g.step; x < W; x += g.step) {
      const [sx] = worldToScreen(vp, x, 0);
      ctx.moveTo(Math.round(sx) + 0.5, by);
      ctx.lineTo(Math.round(sx) + 0.5, by + H * vp.z);
    }
    for (let y = g.step; y < H; y += g.step) {
      const [, sy] = worldToScreen(vp, 0, y);
      ctx.moveTo(bx, Math.round(sy) + 0.5);
      ctx.lineTo(bx + W * vp.z, Math.round(sy) + 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  issue: TrackIssue,
  selected: boolean,
  c: Colors,
) {
  const r = selected ? 11 : 8;
  const tone = issue.sev === "error" ? c["--red-hi"] : c["--yellow"];
  ctx.save();
  ctx.fillStyle = c["--bg"];
  ctx.strokeStyle = tone;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (issue.sev === "error") {
    // Error: círculo con "!" (la forma distingue la gravedad además del color).
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else {
    // Aviso: triángulo.
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r * 0.8);
    ctx.lineTo(x - r, y + r * 0.8);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.font = `600 ${selected ? 13 : 11}px ${c["--mono"] || "monospace"}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", x, y + (issue.sev === "error" ? 0.5 : 2));
  if (selected) {
    ctx.strokeStyle = c["--ink"];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Dibuja la escena completa. `w` y `h` son el tamaño CSS del lienzo. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vp: Viewport,
  scene: Scene,
  c: Colors,
): void {
  const { track, analysis, rules } = scene;
  const W = track.board.widthCm;
  const H = track.board.heightCm;
  ctx.clearRect(0, 0, w, h);

  // Tablero
  const [bx, by] = worldToScreen(vp, 0, H);
  ctx.fillStyle = c["--panel"];
  ctx.fillRect(bx, by, W * vp.z, H * vp.z);
  drawGrid(ctx, vp, W, H, c);
  ctx.strokeStyle = c["--line3"];
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, W * vp.z, H * vp.z);

  // Zonas prohibidas
  for (const z of track.zones) {
    const [zx, zy] = worldToScreen(vp, z.x, z.y + z.height);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = c["--yellow"];
    ctx.fillRect(zx, zy, z.width * vp.z, z.height * vp.z);
    ctx.globalAlpha = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = c["--yellow"];
    ctx.lineWidth = 1.5;
    ctx.strokeRect(zx, zy, z.width * vp.z, z.height * vp.z);
    ctx.setLineDash([]);
    if (z.name) {
      ctx.fillStyle = c["--mid"];
      ctx.font = `11px ${c["--mono"] || "monospace"}`;
      ctx.textBaseline = "bottom";
      ctx.fillText(z.name, zx + 2, zy - 3);
    }
    ctx.restore();
  }

  // Línea (con los cortes como huecos) y brillo del acento
  if (analysis && analysis.g.pts.length > 1) {
    const g = analysis.g;
    const lw = Math.max(2, ((rules?.lineWidthMm ?? 19) / 10) * vp.z);
    const runs = splitGaps(
      g.closed ? g.pts.concat([g.pts[0]]) : g.pts,
      g.gaps,
      rules?.gapLengthCm ?? 2,
    );
    ctx.save();
    ctx.strokeStyle = c["--red"];
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    ctx.shadowColor = c["--red"];
    ctx.shadowBlur = 10;
    for (const run of runs) {
      ctx.beginPath();
      run.forEach((q, i) => {
        const [sx, sy] = worldToScreen(vp, q.x, q.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
    ctx.restore();

    // Salida: bandera sobre el tramo elegido
    const pose = simPose(g, simStartS(g, track.start));
    if (pose) {
      const [sx, sy] = worldToScreen(vp, pose.x, pose.y);
      ctx.save();
      ctx.strokeStyle = c["--ink"];
      ctx.fillStyle = c["--ink"];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - 22);
      ctx.stroke();
      ctx.fillRect(sx, sy - 22, 14, 9);
      ctx.fillStyle = c["--bg"];
      ctx.fillRect(sx, sy - 22, 7, 4.5);
      ctx.fillRect(sx + 7, sy - 17.5, 7, 4.5);
      ctx.restore();
    }
  }

  // Marcadores de incidencias (la elegida, encima)
  if (analysis) {
    analysis.issues.forEach((issue, i) => {
      if (issue.x === null || issue.y === null || i === scene.issueSel) return;
      const [sx, sy] = worldToScreen(vp, issue.x, issue.y);
      drawMarker(ctx, sx, sy, issue, false, c);
    });
    const sel = analysis.issues[scene.issueSel];
    if (sel && sel.x !== null && sel.y !== null) {
      const [sx, sy] = worldToScreen(vp, sel.x, sel.y);
      drawMarker(ctx, sx, sy, sel, true, c);
    }
  }

  // Medidas del tablero
  ctx.fillStyle = c["--mid"];
  ctx.font = `11px ${c["--mono"] || "monospace"}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${W} × ${H} cm`, bx, by + H * vp.z + 6);
}
