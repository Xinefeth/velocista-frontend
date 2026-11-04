// Vista Áreas y planos (HU-41, HU-43). Se completa en la rama de esa funcionalidad.
import { PageHead } from "@/ui/components/measurement/MeasurementUi";

export function Areas() {
  return (
    <section className="view on dv" aria-label="Áreas y planos">
      <PageHead title="Áreas y planos">
        Mide el área de una figura de cualquier forma marcando puntos, o arma el plano de un terreno
        con los lados y ángulos que conoces.
      </PageHead>
    </section>
  );
}
