// Envoltorio React del controlador del lienzo: crea el controlador una vez, le conecta el <canvas>
// y entrega la escena por referencia (sin volver a crear el controlador en cada render).
import { useEffect, useMemo, useRef } from "react";
import { useCanvas } from "@/application/hooks/useCanvas";
import { TrackCanvasController } from "@/ui/components/track/TrackCanvasController";
import type { Scene } from "@/ui/components/track/drawScene";

export function TrackCanvas({ scene }: { scene: Scene | null }) {
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const controller = useMemo(
    () => new TrackCanvasController({ getScene: () => sceneRef.current }),
    [],
  );
  const ref = useCanvas((cv) => controller.render(cv));
  useEffect(() => {
    const cv = ref.current;
    return cv ? controller.attach(cv) : undefined;
  }, [controller, ref]);
  return (
    <>
      <div className="trk-bar">
        <button type="button" className="sb" onClick={() => controller.fit()} disabled={!scene}>
          Ajustar vista
        </button>
        <button
          type="button"
          className="sb"
          aria-label="Acercar"
          onClick={() => controller.zoomBy(1.25)}
          disabled={!scene}
        >
          +
        </button>
        <button
          type="button"
          className="sb"
          aria-label="Alejar"
          onClick={() => controller.zoomBy(0.8)}
          disabled={!scene}
        >
          −
        </button>
        <span className="note trk-grow">
          Arrastra para mover · rueda para acercar · con el lienzo enfocado: 0 ajusta, +/− zoom,
          flechas mueven
        </span>
      </div>
      <div className="trk-stage">
        <canvas
          ref={ref}
          className="trk-canvas"
          tabIndex={0}
          role="img"
          aria-label={scene ? `Plano de la pista ${scene.track.name}` : "Plano de la pista (vacío)"}
        />
        {!scene && (
          <div className="trk-empty">
            <b>Ninguna pista abierta</b>
            <span>Elige una pista guardada o un ejemplo para verla y verificarla.</span>
          </div>
        )}
      </div>
    </>
  );
}
