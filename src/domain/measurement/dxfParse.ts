// Lector de planos DXF para usarlos como plano de referencia de una medición (F2 del spec «Exportar e
// importar DXF»). Es una función pura: recibe el texto del archivo y devuelve los contornos cerrados en
// metros, o el motivo (en español) por el que no se puede usar. No envía nada a ningún servidor.
//
// Se toma el dibujo a tamaño real (sin escala 1:N). Los puntos se devuelven en metros y TRASLADADOS
// para que el primer vértice del contorno quede en (0, 0), igual que los planos de la consola y que el
// trazo medido (que empieza en el origen): el plano solo sirve para perímetro, área y dibujo.
import { crossings } from "@/domain/track/geometry";
import type { SamplePoint } from "@/domain/track/types";
import { area, perimeter, type Pt } from "@/domain/measurement/plot";

export type DxfUnit = "mm" | "cm" | "m" | "in";

/** Metros por unidad de dibujo. */
export const DXF_UNIT_M: Record<DxfUnit, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254 };
export const DXF_UNIT_LABEL: Record<DxfUnit, string> = {
  mm: "milímetros",
  cm: "centímetros",
  m: "metros",
  in: "pulgadas",
};
/** Valor de $INSUNITS de cada unidad que se acepta. */
const INSUNITS: Record<number, DxfUnit> = { 1: "in", 4: "mm", 5: "cm", 6: "m" };

/** Tamaño máximo del archivo. */
export const DXF_MAX_BYTES = 5 * 1024 * 1024;
/** Dos puntos más cerca que esto (m) son el mismo. */
const TOL_M = 0.001;
/** Capa que el propio export llama al contorno de la medición: si existe, se propone esa. */
export const DXF_PREFERRED_LAYER = "CONTORNO";
/** Capas del propio export (el trazo no es un contorno de plano). */
const OWN_LAYERS = new Set(["TRAZO", "TRAZO_CRUDO"]);
/** Tipos de entidad que se ignoran avisando al usuario. */
const UNSUPPORTED = new Set([
  "ARC",
  "CIRCLE",
  "SPLINE",
  "ELLIPSE",
  "INSERT",
  "HATCH",
  "TEXT",
  "MTEXT",
  "DIMENSION",
  "LEADER",
  "POINT",
  "SOLID",
  "3DFACE",
  "IMAGE",
  "XLINE",
  "RAY",
  "ATTRIB",
  "ATTDEF",
  "VIEWPORT",
]);

export interface DxfContour {
  layer: string;
  /** Vértices en metros, con el primero en (0, 0). */
  points: Pt[];
  perimeter_m: number;
  area_m2: number;
}

export interface DxfPlan {
  contours: DxfContour[];
  /** Índice en `contours` del que se propone: el de la capa CONTORNO si existe; si no, el de mayor área. */
  chosen: number;
  unit: DxfUnit;
  /** `header` si la unidad sale de $INSUNITS; `asked` si la dio el usuario. */
  unitSource: "header" | "asked";
  /** Lo que se ignoró (tipos no soportados, capas del propio export, líneas sueltas). */
  ignored: string[];
  warnings: string[];
}

export interface DxfError {
  error: string;
  /** El archivo no declara su unidad: hay que pedirla y volver a leer con `options.unit`. */
  needsUnit?: boolean;
}

export interface DxfOptions {
  /** Unidad elegida por el usuario cuando el archivo no la declara. */
  unit?: DxfUnit;
}

interface Pair {
  code: number;
  value: string;
}
interface Entity {
  type: string;
  pairs: Pair[];
}
interface Vertex {
  x: number;
  y: number;
  bulge: number;
}
/** Figura cerrada candidata, ya en metros. */
interface Candidate {
  layer: string;
  points: Pt[];
  hasBulge: boolean;
}

const fail = (error: string, needsUnit = false): DxfError =>
  needsUnit ? { error, needsUnit } : { error };

