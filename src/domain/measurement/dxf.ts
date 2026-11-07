// Exporta el resultado de una medición como plano DXF (R2000 en texto, AC1015). Es una función pura:
// recibe la medición y devuelve el texto del archivo, sin leer estado global ni llamar al servidor.
//
// Unidades: metros, dibujo a tamaño real (sin escala 1:N). El resultado ya es local con origen en el
// punto de inicio, así que el archivo no lleva latitud ni longitud.
//
// R2000 exige handles únicos (grupo 5) y marcadores de subclase (grupo 100). Los handles se reparten
// con un solo contador, en el orden en que se escriben, así que son únicos y crecientes. Los acentos
// y la ñ de los TEXT se escriben como \U+00XX para que se vean bien en cualquier programa de CAD.
import {
  MAX_ANGLE_CORNERS,
  polygonDims,
  realCorners,
  type CornerOptions,
} from "@/domain/measurement/dimensions";
import { METHOD_LABEL, QUALITY } from "@/domain/measurement/labels";
import type { MeasurementApi, PointApi } from "@/infrastructure/contracts/measurements";

/** Capas del plano: color ACI (7 blanco, 1 rojo, 3 verde, 5 azul, 8 gris) y si nace congelada. */
export const DXF_LAYERS = [
  { name: "CONTORNO", color: 7, frozen: false },
  { name: "TRAZO", color: 3, frozen: false },
  { name: "TRAZO_CRUDO", color: 8, frozen: true }, // apagada por defecto
  { name: "ESQUINAS", color: 1, frozen: false },
  { name: "INICIO", color: 5, frozen: false },
  { name: "COTAS", color: 7, frozen: false },
  { name: "TEXTOS", color: 7, frozen: false },
  { name: "PLANO_REF", color: 5, frozen: false },
] as const;

export interface DxfOptions {
  /** Alto del texto en metros; por defecto se calcula según el tamaño del terreno. */
  textHeight?: number;
  /** Ajustes para hallar las esquinas reales del contorno (por defecto, los del dominio). */
  corners?: CornerOptions;
}

const EOL = "\r\n";
/** Dos puntos más cerca que esto (m) se consideran el mismo. */
const SAME_POINT_M = 0.001;

/** Número con 3 decimales (milímetros) y punto decimal, sin «-0.000». */
const num = (v: number): string => {
  const s = (Number.isFinite(v) ? v : 0).toFixed(3);
  return s === "-0.000" ? "0.000" : s;
};

