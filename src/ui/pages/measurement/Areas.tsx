// Vista Áreas y planos (CU-3 y CU-5): el área de una figura de cualquier forma marcando puntos
// (HU-41) y el plano desde los lados y ángulos que se conocen (HU-43). Los cálculos son del
// backend (EN-42: /polygons/from-points y /polygons/solve); la vista dibuja y compara con el plano.
import { useEffect, useRef, useState } from "react";
import { Card } from "@/ui/components/Card";
import { Hint, Kpis, PageHead, Semaforo } from "@/ui/components/measurement/MeasurementUi";
import { dots, grid, line, surface, tag } from "@/ui/components/measurement/draw";
import { useCanvas } from "@/application/hooks/useCanvas";
import { errorText, fmtEs, signedPct, WARNINGS } from "@/domain/measurement/labels";
import { area, boundsOf, fitView, perimeter, rectangle, type Pt } from "@/domain/measurement/plot";
import { polygonsApi } from "@/infrastructure/http/measurements";
import type { PolygonApi } from "@/infrastructure/contracts/measurements";

type Mode = "points" | "sides";

/** Zona del lienzo al marcar puntos, en metros. */
const BOARD = { x0: 0, x1: 20, y0: 0, y1: 14 };

export const PRESETS: Record<string, { label: string; points: Pt[] }> = {
  L: {
    label: "Acera en L",
    points: [
      { x: 2, y: 2 },
      { x: 14, y: 2 },
      { x: 14, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 12 },
      { x: 2, y: 12 },
    ],
  },
  rect: { label: "Rectángulo", points: rectangle(10, 6).map((p) => ({ x: p.x + 3, y: p.y + 3 })) },
  U: {
    label: "Terreno en U",
    points: [
      { x: 2, y: 2 },
      { x: 16, y: 2 },
      { x: 16, y: 12 },
      { x: 12, y: 12 },
      { x: 12, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 12 },
      { x: 2, y: 12 },
    ],
  },
};

export interface SideRow {
  side: string;
  angle: string;
}

/** Filas de un rectángulo 8 × 6 con el último lado y sus ángulos por calcular. */
export const DEFAULT_ROWS: SideRow[] = [
  { side: "8", angle: "90" },
  { side: "6", angle: "90" },
  { side: "8", angle: "90" },
  { side: "", angle: "" },
];

/** Convierte las filas escritas a números (`null` = no se sabe) o devuelve el error de la entrada. */
export function parseRows(
  rows: SideRow[],
): { sides: (number | null)[]; angles: (number | null)[] } | string {
  if (rows.length < 3) return "La figura necesita al menos 3 lados.";
  const toNum = (v: string, what: string, i: number) => {
    const t = v.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`${what} ${i + 1}: escribe un número.`);
    return n;
  };
  try {
    return {
      sides: rows.map((r, i) => toNum(r.side, "Lado", i)),
      angles: rows.map((r, i) => toNum(r.angle, "Ángulo", i)),
    };
  } catch (e) {
    return (e as Error).message;
  }
}