/** Pares código/valor del archivo (acepta CRLF, LF, CR y espacios sobrantes). */
function tokenize(text: string): Pair[] | null {
  const lines = text.split(/\r\n|\r|\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const raw = lines[i].trim();
    if (!/^-?\d+$/.test(raw)) return null; // no es un par código/valor
    out.push({ code: Number(raw), value: lines[i + 1].trim() });
  }
  return out;
}

const num = (e: Pair | undefined) => {
  const n = e ? Number(e.value) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const firstValue = (e: Entity, code: number) => e.pairs.find((p) => p.code === code)?.value;
const layerOf = (e: Entity) => firstValue(e, 8) ?? "0";

/** Secciones del archivo: nombre → pares que contiene. */
function sections(pairs: Pair[]): Map<string, Pair[]> {
  const out = new Map<string, Pair[]>();
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === "SECTION" && pairs[i + 1]?.code === 2) {
      const name = pairs[i + 1].value;
      let j = i + 2;
      while (j < pairs.length && !(pairs[j].code === 0 && pairs[j].value === "ENDSEC")) j++;
      out.set(name, pairs.slice(i + 2, j));
      i = j;
    }
  }
  return out;
}

/** Entidades de la sección ENTITIES (cada una empieza en un par de código 0). */
function entitiesOf(pairs: Pair[]): Entity[] {
  const out: Entity[] = [];
  for (const p of pairs) {
    if (p.code === 0) out.push({ type: p.value, pairs: [] });
    else out.at(-1)?.pairs.push(p);
  }
  return out;
}

/** Vértices de un LWPOLYLINE: cada 10 abre un vértice, 20 su Y y 42 su bulge. */
function lwVertices(e: Entity): Vertex[] {
  const out: Vertex[] = [];
  for (const p of e.pairs) {
    if (p.code === 10) out.push({ x: num(p), y: 0, bulge: 0 });
    else if (p.code === 20 && out.length) out.at(-1)!.y = num(p);
    else if (p.code === 42 && out.length) out.at(-1)!.bulge = num(p);
  }
  return out;
}

/** Punto en el que dos extremos de línea se consideran unidos (cuadrícula de 1 mm). */
class EndpointGrid {
  private cells = new Map<string, number[]>();
  private key = (x: number, y: number) => `${Math.round(x / TOL_M)}:${Math.round(y / TOL_M)}`;
  add(i: number, p: Pt) {
    const k = this.key(p.x, p.y);
    (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(i);
  }
  /** Índices cuyo extremo está a menos de la tolerancia de `p`. */
  near(p: Pt, ends: (i: number) => Pt[]): number[] {
    const cx = Math.round(p.x / TOL_M);
    const cy = Math.round(p.y / TOL_M);
    const found = new Set<number>();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const i of this.cells.get(`${cx + dx}:${cy + dy}`) ?? [])
          if (ends(i).some((q) => dist(p, q) <= TOL_M)) found.add(i);
    return [...found];
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Une LINE punta con punta en cadenas; devuelve las cerradas y cuántas líneas quedaron sueltas. */
function chainLines(lines: { a: Pt; b: Pt; layer: string }[]): {
  closed: Candidate[];
  loose: number;
} {
  const used = new Array<boolean>(lines.length).fill(false);
  const ends = (i: number) => [lines[i].a, lines[i].b];
  const grid = new EndpointGrid();
  lines.forEach((l, i) => {
    grid.add(i, l.a);
    grid.add(i, l.b);
  });
  const closed: Candidate[] = [];
  let loose = 0;

  for (let s = 0; s < lines.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const chain: Pt[] = [lines[s].a, lines[s].b];
    const layer = lines[s].layer;
    let used_n = 1;
    // se alarga por el final hasta que no haya más líneas que lo continúen
    for (;;) {
      const tail = chain[chain.length - 1];
      const next = grid.near(tail, ends).find((i) => !used[i]);
      if (next === undefined) break;
      used[next] = true;
      used_n++;
      const { a, b } = lines[next];
      chain.push(dist(a, tail) <= TOL_M ? b : a);
    }
    // y por el principio (la primera línea puede estar a mitad de la cadena)
    for (;;) {
      const head = chain[0];
      const prev = grid.near(head, ends).find((i) => !used[i]);
      if (prev === undefined) break;
      used[prev] = true;
      used_n++;
      const { a, b } = lines[prev];
      chain.unshift(dist(a, head) <= TOL_M ? b : a);
    }
    if (used_n >= 3 && dist(chain[0], chain[chain.length - 1]) <= TOL_M) {
      chain.pop();
      closed.push({ layer, points: chain, hasBulge: false });
    } else loose += used_n;
  }
  return { closed, loose };
}

/** Quita vértices repetidos seguidos (y el cierre repetido). */
function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) if (!out.length || dist(out.at(-1)!, p) > TOL_M) out.push(p);
  while (out.length > 1 && dist(out[0], out.at(-1)!) <= TOL_M) out.pop();
  return out;
}

