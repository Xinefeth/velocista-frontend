// Tabla de los lados y ángulos del contorno medido (la misma información que las cotas del dibujo,
// en texto para lectores de pantalla). Con un plano de referencia de los mismos vértices añade el
// largo del plano y la diferencia por lado.
import {
  diffLabel,
  lengthLabel,
  polygonDims,
  realCorners,
  sideDiffs,
} from "@/domain/measurement/dimensions";
import type { Pt } from "@/domain/measurement/plot";

interface Props {
  /** Contorno medido. */
  polygon: readonly Pt[];
  /** Plano de referencia, si lo hay. */
  plan?: readonly Pt[] | null;
}

export function SidesTable({ polygon, plan }: Props) {
  // la tabla usa las esquinas reales (un recorrido GPS trae cientos de puntos)
  const corners = realCorners(polygon).points;
  const dims = polygonDims(corners);
  if (!dims) return null;
  const diffs = plan ? sideDiffs(realCorners(plan).points, corners) : null;
  return (
    <>
      <div className="tw">
        <table className="t compact" aria-label="Lados del contorno medido">
          <thead>
            <tr>
              <th className="l">Lado</th>
              <th>Medido</th>
              {diffs && <th>Plano</th>}
              {diffs && <th>Diferencia</th>}
              <th>Ángulo</th>
            </tr>
          </thead>
          <tbody>
            {dims.sides.map((side, i) => (
              <tr key={side.name}>
                <td className="l">{side.name}</td>
                <td>{lengthLabel(side.length)}</td>
                {diffs && <td>{lengthLabel(diffs[i].plan)}</td>}
                {diffs && <td>{diffLabel(diffs[i].diff)}</td>}
                <td>
                  {dims.vertices[(i + 1) % dims.vertices.length].name}{" "}
                  {dims.vertices[(i + 1) % dims.vertices.length].label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plan && !diffs && (
        <p className="note">
          El plano y lo medido tienen distinto número de vértices: no se compara lado por lado.
        </p>
      )}
    </>
  );
}