function PolygonCanvas({
  shape,
  pending,
  onAdd,
}: {
  shape: PolygonApi | null;
  pending: Pt[];
  onAdd?: (p: Pt) => void;
}) {
  const viewRef = useRef<ReturnType<typeof fitView> | null>(null);
  const ref = useCanvas((cv) => {
    const s = surface(cv);
    if (!s) return;
    const pts = shape?.points ?? pending;
    const b = onAdd ? BOARD : (boundsOf(pts) ?? BOARD);
    const view = fitView(b, s.w, s.h, 28);
    viewRef.current = view;
    grid(s, view);
    const color = shape?.self_crossing ? s.color("--yellow") : s.color("--red");
    line(s, view, pts, { color, width: 2.6, closed: pts.length > 2 });
    dots(s, view, pts, s.color("--ink"), 4);
    if (shape)
      shape.points.forEach((p, i) => {
        const q = shape.points[(i + 1) % shape.points.length];
        const [x, y] = view.P({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        const computed = shape.computed_sides.includes(i);
        tag(s, x, y, `${fmtEs(shape.sides_m[i], 2)} m`, computed ? s.color("--green") : undefined);
      });
  });
  return (
    <div className={`cv h360${onAdd ? " clickable" : ""}`}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Figura medida"
        onClick={(e) => {
          if (!onAdd || !viewRef.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const p = viewRef.current.M(e.clientX - r.left, e.clientY - r.top);
          onAdd({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
        }}
      />
    </div>
  );
}

function ShapeResult({ shape }: { shape: PolygonApi | null }) {
  if (!shape) return <p className="note">Marca al menos 3 puntos o calcula el plano.</p>;
  const tone = shape.self_crossing || !shape.closes ? "warn" : "good";
  return (
    <>
      <Semaforo
        tone={tone}
        title={shape.closes ? "La figura cierra" : "La figura tiene avisos"}
        sub={shape.concave ? "Figura cóncava: el área se calcula igual." : "Figura convexa."}
      />
      <Kpis
        label="Medidas de la figura"
        items={[
          { label: "Área", value: fmtEs(shape.area_m2, 2), unit: "m²", tone: "good" },
          { label: "Perímetro", value: fmtEs(shape.perimeter_m, 2), unit: "m" },
          { label: "Lados", value: shape.sides_m.length },
          { label: "Suma de ángulos", value: fmtEs(sum(shape.angles_deg), 1), unit: "°" },
        ]}
      />
      <ul className="checks" style={{ marginTop: 8 }}>
        {shape.warnings.map((w) => (
          <li key={w} className="warn">
            <span className="ic" />
            <span>
              <b>{WARNINGS[w] ?? w}</b>
            </span>
          </li>
        ))}
        {!shape.warnings.length && (
          <li className="ok">
            <span className="ic" />
            <span>
              <b>Sin avisos</b>
              <small>Los lados no se cruzan y los ángulos suman (n − 2) × 180°.</small>
            </span>
          </li>
        )}
      </ul>
      <div className="tw" style={{ marginTop: 8 }}>
        <table className="t" aria-label="Lados y ángulos de la figura">
          <thead>
            <tr>
              <th className="l">#</th>
              <th>Lado (m)</th>
              <th>Ángulo interior (°)</th>
            </tr>
          </thead>
          <tbody>
            {shape.sides_m.map((s, i) => (
              <tr key={i}>
                <td className="l">{i + 1}</td>
                <td className={shape.computed_sides.includes(i) ? "good" : undefined}>
                  {fmtEs(s, 2)}
                  {shape.computed_sides.includes(i) && " · calculado"}
                </td>
                <td className={shape.computed_angles.includes(i) ? "good" : undefined}>
                  {fmtEs(shape.angles_deg[i], 1)}
                  {shape.computed_angles.includes(i) && " · calculado"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function PlanCompare({ shape }: { shape: PolygonApi | null }) {
  const [length, setLength] = useState("8");
  const [width, setWidth] = useState("6");
  const [scale, setScale] = useState("1");
  const L = Number(length) * Number(scale);
  const W = Number(width) * Number(scale);
  const valid = L > 0 && W > 0;
  const plan = valid ? rectangle(L, W) : null;
  const pct = (a: number, b: number) => ((a - b) / b) * 100;
  return (
    <Card pbi="HU-38 · HU-43" sprint="2">
      <div className="hd">
        <h2>Comparar con el plano</h2>
        <span className="tag purple">Plano 1:{scale || "—"}</span>
      </div>
      <p className="note" style={{ margin: "0 0 8px" }}>
        Medidas del plano dibujado (largo × ancho) y su escala: se llevan a tamaño real y se
        comparan con la figura calculada.
      </p>
      <div className="g3">
        <label className="fld">
          <span className="lbl">Largo (m)</span>
          <input
            className="inp m"
            aria-label="Largo del plano"
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </label>
        <label className="fld">
          <span className="lbl">Ancho (m)</span>
          <input
            className="inp m"
            aria-label="Ancho del plano"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </label>
        <label className="fld">
          <span className="lbl">Escala 1:</span>
          <input
            className="inp m"
            aria-label="Escala del plano"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
          />
        </label>
      </div>
      {!valid && <Hint text="Escribe largo, ancho y escala mayores que 0." error />}
      {valid && plan && shape && (
        <div className="tw" style={{ marginTop: 10 }}>
          <table className="t" aria-label="Plano frente a figura">
            <thead>
              <tr>
                <th className="l">Dato</th>
                <th>Plano (real)</th>
                <th>Figura</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="l">Perímetro</td>
                <td>{fmtEs(perimeter(plan), 2)} m</td>
                <td>{fmtEs(shape.perimeter_m, 2)} m</td>
                <td>{signedPct(pct(shape.perimeter_m, perimeter(plan)))}</td>
              </tr>
              <tr>
                <td className="l">Área</td>
                <td>{fmtEs(area(plan), 2)} m²</td>
                <td>{fmtEs(shape.area_m2, 2)} m²</td>
                <td>{signedPct(pct(shape.area_m2, area(plan)))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function Areas() {
  const [mode, setMode] = useState<Mode>("points");
  const [points, setPoints] = useState<Pt[]>(PRESETS.L.points);
  const [rows, setRows] = useState<SideRow[]>(DEFAULT_ROWS);
  const [shape, setShape] = useState<PolygonApi | null>(null);
  const [error, setError] = useState("");
  const [xy, setXy] = useState({ x: "", y: "" });

  // Al marcar puntos, el área se recalcula en el backend con cada cambio.
  useEffect(() => {
    if (mode !== "points") return;
    let alive = true;
    if (points.length < 3) {
      setShape(null);
      setError("");
      return;
    }
    polygonsApi
      .fromPoints(points)
      .then((s) => alive && (setShape(s), setError("")))
      .catch((e) => alive && (setShape(null), setError(errorText(e))));
    return () => {
      alive = false;
    };
  }, [mode, points]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setShape(null);
    setError("");
  };

  async function solve() {
    const parsed = parseRows(rows);
    if (typeof parsed === "string") {
      setShape(null);
      return setError(parsed);
    }
    try {
      setShape(await polygonsApi.solve(parsed.sides, parsed.angles));
      setError("");
    } catch (e) {
      setShape(null);
      setError(errorText(e));
    }
  }

  function addTyped() {
    const x = Number(xy.x.replace(",", "."));
    const y = Number(xy.y.replace(",", "."));
    if (!xy.x.trim() || !xy.y.trim() || !Number.isFinite(x) || !Number.isFinite(y))
      return setError("Escribe x e y en metros para agregar el punto.");
    setPoints((p) => [...p, { x, y }]);
    setXy({ x: "", y: "" });
  }

  const setRow = (i: number, key: keyof SideRow, value: string) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));

  return (
    <section className="view on dv" aria-label="Áreas y planos">
      <PageHead title="Áreas y planos">
        Mide el área de una figura de cualquier forma marcando puntos, o arma el plano de un terreno
        con los lados y ángulos que conoces.
      </PageHead>
      <Card className="s7" pbi={mode === "points" ? "HU-41" : "HU-43"} sprint="2">
        <div className="hd">
          <h2>{mode === "points" ? "Marcar puntos" : "Lados y ángulos"}</h2>
          <div className="seg" role="group" aria-label="Modo">
            <button
              type="button"
              aria-pressed={mode === "points"}
              onClick={() => switchMode("points")}
            >
              Marcar puntos
            </button>
            <button
              type="button"
              aria-pressed={mode === "sides"}
              onClick={() => switchMode("sides")}
            >
              Lados y ángulos
            </button>
          </div>
        </div>
        <PolygonCanvas
          shape={shape}
          pending={mode === "points" ? points : []}
          onAdd={mode === "points" ? (p) => setPoints((cur) => [...cur, p]) : undefined}
        />
        {mode === "points" ? (
          <>
            <div
              className="row"
              style={{ marginTop: 10, flexWrap: "wrap", justifyContent: "flex-start", gap: 8 }}
            >
              {Object.entries(PRESETS).map(([k, p]) => (
                <button key={k} type="button" className="sb" onClick={() => setPoints(p.points)}>
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className="sb ghost"
                onClick={() => setPoints((p) => p.slice(0, -1))}
              >
                Deshacer
              </button>
              <button type="button" className="sb ghost" onClick={() => setPoints([])}>
                Limpiar
              </button>
            </div>
            <div className="g3" style={{ marginTop: 10 }}>
              <label className="fld">
                <span className="lbl">x (m)</span>
                <input
                  className="inp m"
                  aria-label="x del punto"
                  value={xy.x}
                  onChange={(e) => setXy({ ...xy, x: e.target.value })}
                />
              </label>
              <label className="fld">
                <span className="lbl">y (m)</span>
                <input
                  className="inp m"
                  aria-label="y del punto"
                  value={xy.y}
                  onChange={(e) => setXy({ ...xy, y: e.target.value })}
                />
              </label>
              <div className="fld" style={{ alignSelf: "end" }}>
                <button type="button" className="sb" style={{ height: 40 }} onClick={addTyped}>
                  Agregar punto
                </button>
              </div>
            </div>
            <p className="note">
              Toca el cuadro para marcar los puntos del contorno en orden (o escríbelos). El área se
              calcula aunque la figura sea cóncava. {points.length} puntos.
            </p>
          </>
        ) : (
          <>
            <div className="tw" style={{ marginTop: 10 }}>
              <table className="t" aria-label="Datos conocidos">
                <thead>
                  <tr>
                    <th className="l">#</th>
                    <th className="l">Lado (m)</th>
                    <th className="l">Ángulo interior (°)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="l">{i + 1}</td>
                      <td className="l">
                        <input
                          className="inp m"
                          aria-label={`Lado ${i + 1}`}
                          placeholder="?"
                          value={r.side}
                          onChange={(e) => setRow(i, "side", e.target.value)}
                        />
                      </td>
                      <td className="l">
                        <input
                          className="inp m"
                          aria-label={`Ángulo ${i + 1}`}
                          placeholder="?"
                          value={r.angle}
                          onChange={(e) => setRow(i, "angle", e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className="row"
              style={{ marginTop: 10, gap: 8, justifyContent: "flex-start", flexWrap: "wrap" }}
            >
              <button
                type="button"
                className="sb"
                onClick={() => setRows((r) => [...r, { side: "", angle: "" }])}
              >
                Agregar lado
              </button>
              <button
                type="button"
                className="sb ghost"
                disabled={rows.length <= 3}
                onClick={() => setRows((r) => r.slice(0, -1))}
              >
                Quitar lado
              </button>
              <button type="button" className="sb red" onClick={() => void solve()}>
                Calcular plano
              </button>
            </div>
            <p className="note">
              Deja vacío lo que no sabes. El ángulo es el interior de cada vértice (270° en la
              esquina entrante de una L); deben sumar (n − 2) × 180°. Puede faltar un ángulo (o los
              dos de un mismo lado) y hasta dos lados no paralelos.
            </p>
          </>
        )}
        <Hint text={error} error />
      </Card>
      <div className="stack s5">
        <Card pbi="EN-42" sprint="2">
          <div className="hd">
            <h2>Resultado</h2>
            <span className="tag">{shape ? `${fmtEs(shape.area_m2, 1)} m²` : "—"}</span>
          </div>
          <ShapeResult shape={shape} />
        </Card>
        <PlanCompare shape={shape} />
      </div>
    </section>
  );
}