/** ¿El contorno se cruza consigo mismo? Usa el criterio de cruces del Trazador. */
function selfCrosses(points: Pt[]): boolean {
  // Se parte cada lado en 4 para que un contorno de pocos vértices (un cuadrilátero en moño) también
  // se detecte: `crossings` ignora los tramos vecinos y con 4 vértices todos serían vecinos.
  const dense: SamplePoint[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    for (let k = 0; k < 4; k++)
      dense.push({
        x: a.x + ((b.x - a.x) * k) / 4,
        y: a.y + ((b.y - a.y) * k) / 4,
        st: true,
        src: `v${i}`,
        s: 0,
      });
  });
  return crossings(dense, true).length > 0;
}

/**
 * Lee un DXF y devuelve sus contornos cerrados en metros.
 * `options.unit` solo se usa si el archivo no declara su unidad.
 */
export function parseDxfPlan(text: string, options: DxfOptions = {}): DxfPlan | DxfError {
  if (!text.trim()) return fail("El archivo está vacío.");
  if (text.length > DXF_MAX_BYTES)
    return fail("El archivo pesa más de 5 MB: usa un plano más liviano.");
  if (text.startsWith("AutoCAD Binary DXF"))
    return fail("Es un DXF binario. Guárdalo como DXF de texto (ASCII) y vuelve a elegirlo.");

  const pairs = tokenize(text);
  const parts = pairs && sections(pairs);
  const body = parts?.get("ENTITIES");
  if (!pairs || !parts || !body)
    return fail("El archivo no es un DXF válido (no tiene la sección ENTITIES).");

  // ---- unidad
  const header = parts.get("HEADER") ?? [];
  const at = header.findIndex((p) => p.code === 9 && p.value === "$INSUNITS");
  const declared = at >= 0 ? Math.trunc(num(header[at + 1])) : 0;
  let unit: DxfUnit;
  let unitSource: "header" | "asked";
  if (declared !== 0) {
    if (!INSUNITS[declared])
      return fail(
        `El archivo usa una unidad que no se soporta (código ${declared}). Guárdalo en milímetros, centímetros o metros.`,
      );
    unit = INSUNITS[declared];
    unitSource = "header";
  } else if (options.unit) {
    unit = options.unit;
    unitSource = "asked";
  } else {
    return fail("El archivo no dice en qué unidad está dibujado. Elige la unidad.", true);
  }
  const k = DXF_UNIT_M[unit];
  const toM = (x: number, y: number): Pt => ({ x: x * k, y: y * k });

  // ---- entidades
  const ignoredByType = new Map<string, number>();
  const ignoredLayers = new Map<string, number>();
  const ignore = (type: string, layer: string) => {
    if (OWN_LAYERS.has(layer.toUpperCase()))
      ignoredLayers.set(layer, (ignoredLayers.get(layer) ?? 0) + 1);
    else ignoredByType.set(type, (ignoredByType.get(type) ?? 0) + 1);
  };
  const candidates: Candidate[] = [];
  const openShapes: string[] = [];
  const lines: { a: Pt; b: Pt; layer: string }[] = [];

  const addShape = (layer: string, verts: Vertex[], closedFlag: boolean) => {
    const pts = verts.map((v) => toM(v.x, v.y));
    const hasBulge = verts.some((v) => Math.abs(v.bulge) > 1e-9);
    const first = pts[0];
    const last = pts.at(-1);
    const closed = closedFlag || (pts.length >= 3 && first && last && dist(first, last) <= TOL_M);
    if (closed) candidates.push({ layer, points: pts, hasBulge });
    else openShapes.push(layer);
  };

  const all = entitiesOf(body);
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    const layer = layerOf(e);
    if (OWN_LAYERS.has(layer.toUpperCase()) && e.type !== "VERTEX" && e.type !== "SEQEND") {
      // el trazo del propio export no es un contorno (se salta también su lista de vértices)
      ignore(e.type, layer);
      if (e.type === "POLYLINE") while (all[i + 1] && all[i + 1].type !== "SEQEND") i++;
      continue;
    }
    if (e.type === "LWPOLYLINE") {
      addShape(
        layer,
        lwVertices(e),
        (Math.trunc(num(e.pairs.find((p) => p.code === 70))) & 1) === 1,
      );
    } else if (e.type === "POLYLINE") {
      const flags = Math.trunc(num(e.pairs.find((p) => p.code === 70)));
      const verts: Vertex[] = [];
      while (all[i + 1] && all[i + 1].type === "VERTEX") {
        i++;
        const v = all[i];
        verts.push({
          x: num(v.pairs.find((p) => p.code === 10)),
          y: num(v.pairs.find((p) => p.code === 20)),
          bulge: num(v.pairs.find((p) => p.code === 42)),
        });
      }
      if (all[i + 1]?.type === "SEQEND") i++;
      if (flags & (16 | 64)) ignore("POLYLINE 3D o malla", layer);
      else addShape(layer, verts, (flags & 1) === 1);
    } else if (e.type === "LINE") {
      const a = toM(
        num(e.pairs.find((p) => p.code === 10)),
        num(e.pairs.find((p) => p.code === 20)),
      );
      const b = toM(
        num(e.pairs.find((p) => p.code === 11)),
        num(e.pairs.find((p) => p.code === 21)),
      );
      if (dist(a, b) > TOL_M) lines.push({ a, b, layer });
    } else if (UNSUPPORTED.has(e.type)) ignore(e.type, layer);
    else if (e.type !== "VERTEX" && e.type !== "SEQEND") ignore(e.type, layer);
  }

  const chained = chainLines(lines);
  candidates.push(...chained.closed);

  // ---- validar cada figura cerrada
  const warnings: string[] = [];
  const reasons: string[] = [];
  const contours: DxfContour[] = [];
  for (const c of candidates) {
    const where = `en la capa ${c.layer}`;
    if (c.hasBulge) {
      warnings.push(
        `Se descartó un contorno ${where}: tiene arcos y los arcos no están soportados.`,
      );
      reasons.push(
        "Los contornos del dibujo tienen arcos y los arcos no están soportados. Dibújalos con segmentos rectos.",
      );
      continue;
    }
    const pts = dedupe(c.points);
    if (pts.length < 3) {
      reasons.push("El contorno tiene menos de 3 vértices distintos.");
      warnings.push(`Se descartó un contorno ${where}: tiene menos de 3 vértices distintos.`);
      continue;
    }
    if (selfCrosses(pts)) {
      reasons.push("El contorno se cruza consigo mismo: dibuja un contorno sin cruces.");
      warnings.push(`Se descartó un contorno ${where}: se cruza consigo mismo.`);
      continue;
    }
    const a = area(pts);
    if (a < 1e-9) {
      reasons.push("El contorno no encierra área (todos sus puntos están en línea).");
      warnings.push(`Se descartó un contorno ${where}: no encierra área.`);
      continue;
    }
    const origin = pts[0];
    const moved = pts.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
    contours.push({ layer: c.layer, points: moved, perimeter_m: perimeter(moved), area_m2: a });
  }

  if (!contours.length) {
    if (reasons.length) return fail(reasons[0]);
    return fail(
      "El dibujo no tiene ningún contorno cerrado hecho con polilíneas o líneas rectas unidas punta con punta.",
    );
  }

  // ---- avisos de lo ignorado
  const ignored = [
    ...[...ignoredByType].map(([t, n]) => `${t} ×${n}`),
    ...[...ignoredLayers].map(([l, n]) => `capa ${l} ×${n} (es el trazo del plano exportado)`),
  ];
  if (chained.loose) ignored.push(`LINE sueltas ×${chained.loose}`);
  if (openShapes.length) ignored.push(`polilíneas abiertas ×${openShapes.length}`);

  // Con capa CONTORNO se propone esa (un export con plano de referencia trae dos contornos y el de
  // mayor área puede ser el del plano); sin ella, el de mayor área.
  const preferred = contours.flatMap((c, i) =>
    c.layer.toUpperCase() === DXF_PREFERRED_LAYER ? [i] : [],
  );
  const pool = preferred.length ? preferred : contours.map((_, i) => i);
  const chosen = pool.reduce(
    (best, i) => (contours[i].area_m2 > contours[best].area_m2 ? i : best),
    pool[0],
  );
  if (contours.length > 1)
    warnings.push(
      `El dibujo tiene ${contours.length} contornos cerrados: se propone ${
        preferred.length ? `el de la capa ${DXF_PREFERRED_LAYER}` : "el de mayor área"
      }.`,
    );
  return { contours, chosen, unit, unitSource, ignored, warnings };
}

