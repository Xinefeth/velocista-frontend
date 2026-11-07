// Recorridos de prueba con muchos puntos, como los que deja el GPS: uno sintético (rectángulo girado
// con ruido de 1 m) y el contorno real de una medición (coordenadas locales: no tienen latitud ni longitud).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PointApi } from "@/infrastructure/contracts/measurements";
import { measurement, result } from "../../black-box/measurement/_api";

/** Generador pseudoaleatorio con semilla: las pruebas dan siempre lo mismo. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Recorrido GPS sintético de un rectángulo `w × h` girado `deg` grados, con `n` puntos repartidos por
 * el borde y ruido uniforme de ±`noise` m en cada eje. El primer punto es el inicio (0, 0) y el
 * recorrido queda abierto (sin repetir el primer punto).
 */
export function gpsWalk(
  w: number,
  h: number,
  deg: number,
  n = 470,
  noise = 1,
  seed = 7,
): PointApi[] {
  const rand = rng(seed);
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const per = 2 * (w + h);
  const a = (deg * Math.PI) / 180;
  const out: PointApi[] = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per;
    let k = 0;
    const lens = corners.map((c, j) =>
      Math.hypot(corners[(j + 1) % 4].x - c.x, corners[(j + 1) % 4].y - c.y),
    );
    while (d > lens[k]) d -= lens[k++];
    const p = corners[k];
    const q = corners[(k + 1) % 4];
    const t = d / lens[k];
    const x = p.x + (q.x - p.x) * t + (i ? (rand() * 2 - 1) * noise : 0);
    const y = p.y + (q.y - p.y) * t + (i ? (rand() * 2 - 1) * noise : 0);
    out.push({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
  }
  return out;
}

export interface RealWalk {
  CONTORNO: PointApi[];
  TRAZO: PointApi[];
  TRAZO_CRUDO: PointApi[];
}

/** Contorno, trazo y trazo crudo de una medición GPS real (473 vértices, 98 × 91 m, origen en el inicio). */
export function realWalk(): RealWalk {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/dxf/gps-real-recorrido.json"), "utf8"),
  ) as Record<keyof RealWalk, [number, number][]>;
  const pts = (k: keyof RealWalk) => raw[k].map(([x, y]) => ({ x, y }));
  return { CONTORNO: pts("CONTORNO"), TRAZO: pts("TRAZO"), TRAZO_CRUDO: pts("TRAZO_CRUDO") };
}

const area = (p: PointApi[]) =>
  Math.abs(
    p.reduce((s, a, i) => s + (a.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * a.y), 0),
  ) / 2;
const perim = (p: PointApi[]) =>
  p.reduce(
    (s, a, i) => s + Math.hypot(p[(i + 1) % p.length].x - a.x, p[(i + 1) % p.length].y - a.y),
    0,
  );
export { area, perim };

/** Medición GPS con ese contorno como resultado (el perímetro y el área son los del contorno completo). */
export function gpsMeasurement(polygon: PointApi[], trace = polygon, raw = polygon) {
  return measurement(59, {
    method: "gps",
    place_name: "Test",
    reference: null,
    result: result({
      method: "gps",
      polygon,
      corrected_path: [...trace, trace[0]],
      raw_path: raw,
      perimeter_m: perim(polygon),
      area_m2: area(polygon),
      closure_error_m: 0.7,
      closure_error_pct: 0.3,
    }),
  });
}