/** Texto para un TEXT de DXF: sin saltos ni «%%» ni «\», y los no ASCII como \U+00XX. */
export function dxfText(value: string): string {
  const clean = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\\/g, "/")
    .replace(/%%/g, "% %");
  let out = "";
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    out +=
      code >= 32 && code <= 126
        ? clean[i]
        : `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

/** Nombre del archivo: `<lugar>-<id>-<fecha>.dxf`, con el lugar sin tildes, espacios ni símbolos. */
export function dxfFileName(
  m: Pick<MeasurementApi, "id" | "place_name" | "finished_at" | "started_at">,
) {
  const place =
    m.place_name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "medicion";
  return `${place}-${m.id}-${dateOf(m)}.dxf`;
}

/** Fecha (AAAA-MM-DD) en que terminó la medición; si no terminó, en que empezó. */
function dateOf(m: Pick<MeasurementApi, "finished_at" | "started_at">): string {
  const iso = m.finished_at ?? m.started_at ?? "";
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : "sin-fecha";
}

const same = (a: PointApi, b: PointApi) => Math.hypot(a.x - b.x, a.y - b.y) < SAME_POINT_M;

/** Quita el último punto si repite el primero (un polígono ya cerrado). */
function openRing(points: readonly PointApi[]): PointApi[] {
  const out = [...points];
  if (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
  return out;
}

/** Ángulo (°) del lado en el rango (−90, 90]: el texto nunca queda boca abajo. */
function uprightAngle(a: PointApi, b: PointApi): number {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  while (deg > 90) deg -= 180;
  while (deg <= -90) deg += 180;
  return deg;
}

/** Escritor de pares código/valor con reparto de handles. */
class Dxf {
  readonly lines: string[] = [];
  private next = 0x10;
  pair(code: number, value: string | number) {
    this.lines.push(String(code).padStart(3, " "), String(value));
  }
  point(x: number, y: number, z = 0, base = 10) {
    this.pair(base, num(x));
    this.pair(base + 10, num(y));
    this.pair(base + 20, num(z));
  }
  handle(): string {
    return (this.next++).toString(16).toUpperCase();
  }
  get seed(): string {
    return this.next.toString(16).toUpperCase();
  }
}

function polyline(d: Dxf, owner: string, layer: string, pts: PointApi[], closed: boolean) {
  if (pts.length < 2) return;
  d.pair(0, "LWPOLYLINE");
  d.pair(5, d.handle());
  d.pair(330, owner);
  d.pair(100, "AcDbEntity");
  d.pair(8, layer);
  d.pair(100, "AcDbPolyline");
  d.pair(90, pts.length);
  d.pair(70, closed ? 1 : 0);
  for (const p of pts) {
    d.pair(10, num(p.x));
    d.pair(20, num(p.y));
  }
}

interface TextSpec {
  layer: string;
  text: string;
  x: number;
  y: number;
  height: number;
  /** Grados; 0 si no se indica. */
  rotation?: number;
  /** Centrado horizontal sobre (x, y); si no, alineado a la izquierda. */
  center?: boolean;
}

function textEntity(d: Dxf, owner: string, t: TextSpec) {
  d.pair(0, "TEXT");
  d.pair(5, d.handle());
  d.pair(330, owner);
  d.pair(100, "AcDbEntity");
  d.pair(8, t.layer);
  d.pair(100, "AcDbText");
  d.point(t.x, t.y);
  d.pair(40, num(t.height));
  d.pair(1, dxfText(t.text));
  d.pair(50, num(t.rotation ?? 0));
  d.pair(7, "STANDARD");
  if (t.center) {
    d.pair(72, 1);
    d.point(t.x, t.y, 0, 11);
  }
  d.pair(100, "AcDbText");
  d.pair(73, 0);
}

function pointEntity(d: Dxf, owner: string, layer: string, p: PointApi) {
  d.pair(0, "POINT");
  d.pair(5, d.handle());
  d.pair(330, owner);
  d.pair(100, "AcDbEntity");
  d.pair(8, layer);
  d.pair(100, "AcDbPoint");
  d.point(p.x, p.y);
}

function circleEntity(d: Dxf, owner: string, layer: string, p: PointApi, radius: number) {
  d.pair(0, "CIRCLE");
  d.pair(5, d.handle());
  d.pair(330, owner);
  d.pair(100, "AcDbEntity");
  d.pair(8, layer);
  d.pair(100, "AcDbCircle");
  d.point(p.x, p.y);
  d.pair(40, num(radius));
}

/** Línea de texto del plano con el sentido de los ejes según el método. */
const axesText = (m: MeasurementApi) =>
  m.method === "gps"
    ? "Ejes: +X este, +Y norte (origen en el inicio)"
    : "Ejes: +X dirección inicial del recorrido (origen en el inicio)";

/** Líneas del bloque TEXTOS: resumen de la medición y unidades. */
function summaryLines(m: MeasurementApi, cornerNote: string[]): string[] {
  const r = m.result!;
  const lines = [
    `Lugar: ${m.place_name || "sin nombre"}`,
    `Fecha: ${dateOf(m)}`,
    `Método: ${METHOD_LABEL[m.method]}`,
    `Perímetro: ${r.perimeter_m.toFixed(2)} m`,
    `Área: ${r.area_m2.toFixed(2)} m²`,
    `Error de cierre: ${r.closure_error_m.toFixed(2)} m (${r.closure_error_pct.toFixed(1)} %)`,
    `Calidad: ${QUALITY[r.quality].tag}`,
  ];
  if (r.perimeter_error_pct != null && r.area_error_pct != null)
    lines.push(
      `Frente al plano: perímetro ${r.perimeter_error_pct.toFixed(1)} % · área ${r.area_error_pct.toFixed(1)} %`,
    );
  lines.push(...cornerNote, axesText(m), "Unidades: metros (dibujo a tamaño real)");
  return lines;
}

/** Plano de referencia a tamaño real en metros (puntos × escala de captura), si la medición lo trae. */
function referenceRing(m: MeasurementApi): PointApi[] {
  const ref = m.reference;
  if (!ref || ref.points.length < 3) return [];
  return openRing(ref.points.map((p) => ({ x: p.x * ref.scale_n, y: p.y * ref.scale_n })));
}

/**
 * Texto DXF (R2000) del resultado de una medición terminada.
 * @throws Error si la medición no tiene resultado (no hay nada que dibujar).
 */
export function measurementToDxf(m: MeasurementApi, options: DxfOptions = {}): string {
  const result = m.result;
  if (!result) throw new Error("La medición no tiene resultado para exportar.");

  const ring = openRing(result.polygon);
  const trace = result.corrected_path ?? [];
  const raw = result.raw_path ?? [];
  const ref = referenceRing(m);

  // Tamaño del dibujo: sirve para el alto del texto y para colocar el bloque de textos a la izquierda
  const all = [...ring, ...trace, ...raw, ...ref, { x: 0, y: 0 }];
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const extent = Math.max(maxX - minX, maxY - minY, 1);
  const h = options.textHeight ?? Math.min(3, Math.max(0.1, extent * 0.025));

  const d = new Dxf();

  // ---- TABLES
  d.pair(0, "SECTION");
  d.pair(2, "TABLES");

  const table = (name: string, count: number) => {
    const handle = d.handle();
    d.pair(0, "TABLE");
    d.pair(2, name);
    d.pair(5, handle);
    d.pair(330, 0);
    d.pair(100, "AcDbSymbolTable");
    d.pair(70, count);
    return handle;
  };
  const record = (kind: string, sub: string, owner: string, name: string) => {
    d.pair(0, kind);
    d.pair(5, d.handle());
    d.pair(330, owner);
    d.pair(100, "AcDbSymbolTableRecord");
    d.pair(100, sub);
    d.pair(2, name);
  };

  const ltypes = table("LTYPE", 3);
  for (const name of ["BYBLOCK", "BYLAYER", "CONTINUOUS"]) {
    record("LTYPE", "AcDbLinetypeTableRecord", ltypes, name);
    d.pair(70, 0);
    d.pair(3, name === "CONTINUOUS" ? "Solid line" : name);
    d.pair(72, 65);
    d.pair(73, 0);
    d.pair(40, "0.0");
  }
  d.pair(0, "ENDTAB");

  const layers = table("LAYER", DXF_LAYERS.length + 1);
  record("LAYER", "AcDbLayerTableRecord", layers, "0");
  d.pair(70, 0);
  d.pair(62, 7);
  d.pair(6, "CONTINUOUS");
  for (const l of DXF_LAYERS) {
    record("LAYER", "AcDbLayerTableRecord", layers, l.name);
    d.pair(70, l.frozen ? 1 : 0); // bit 1 = congelada
    d.pair(62, l.color);
    d.pair(6, "CONTINUOUS");
  }
  d.pair(0, "ENDTAB");

  const styles = table("STYLE", 1);
  record("STYLE", "AcDbTextStyleTableRecord", styles, "STANDARD");
  d.pair(70, 0);
  d.pair(40, "0.0");
  d.pair(41, "1.0");
  d.pair(50, "0.0");
  d.pair(71, 0);
  d.pair(42, num(h));
  d.pair(3, "txt");
  d.pair(0, "ENDTAB");

  const appids = table("APPID", 1);
  record("APPID", "AcDbRegAppTableRecord", appids, "ACAD");
  d.pair(70, 0);
  d.pair(0, "ENDTAB");

  const blockRecords = table("BLOCK_RECORD", 2);
  const modelRecord = d.handle();
  const paperRecord = d.handle();
  for (const [handle, name] of [
    [modelRecord, "*Model_Space"],
    [paperRecord, "*Paper_Space"],
  ] as const) {
    d.pair(0, "BLOCK_RECORD");
    d.pair(5, handle);
    d.pair(330, blockRecords);
    d.pair(100, "AcDbSymbolTableRecord");
    d.pair(100, "AcDbBlockTableRecord");
    d.pair(2, name);
  }
  d.pair(0, "ENDTAB");
  d.pair(0, "ENDSEC");

  // ---- BLOCKS
  d.pair(0, "SECTION");
  d.pair(2, "BLOCKS");
  for (const [owner, name] of [
    [modelRecord, "*Model_Space"],
    [paperRecord, "*Paper_Space"],
  ] as const) {
    d.pair(0, "BLOCK");
    d.pair(5, d.handle());
    d.pair(330, owner);
    d.pair(100, "AcDbEntity");
    d.pair(8, "0");
    d.pair(100, "AcDbBlockBegin");
    d.pair(2, name);
    d.pair(70, 0);
    d.point(0, 0);
    d.pair(3, name);
    d.pair(0, "ENDBLK");
    d.pair(5, d.handle());
    d.pair(330, owner);
    d.pair(100, "AcDbEntity");
    d.pair(8, "0");
    d.pair(100, "AcDbBlockEnd");
  }
  d.pair(0, "ENDSEC");

  // ---- ENTITIES
  d.pair(0, "SECTION");
  d.pair(2, "ENTITIES");
  const owner = modelRecord;

  polyline(d, owner, "CONTORNO", ring, true);
  polyline(d, owner, "TRAZO", trace, false);
  polyline(d, owner, "TRAZO_CRUDO", raw, false);
  polyline(d, owner, "PLANO_REF", ref, true);

  // Esquinas reales: un recorrido GPS trae cientos de vértices y rotular cada uno vuelve el plano
  // ilegible. CONTORNO, TRAZO y TRAZO_CRUDO llevan todos los puntos; ESQUINAS y COTAS solo estas.
  const found = realCorners(ring, options.corners);
  const corners = found.points;
  const withAngles = corners.length <= MAX_ANGLE_CORNERS;

  // Esquinas: los vértices simplificados salvo el que coincide con el inicio
  let n = 0;
  for (const p of corners) {
    if (same(p, { x: 0, y: 0 })) continue;
    n++;
    pointEntity(d, owner, "ESQUINAS", p);
    textEntity(d, owner, {
      layer: "ESQUINAS",
      text: String(n),
      x: p.x + h * 0.4,
      y: p.y + h * 0.4,
      height: h,
    });
  }

  circleEntity(d, owner, "INICIO", { x: 0, y: 0 }, h * 0.8);
  textEntity(d, owner, { layer: "INICIO", text: "Inicio", x: h * 1.0, y: -h * 1.6, height: h });

  // Cotas: el largo de cada lado en su punto medio, rotado a lo largo del lado y legible, y el ángulo
  // interior de cada vértice dentro del contorno (lo que se ve en pantalla va también al plano)
  const dims = polygonDims(corners);
  if (dims) {
    for (const side of dims.sides)
      textEntity(d, owner, {
        layer: "COTAS",
        text: `${side.length.toFixed(2)} m`,
        x: side.mid.x,
        y: side.mid.y,
        height: h,
        rotation: uprightAngle(side.from, side.to),
        center: true,
      });
    for (const v of withAngles ? dims.vertices : []) {
      const whole = Math.abs(v.interior - Math.round(v.interior)) < 0.05;
      textEntity(d, owner, {
        layer: "COTAS",
        text: `${v.interior.toFixed(whole ? 0 : 1)}°`,
        x: v.point.x - v.outward.x * h * 2.6,
        y: v.point.y - v.outward.y * h * 2.6,
        height: h,
        center: true,
      });
    }
  }

  // Resumen a la izquierda del dibujo
  const cornerNote = [
    `Cotas: ${corners.length} esquinas ${found.source === "simplified" ? "detectadas" : "marcadas"}`,
    ...(withAngles ? [] : [`Ángulos no rotulados (más de ${MAX_ANGLE_CORNERS} esquinas)`]),
  ];
  const lines = summaryLines(m, cornerNote);
  const width = Math.max(...lines.map((l) => l.length)) * h * 0.7;
  lines.forEach((text, i) =>
    textEntity(d, owner, {
      layer: "TEXTOS",
      text,
      x: minX - width - h * 3,
      y: maxY - i * h * 1.8,
      height: h,
    }),
  );
  d.pair(0, "ENDSEC");

  // ---- OBJECTS (solo el diccionario raíz, que AutoCAD espera)
  d.pair(0, "SECTION");
  d.pair(2, "OBJECTS");
  d.pair(0, "DICTIONARY");
  d.pair(5, d.handle());
  d.pair(330, 0);
  d.pair(100, "AcDbDictionary");
  d.pair(281, 1);
  d.pair(0, "ENDSEC");
  d.pair(0, "EOF");

  // ---- HEADER (al final, porque $HANDSEED depende del último handle repartido)
  const head = new Dxf();
  head.pair(0, "SECTION");
  head.pair(2, "HEADER");
  head.pair(9, "$ACADVER");
  head.pair(1, "AC1015");
  head.pair(9, "$HANDSEED");
  head.pair(5, d.seed);
  head.pair(9, "$DWGCODEPAGE");
  head.pair(3, "ANSI_1252");
  head.pair(9, "$INSBASE");
  head.point(0, 0);
  head.pair(9, "$EXTMIN");
  head.point(minX, minY);
  head.pair(9, "$EXTMAX");
  head.point(maxX, maxY);
  head.pair(9, "$PDMODE");
  head.pair(70, 3);
  head.pair(9, "$PDSIZE");
  head.pair(40, num(h * 0.5));
  head.pair(9, "$MEASUREMENT");
  head.pair(70, 1);
  head.pair(9, "$INSUNITS");
  head.pair(70, 6);
  head.pair(0, "ENDSEC");

  return [...head.lines, ...d.lines].join(EOL) + EOL;
}
