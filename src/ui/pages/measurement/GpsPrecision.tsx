// Vista Precisión del GPS (SP-06, HU-42) con el modelo que reajusta la precisión (SP-07), como en
// el prototipo. Cada parte vive en su propio componente.
import { PageHead } from "@/ui/components/measurement/MeasurementUi";
import { GpsTrials } from "@/ui/components/measurement/GpsTrials";
import { PrecisionModel } from "@/ui/components/measurement/PrecisionModel";

export function GpsPrecision() {
  return (
    <section className="view on dv" aria-label="Precisión del GPS">
      <PageHead title="Precisión del GPS">
        Antes de usar el GPS hay que medir cuánto se equivoca frente a la realidad. Así se decide si
        sirve como caso de uso.
      </PageHead>
      <GpsTrials />
      <PrecisionModel />
    </section>
  );
}
