// Los dos ejemplos del prototipo (trazador-de-pistas.html, líneas ~960-980), como pistas de dominio.
// Se usan en pruebas y demostraciones; no son perfiles ni se guardan.
import type { Track, TrackPoint } from "@/domain/track/types";

const pt = (x: number, y: number, radius = 0, gap = false): TrackPoint => ({ x, y, radius, gap });

/** «Técnica 3 × 2,5»: pensada para el perfil Let's Go Robot 2026. */
export const EXAMPLE_TECHNIQUE: Track = {
  id: null,
  name: "Técnica 3 × 2,5",
  board: { widthCm: 300, heightCm: 250 },
  closed: true,
  start: { edge: 0, t: 0.35 },
  zones: [{ x: 104, y: 0, width: 12, height: 12, name: "poste del cronómetro" }],
  points: [
    pt(50, 45, 25),
    pt(250, 45, 45),
    pt(250, 205, 25),
    pt(170, 205, 15),
    pt(170, 120, 15),
    pt(140, 120, 15),
    pt(140, 205, 15),
    pt(50, 205, 25),
    pt(50, 150, 0),
    pt(75, 125, 0),
    pt(75, 100, 0),
    pt(50, 75, 0),
  ],
  profileId: "lgr2026",
};

/** «Ocho libre»: ocho con un cruce y un corte, pensado para el perfil de entrenamiento libre. */
export const EXAMPLE_EIGHT: Track = {
  id: null,
  name: "Ocho libre",
  board: { widthCm: 300, heightCm: 250 },
  closed: true,
  start: { edge: 0, t: 0.5 },
  zones: [],
  points: [
    pt(40, 40, 30),
    pt(150, 40, 0),
    pt(150, 210, 30, true),
    pt(260, 210, 30),
    pt(260, 125, 30),
    pt(40, 125, 30),
  ],
  profileId: "libre",
};

export const EXAMPLES: Track[] = [EXAMPLE_TECHNIQUE, EXAMPLE_EIGHT];
