// Exportaciones del Trazador (S2): SVG 1:1, SVG con zonas y JSON. Descarga con Blob.
import { useCallback } from "react";
import { exportFilename, type ExportKind } from "@/domain/track/files";
import { toSVG } from "@/domain/track/svg";
import type { Track, TrackRules } from "@/domain/track/types";
import { saveBlob } from "@/infrastructure/download/saveBlob";
import { ErrorApi } from "@/infrastructure/http/api";
import { trackToJson, tracksApi } from "@/infrastructure/http/tracks";
import { GEOMETRY_ONLY_RULES } from "@/domain/track/rules";

export interface TrackExport {
  /** Descarga el archivo y devuelve el mensaje para el piloto. */
  run: (kind: ExportKind) => Promise<string>;
}

/**
 * `rules` fija el ancho de línea y el largo del corte del SVG; sin reglas de pista se usan los valores
 * por defecto (19 mm y 2 cm). El JSON de una pista guardada viene de GET /tracks/{id}/export.
 */
export function useTrackExport(track: Track | null, rules: TrackRules | null): TrackExport {
  const run = useCallback(
    async (kind: ExportKind): Promise<string> => {
      if (!track) return "Abre una pista antes de exportar.";
      if (kind === "json") {
        try {
          if (track.id !== null) {
            const file = await tracksApi.exportJson(track.id);
            const name = file.filename ?? exportFilename(track.name, "json");
            saveBlob(name, file.text, "application/json");
            return `Guardado: ${name}`;
          }
          const name = exportFilename(track.name, "json");
          saveBlob(name, trackToJson(track), "application/json");
          return `Guardado: ${name} (pista sin guardar en la API)`;
        } catch (e) {
          return (
            "No se pudo exportar: " +
            (e instanceof ErrorApi ? e.message : "sin conexión con la API")
          );
        }
      }
      const svg = toSVG(track, rules ?? GEOMETRY_ONLY_RULES, { zones: kind === "svg-zonas" });
      const name = exportFilename(track.name, kind);
      saveBlob(name, svg, "image/svg+xml");
      return `Guardado: ${name}`;
    },
    [track, rules],
  );
  return { run };
}
