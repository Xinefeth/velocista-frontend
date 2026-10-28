// SVG 1:1 para impresión, portado de `Track2.toSVG` (trazador-de-pistas.html, líneas ~928-957).
// Es la salida de imprenta (negro sobre blanco): no usa la paleta de la interfaz.
import { build } from "@/domain/track/geometry";
import type { Geometry, SamplePoint, Track, TrackRules } from "@/domain/track/types";

/** Escapa texto para XML (por si algún día se dibujan nombres de zona). */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Parte la línea en trozos donde hay cortes (huecos de `gapLen` cm). */
export function splitGaps(
  pts: SamplePoint[],
  gaps: Geometry["gaps"],
  gapLen: number,
): SamplePoint[][] {
  if (!gaps.length) return [pts];
  const out: SamplePoint[][] = [];
  let cur: SamplePoint[] = [];
  for (const q of pts) {
    if (gaps.some((gp) => Math.hypot(q.x - gp.x, q.y - gp.y) < gapLen / 2)) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    } else cur.push(q);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

export interface SvgOptions {
  /** Marca las zonas prohibidas con un rectángulo punteado. */
  zones?: boolean;
}

export function toSVG(track: Track, rules: TrackRules, opts: SvgOptions = {}): string {
  const g = build(track);
  const W = track.board.widthCm;
  const H = track.board.heightCm;
  const lw = (rules.lineWidthMm || 19) / 10;
  const P = (v: number) => Math.round(v * 100) / 100;
  let body = "";
  const runs = splitGaps(
    g.closed ? g.pts.concat([g.pts[0]]) : g.pts,
    g.gaps,
    rules.gapLengthCm || 2,
  );
  for (const run of runs)
    body += `<polyline fill="none" stroke="#282829" stroke-width="${lw}" stroke-linecap="butt" stroke-linejoin="miter" points="${run.map((q) => P(q.x) + "," + P(H - q.y)).join(" ")}"/>`;
  if (opts.zones)
    track.zones.forEach((z) => {
      body += `<rect x="${P(z.x)}" y="${P(H - z.y - z.height)}" width="${P(z.width)}" height="${P(z.height)}" fill="none" stroke="#c0392b" stroke-width="0.1" stroke-dasharray="1 1"/>`;
    });
  const m = 1.5;
  const marks = [
    [m, m],
    [W - m, m],
    [m, H - m],
    [W - m, H - m],
  ]
    .map(
      ([x, y]) =>
        `<path d="M${x - 1} ${y}H${x + 1}M${x} ${y - 1}V${y + 1}" stroke="#9a9a9a" stroke-width="0.05"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}cm" height="${H}cm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${marks}${body}</svg>`;
}
