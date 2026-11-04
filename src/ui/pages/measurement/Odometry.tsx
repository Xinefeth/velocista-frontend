// Vista Odometría · Medir terreno (HU-34, HU-38, HU-40). Se completa en la rama de esa funcionalidad.
import { PageHead } from "@/ui/components/measurement/MeasurementUi";

export function Odometry() {
  return (
    <section className="view on dv" aria-label="Odometría · Medir terreno">
      <PageHead title="Odometría · Medir terreno">
        Mide el contorno de un lugar con el celular (pasos y giro, o GPS) y compáralo con su plano.
      </PageHead>
    </section>
  );
}
