// Hook para lienzos: redibuja en cada render (cada frame, por el tick del store) y al redimensionar.
import { useEffect, useRef } from "react";

export function useCanvas(draw: (cv: HTMLCanvasElement) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  // Redibuja tras cada render (el store sube `tick` por frame).
  useEffect(() => {
    if (ref.current) drawRef.current(ref.current);
  });
  // Redibuja al cambiar el tamaño de la ventana.
  useEffect(() => {
    const h = () => ref.current && drawRef.current(ref.current);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return ref;
}
