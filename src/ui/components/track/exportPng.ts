// Exportación PNG del plano: la escena del lienzo (con cotas si están activas) más el título y una línea
// de resumen, dibujada en un lienzo fuera de pantalla. Usa la paleta oscura de la consola (decisión del
// spec, pregunta abierta 15): no define colores propios; todo sale de `themeColors()`.
import { themeColors } from "@/domain/canvas";
import { fmt } from "@/domain/track/rules";
import type { Analysis, Track, TrackRules } from "@/domain/track/types";
import { drawScene } from "@/ui/components/track/drawScene";

export interface PlanPng {
  track: Track;
  analysis: Analysis;
  rules: TrackRules | null;
  /** Nombre del perfil elegido, o `null` si la pista no tiene perfil con reglas. */
  profileName: string | null;
  dims: boolean;
}

/** Márgenes del PNG en píxeles: título arriba, resumen abajo. */
const PAD = { left: 70, top: 70, bottom: 100, right: 40 };
/** Píxeles por cm: el plano más grande ocupa unos 2600 px, con un mínimo y un máximo razonables. */
const target = (w: number, h: number) => Math.max(2, Math.min(7, 2600 / Math.max(w, h)));

/** Línea de resumen bajo el plano. */
export function summaryLine({ track, analysis, rules, profileName }: PlanPng): string {
  const errors = analysis.issues.filter((i) => i.sev === "error").length;
  const check = !rules
    ? "sin reglas de pista"
    : `${profileName ?? "perfil"}: ${errors ? `${errors} ${errors === 1 ? "problema" : "problemas"}` : "cumple"}`;
  return [
    `${fmt(track.board.widthCm)} × ${fmt(track.board.heightCm)} cm`,
    `línea ${fmt(analysis.stats.length / 100)} m`,
    `recta máx ${fmt(analysis.stats.straight.L || 0)} cm`,
    check,
  ].join(" · ");
}

/** Genera el PNG del plano. Espera a las tipografías para que el texto no salga con la de reserva. */
export async function renderPlanPng(plan: PlanPng): Promise<Blob> {
  try {
    await document.fonts?.ready;
  } catch {
    /* sin API de tipografías: se sigue con la de reserva */
  }
  const { track, analysis, rules } = plan;
  const W = track.board.widthCm;
  const H = track.board.heightCm;
  const k = target(W, H);
  const cv = document.createElement("canvas");
  cv.width = Math.round(W * k + PAD.left + PAD.right);
  cv.height = Math.round(H * k + PAD.top + PAD.bottom);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("El navegador no puede dibujar el plano.");
  const c = themeColors();
  ctx.fillStyle = c["--bg"];
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = c["--red"];
  ctx.fillRect(0, 58, cv.width, 2);
  drawScene(
    ctx,
    cv.width,
    cv.height,
    { z: k, vx: PAD.left, vy: PAD.top + H * k },
    {
      track,
      analysis,
      rules,
      issueSel: -1,
      dims: plan.dims,
    },
    c,
  );
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c["--ink"];
  ctx.font = `600 28px ${c["--sans"] || "sans-serif"}`;
  ctx.fillText(track.name || "Pista", 24, 40);
  ctx.fillStyle = c["--mid"];
  ctx.font = `500 15px ${c["--mono"] || "monospace"}`;
  ctx.fillText(summaryLine(plan), PAD.left, cv.height - 30);
  return new Promise<Blob>((resolve, reject) =>
    cv.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo crear la imagen."))),
      "image/png",
    ),
  );
}