/** ¿El resultado de `parseDxfPlan` es un error? */
export const isDxfError = (r: DxfPlan | DxfError): r is DxfError => "error" in r;

/** Lo que el usuario eligió: el archivo leído y, si hace falta, la unidad y el contorno. */
export interface DxfSource {
  fileName: string;
  text: string;
  /** Unidad elegida por el usuario (solo cuenta si el archivo no declara la suya). */
  unit?: DxfUnit;
  /** Contorno elegido entre varios; por defecto el de mayor área. */
  chosen?: number;
}

export interface DxfReading {
  result: DxfPlan | DxfError;
  /** El archivo no declara su unidad: se muestra el selector (metros por defecto). */
  askUnit: boolean;
  /** Contorno elegido (índice en `result.contours`), si hay plano. */
  index: number;
}

/** Lee el archivo elegido: si no trae unidad, usa la elegida o metros y avisa que hay que preguntarla. */
export function readDxfSource(src: DxfSource): DxfReading {
  let result = parseDxfPlan(src.text, { unit: src.unit });
  let askUnit = false;
  if (isDxfError(result) && result.needsUnit) {
    askUnit = true;
    result = parseDxfPlan(src.text, { unit: "m" });
  } else if (!isDxfError(result) && result.unitSource === "asked") askUnit = true;
  const index =
    !isDxfError(result) && src.chosen !== undefined && result.contours[src.chosen]
      ? src.chosen
      : isDxfError(result)
        ? 0
        : result.chosen;
  return { result, askUnit, index };
}

/** Nombre del plano: el del archivo sin la extensión. */
export const dxfPlanName = (fileName: string) =>
  fileName.replace(/\.dxf$/i, "").trim() || "Plano DXF";

/** Plano aceptado (metros, primer vértice en el origen) listo para usarse como plano de referencia. */
export function importedPlanOf(src: DxfSource | null): { name: string; points: Pt[] } | null {
  if (!src) return null;
  const { result, index } = readDxfSource(src);
  if (isDxfError(result)) return null;
  return { name: dxfPlanName(src.fileName), points: result.contours[index].points };
}
