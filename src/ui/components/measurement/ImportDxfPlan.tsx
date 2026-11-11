// Selector de un plano DXF para usarlo como plano de referencia (vista Odometría, paso 1). Lee el
// archivo en el navegador con file.text() y muestra una vista previa del contorno antes de usarlo;
// no envía nada a ningún servidor. El componente es controlado: `value` es lo que se eligió y
// `onChange` avisa cuando cambia el archivo, la unidad o el contorno.
import { useId, useMemo, useState } from "react";
import {
  DXF_MAX_BYTES,
  DXF_UNIT_LABEL,
  isDxfError,
  readDxfSource,
  type DxfSource,
  type DxfUnit,
} from "@/domain/measurement/dxfParse";
import {
  fmtEs,
  IMPORT_DXF_CHANGE,
  IMPORT_DXF_CHOOSE,
  IMPORT_DXF_CONTOURS,
  IMPORT_DXF_HINT,
  IMPORT_DXF_READ_ERROR,
  IMPORT_DXF_REMOVE,
  IMPORT_DXF_TOO_BIG,
  IMPORT_DXF_UNIT,
  IMPORT_DXF_UNIT_ASK,
  IMPORT_DXF_UNIT_SOURCE,
} from "@/domain/measurement/labels";
import { Hint } from "@/ui/components/measurement/MeasurementUi";
import { PlanPreview } from "@/ui/components/measurement/PlanPreview";

interface Props {
  value: DxfSource | null;
  onChange: (next: DxfSource | null) => void;
}

export function ImportDxfPlan({ value, onChange }: Props) {
  const id = useId();
  const [readError, setReadError] = useState("");
  const reading = useMemo(() => (value ? readDxfSource(value) : null), [value]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReadError("");
    // el tamaño se comprueba antes de leer el contenido
    if (file.size > DXF_MAX_BYTES) {
      onChange(null);
      setReadError(IMPORT_DXF_TOO_BIG);
      return;
    }
    try {
      onChange({ fileName: file.name, text: await file.text() });
    } catch {
      onChange(null);
      setReadError(IMPORT_DXF_READ_ERROR);
    }
  };

  const result = reading?.result;
  const plan = result && !isDxfError(result) ? result : null;
  const contour = plan ? plan.contours[reading!.index] : null;
  const error = readError || (result && isDxfError(result) ? result.error : "");

  return (
    <div className="importdxf">
      <input
        id={`${id}-file`}
        className="inp"
        type="file"
        accept=".dxf,.DXF"
        aria-label={value ? IMPORT_DXF_CHANGE : IMPORT_DXF_CHOOSE}
        aria-describedby={`${id}-hint`}
        // la misma ruta dos veces seguidas también debe volver a leerse
        onClick={(e) => ((e.target as HTMLInputElement).value = "")}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <p className="note" id={`${id}-hint`}>
        {IMPORT_DXF_HINT}
      </p>
      <Hint text={error} error />

      {reading?.askUnit && value && (
        <label className="fld">
          <span className="lbl">{IMPORT_DXF_UNIT}</span>
          <select
            className="inp"
            aria-label={IMPORT_DXF_UNIT}
            aria-describedby={`${id}-unit`}
            value={value.unit ?? "m"}
            onChange={(e) => onChange({ ...value, unit: e.target.value as DxfUnit })}
          >
            {(Object.keys(DXF_UNIT_LABEL) as DxfUnit[]).map((u) => (
              <option key={u} value={u}>
                {DXF_UNIT_LABEL[u]}
              </option>
            ))}
          </select>
          <span className="note" id={`${id}-unit`}>
            {IMPORT_DXF_UNIT_ASK}
          </span>
        </label>
      )}

      {plan && contour && value && (
        <>
          {plan.contours.length > 1 && (
            <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="lbl">{IMPORT_DXF_CONTOURS}</legend>
              {plan.contours.map((c, i) => (
                <label
                  key={i}
                  style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}
                >
                  <input
                    type="radio"
                    name={`${id}-contour`}
                    checked={i === reading!.index}
                    onChange={() => onChange({ ...value, chosen: i })}
                  />
                  <span>
                    {c.layer} · {fmtEs(c.perimeter_m, 2)} m · {fmtEs(c.area_m2, 2)} m²
                    {i === plan.chosen ? " (propuesto)" : ""}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <PlanPreview points={contour.points} />
          <dl className="specs" aria-label="Contorno leído del archivo">
            <dt>Archivo</dt>
            <dd>{value.fileName}</dd>
            <dt>Capa</dt>
            <dd>{contour.layer}</dd>
            <dt>Vértices</dt>
            <dd>{contour.points.length}</dd>
            <dt>Perímetro</dt>
            <dd>{fmtEs(contour.perimeter_m, 2)} m</dd>
            <dt>Área</dt>
            <dd>{fmtEs(contour.area_m2, 2)} m²</dd>
            <dt>Unidad detectada</dt>
            <dd>
              {DXF_UNIT_LABEL[plan.unit]} ({IMPORT_DXF_UNIT_SOURCE[plan.unitSource]})
            </dd>
          </dl>
          {plan.warnings.map((w) => (
            <p key={w} className="note" role="status">
              {w}
            </p>
          ))}
          {plan.ignored.length > 0 && (
            <p className="note">Se ignoró: {plan.ignored.join(" · ")}.</p>
          )}
        </>
      )}

      {value && (
        <button
          type="button"
          className="sb"
          onClick={() => {
            setReadError("");
            onChange(null);
          }}
        >
          {IMPORT_DXF_REMOVE}
        </button>
      )}
    </div>
  );
}
