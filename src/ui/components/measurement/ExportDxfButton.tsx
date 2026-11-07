// Botón «Exportar DXF» del resultado de una medición (celular y consola). Genera el plano en el
// navegador y lo descarga con saveBlob: no hace ninguna petición al servidor. Solo se ofrece si la
// medición tiene resultado.
import { useState } from "react";
import { dxfFileName, measurementToDxf } from "@/domain/measurement/dxf";
import {
  EXPORT_DXF,
  EXPORT_DXF_DONE,
  EXPORT_DXF_ERROR,
  EXPORT_DXF_HINT,
} from "@/domain/measurement/labels";
import type { MeasurementApi } from "@/infrastructure/contracts/measurements";
import { saveBlob } from "@/infrastructure/download/saveBlob";

interface Props {
  measurement: MeasurementApi;
  /** Clases del botón: `sb wide` en el celular, `sb` en la consola. */
  className?: string;
}

export function ExportDxfButton({ measurement, className = "sb" }: Props) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  if (!measurement.result) return null;

  const exportNow = () => {
    try {
      const name = dxfFileName(measurement);
      saveBlob(name, measurementToDxf(measurement), "application/dxf");
      setStatus({ ok: true, text: EXPORT_DXF_DONE(name) });
    } catch {
      setStatus({ ok: false, text: EXPORT_DXF_ERROR });
    }
  };

  return (
    <div className="exportdxf">
      <button type="button" className={className} onClick={exportNow} aria-describedby="dxf-hint">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
        </svg>
        {EXPORT_DXF}
      </button>
      <p className="hint" id="dxf-hint">
        {EXPORT_DXF_HINT}
      </p>
      {status && (
        <p className="hint" role="status">
          {status.text}
        </p>
      )}
    </div>
  );
}
