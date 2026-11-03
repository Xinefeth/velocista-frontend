// Punto 4 del Trazador: aviso de radio con corrección, cotas, simulación de vuelta, PNG e importación.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_IMPORT_BYTES, parseTrackFile } from "@/application/hooks/useTrackImport";
import { TrackSimulation } from "@/application/state/trackSimulation";
import { fitRadii } from "@/domain/track/commands";
import { EXAMPLES, EXAMPLE_EIGHT, EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { exportFilename } from "@/domain/track/files";
import { build } from "@/domain/track/geometry";
import { analyze } from "@/domain/track/rules";
import { simStartS } from "@/domain/track/simulation";
import type { Track } from "@/domain/track/types";
import { trackToJson } from "@/infrastructure/http/tracks";
import { drawDims } from "@/ui/components/track/drawDims";
import { drawScene } from "@/ui/components/track/drawScene";
import { renderPlanPng, summaryLine } from "@/ui/components/track/exportPng";
import { fitViewport } from "@/ui/components/track/viewport";
import { LGR_2026, NO_RULES } from "./fixtures";

const COLORS: Record<string, string> = {
  "--ink": "i",
  "--blue": "b",
  "--yellow": "y",
  "--bg": "g",
};

/** Contexto que apunta los textos dibujados y las veces que se gira. */
function recorder() {
  const texts: string[] = [];
  const rotations: number[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, p: string) => {
      if (p === "fillText") return (s: string) => texts.push(s);
      if (p === "rotate") return (a: number) => rotations.push(a);
      if (p === "measureText") return () => ({ width: 20 });
      return p in t ? t[p] : () => undefined;
    },
    set: (t, p: string, v) => {
      t[p] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, rotations };
}

/** Rectángulo de 100 × 20 cm con radio 15: los radios vecinos no caben en el lado corto. */
const TIGHT: Track = {
  ...EXAMPLE_TECHNIQUE,
  id: null,
  closed: true,
  points: [
    { x: 100, y: 100, radius: 15, gap: false },
    { x: 200, y: 100, radius: 15, gap: false },
    { x: 200, y: 120, radius: 15, gap: false },
    { x: 100, y: 120, radius: 15, gap: false },
  ],
  start: { edge: 0, t: 0.5 },
};

describe("aviso «ajuste» y su corrección de un clic", () => {
  it("un radio que no entra genera el aviso con la corrección", () => {
    const issues = analyze(TIGHT, NO_RULES).issues.filter((i) => i.kind === "ajuste");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix).toBeDefined();
    expect(issues[0].fix!.r).toBeLessThan(15);
  });

  it("fitRadii baja el vértice y sus vecinos recortados: el aviso desaparece", () => {
    const fix = analyze(TIGHT, NO_RULES).issues.find((i) => i.fix)!.fix!;
    const fixed = fitRadii(TIGHT, fix.v);
    expect(analyze(fixed, NO_RULES).issues.filter((i) => i.kind === "ajuste")).toEqual([]);
    expect(fixed.points.every((p) => p.radius <= 15)).toBe(true);
    expect(fixed.points.some((p) => p.radius < 15)).toBe(true);
  });

  it("no cambia la pista de entrada", () => {
    const copy = JSON.parse(JSON.stringify(TIGHT));
    fitRadii(TIGHT, 0);
    expect(TIGHT).toEqual(copy);
  });
});

describe("cotas", () => {
  const vp = fitViewport(EXAMPLE_TECHNIQUE.board, 800, 600);

  it("dibuja largos de tramo, radios y ángulos de esquina", () => {
    const { ctx, texts } = recorder();
    drawDims(ctx, vp, build(EXAMPLE_TECHNIQUE), 1.9, COLORS);
    expect(texts.some((t) => /^R\d/.test(t))).toBe(true);
    expect(texts.some((t) => /^\d+(,\d)?$/.test(t))).toBe(true);
    // con esquinas vivas se muestran los ángulos
    const sharp = {
      ...EXAMPLE_EIGHT,
      points: EXAMPLE_EIGHT.points.map((p) => ({ ...p, radius: 0 })),
    };
    const r2 = recorder();
    drawDims(r2.ctx, vp, build(sharp), 1.9, COLORS);
    expect(r2.texts.some((t) => t.endsWith("°"))).toBe(true);
  });

  it("omite los radios demasiado pequeños en pantalla", () => {
    const tiny = recorder();
    drawDims(tiny.ctx, { z: 0.05, vx: 0, vy: 0 }, build(EXAMPLE_TECHNIQUE), 1.9, COLORS);
    expect(tiny.texts.filter((t) => /^R/.test(t))).toEqual([]);
  });

  it("drawScene solo dibuja las cotas cuando se piden", () => {
    const analysis = analyze(EXAMPLE_TECHNIQUE, LGR_2026);
    const scene = { track: EXAMPLE_TECHNIQUE, analysis, rules: LGR_2026, issueSel: -1 };
    const off = recorder();
    drawScene(off.ctx, 800, 600, vp, scene, COLORS);
    const on = recorder();
    drawScene(on.ctx, 800, 600, vp, { ...scene, dims: true }, COLORS);
    expect(on.texts.length).toBeGreaterThan(off.texts.length);
  });
});

describe("simulación de vuelta", () => {
  const closed = build(EXAMPLE_TECHNIQUE);
  const start = EXAMPLE_TECHNIQUE.start;
  const open = build({ ...EXAMPLE_TECHNIQUE, closed: false });

  it("no abre si la pista no tiene largo", () => {
    const sim = new TrackSimulation();
    expect(sim.open(build({ ...EXAMPLE_TECHNIQUE, points: [] }), start)).toBe(false);
    expect(sim.getState().on).toBe(false);
  });

  it("abre en la bandera de salida, parado", () => {
    const sim = new TrackSimulation();
    expect(sim.open(closed, start)).toBe(true);
    expect(sim.getState()).toMatchObject({ on: true, playing: false, s: simStartS(closed, start) });
  });

  it("avanza velocidad × tiempo (m/s a cm/s) y limita un cuadro largo", () => {
    const sim = new TrackSimulation();
    sim.open(closed, start);
    sim.toggle(closed);
    const s0 = sim.getState().s;
    sim.tick(closed, 0.02);
    expect(sim.getState().s).toBeCloseTo(s0 + 2, 6);
    sim.tick(closed, 5); // pestaña dormida: cuenta como 0,05 s
    expect(sim.getState().s).toBeCloseTo(s0 + 2 + 5, 6);
  });

  it("en un circuito cerrado da vueltas sin detenerse", () => {
    const sim = new TrackSimulation();
    sim.open(closed, start);
    sim.setParams({ speed: 6 });
    sim.toggle(closed);
    const frames = Math.ceil((closed.L * 1.2) / 30);
    for (let i = 0; i < frames; i++) sim.tick(closed, 0.05);
    expect(sim.getState().playing).toBe(true);
    expect(sim.getState().s).toBeGreaterThan(closed.L);
    const p = sim.progress(closed, start);
    expect(p.fraction).toBeGreaterThanOrEqual(0);
    expect(p.fraction).toBeLessThan(1);
  });

  it("en una pista abierta se detiene al final y reproducir vuelve a empezar", () => {
    const sim = new TrackSimulation();
    sim.open(open, { edge: 0, t: 0 });
    sim.setParams({ speed: 6 });
    sim.toggle(open);
    for (let i = 0; i < Math.ceil(open.L / 30) + 2; i++) sim.tick(open, 0.05);
    expect(sim.getState()).toMatchObject({ playing: false, s: open.L });
    sim.toggle(open);
    expect(sim.getState()).toMatchObject({ playing: true, s: 0 });
  });

  it("seek coloca el robot en una fracción de la vuelta; en pausa no avanza", () => {
    const sim = new TrackSimulation();
    sim.open(closed, start);
    sim.seek(closed, start, 0.5);
    expect(sim.progress(closed, start).fraction).toBeCloseTo(0.5, 3);
    const s = sim.getState().s;
    sim.tick(closed, 0.05);
    expect(sim.getState().s).toBe(s);
  });

  it("ignora velocidades y tamaños fuera de rango o no numéricos", () => {
    const sim = new TrackSimulation();
    sim.setParams({ speed: 0, width: 1, length: 61 });
    sim.setParams({ speed: NaN });
    expect(sim.getState()).toMatchObject({ speed: 1, width: 15, length: 20 });
    sim.setParams({ speed: 2.5, width: 10, length: 30 });
    expect(sim.getState()).toMatchObject({ speed: 2.5, width: 10, length: 30 });
  });

  it("cerrar detiene la reproducción y no modifica la pista", () => {
    const copy = JSON.parse(JSON.stringify(EXAMPLE_TECHNIQUE));
    const sim = new TrackSimulation();
    sim.open(closed, start);
    sim.toggle(closed);
    sim.close();
    expect(sim.getState()).toMatchObject({ on: false, playing: false });
    expect(EXAMPLE_TECHNIQUE).toEqual(copy);
  });

  it("drawScene dibuja el robot (un rectángulo girado) solo con simulación", () => {
    const analysis = analyze(EXAMPLE_TECHNIQUE, LGR_2026);
    const vp = fitViewport(EXAMPLE_TECHNIQUE.board, 800, 600);
    const scene = { track: EXAMPLE_TECHNIQUE, analysis, rules: LGR_2026, issueSel: -1 };
    const off = recorder();
    drawScene(off.ctx, 800, 600, vp, scene, COLORS);
    expect(off.rotations).toEqual([]);
    const on = recorder();
    drawScene(on.ctx, 800, 600, vp, { ...scene, sim: { s: 100, w: 15, l: 20 } }, COLORS);
    expect(on.rotations).toHaveLength(1);
  });
});

describe("importación de JSON", () => {
  /** Sobre v2 del prototipo para una pista de dominio (pts/r/g/w/h/e). */
  const toV2 = (t: Track, profile = "lgr2026") => ({
    app: "trazador-de-pistas",
    v: 2,
    pista: {
      name: t.name,
      board: { w: t.board.widthCm, h: t.board.heightCm },
      closed: t.closed,
      pts: t.points.map((p) => ({ x: p.x, y: p.y, r: p.radius, g: p.gap })),
      zones: t.zones.map((z) => ({ x: z.x, y: z.y, w: z.width, h: z.height, name: z.name })),
      start: { e: t.start.edge, t: t.start.t },
    },
    perfil: { id: profile, name: "x", rules: {} },
  });

  it.each(EXAMPLES.map((e) => [e.name, e] as const))(
    "el ejemplo «%s» exportado en v2 se importa igual, sin id",
    (_name, ex) => {
      const r = parseTrackFile(JSON.stringify(toV2(ex)), ["lgr2026"]);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.track).toEqual({ ...ex, id: null, profileId: "lgr2026" });
      expect(r.notices).toEqual([]);
    },
  );

  it("acepta la pista tal como la exporta la API (objeto plano)", () => {
    const r = parseTrackFile(trackToJson({ ...EXAMPLE_EIGHT, profileId: "lgr2026" }), ["lgr2026"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.track).toEqual({ ...EXAMPLE_EIGHT, id: null, profileId: "lgr2026" });
  });

  it("acepta el sobre {format, version, track}", () => {
    const wire = JSON.parse(trackToJson(EXAMPLE_TECHNIQUE));
    const envelope = { format: "velocista-track", version: 1, track: wire };
    const r = parseTrackFile(JSON.stringify(envelope), []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.track.name).toBe(EXAMPLE_TECHNIQUE.name);
  });

  it("un perfil que no existe en la API se avisa y la pista queda sin perfil", () => {
    const r = parseTrackFile(JSON.stringify(toV2(EXAMPLE_TECHNIQUE, "inventado")), ["lgr2026"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.profileId).toBeNull();
    expect(r.notices.join(" ")).toMatch(/inventado/);
  });

  it("sin perfiles cargados tampoco se asigna el perfil", () => {
    const r = parseTrackFile(JSON.stringify(toV2(EXAMPLE_TECHNIQUE)), null);
    expect(r.ok && r.track.profileId).toBeNull();
  });

  it("un circuito cerrado con menos de 3 puntos queda abierto y se avisa", () => {
    const v2 = toV2({ ...EXAMPLE_TECHNIQUE, points: EXAMPLE_TECHNIQUE.points.slice(0, 2) });
    const r = parseTrackFile(JSON.stringify(v2), []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.closed).toBe(false);
    expect(r.notices.join(" ")).toMatch(/al menos 3 puntos/);
  });

  it("rechaza con un mensaje específico lo que no sirve", () => {
    const fail = (text: string) => {
      const r = parseTrackFile(text, []);
      expect(r.ok).toBe(false);
      return r.ok ? "" : r.message;
    };
    const wire = JSON.parse(trackToJson(EXAMPLE_TECHNIQUE));
    expect(fail("{no es json")).toMatch(/JSON válido/);
    expect(fail("[1,2]")).toMatch(/no contiene una pista/);
    expect(fail("{}")).toMatch(/nombre/);
    expect(fail(JSON.stringify({ name: "x" }))).toMatch(/tablero/);
    expect(fail(JSON.stringify({ name: "x", board: { width_cm: 300, height_cm: 250 } }))).toMatch(
      /points/,
    );
    expect(fail(JSON.stringify({ ...wire, points: [{ x: "a", y: 1 }] }))).toMatch(/punto 1/);
    expect(fail(JSON.stringify({ ...wire, zones: [{ x: 1 }] }))).toMatch(/zona 1/);
    expect(fail(JSON.stringify({ ...wire, board: { width_cm: 10, height_cm: 10 } }))).toMatch(
      /límites.*tablero/,
    );
    expect(fail(JSON.stringify({ ...wire, name: "" }))).toMatch(/nombre/);
    expect(fail(JSON.stringify({ app: "trazador-de-pistas", v: 2, pista: { pts: [] } }))).toMatch(
      /tablero/,
    );
  });

  it("rechaza un archivo de más de 1 MB", () => {
    const r = parseTrackFile(" ".repeat(MAX_IMPORT_BYTES + 1), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/1 MB/);
  });

  it("no usa el contenido como HTML: un nombre con etiquetas queda como texto", () => {
    const wire = { ...JSON.parse(trackToJson(EXAMPLE_TECHNIQUE)), name: "<img src=x onerror=1>" };
    const r = parseTrackFile(JSON.stringify(wire), []);
    expect(r.ok && r.track.name).toBe("<img src=x onerror=1>");
  });
});

describe("PNG del plano", () => {
  afterEach(() => vi.restoreAllMocks());

  const plan = () => ({
    track: EXAMPLE_TECHNIQUE,
    analysis: analyze(EXAMPLE_TECHNIQUE, LGR_2026),
    rules: LGR_2026,
    profileName: "LGR 2026",
    dims: true,
  });

  it("el nombre de archivo lleva el sufijo -plano", () => {
    expect(exportFilename("Técnica 3 × 2,5", "png")).toBe("tecnica-3-2-5-plano.png");
  });

  it("la línea de resumen incluye tablero, largo, recta y estado", () => {
    expect(summaryLine(plan())).toMatch(/300 × 250 cm · línea .* m · recta máx .* cm · LGR 2026: /);
    const bare = { ...plan(), rules: null, profileName: null };
    expect(summaryLine(bare)).toMatch(/sin reglas de pista/);
  });

  it("dibuja en un lienzo fuera de pantalla y devuelve un blob image/png", async () => {
    const { ctx, texts } = recorder();
    const blob = new Blob(["png"], { type: "image/png" });
    const real = document.createElement.bind(document);
    let made: HTMLCanvasElement | null = null;
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = real(tag);
      if (tag === "canvas") {
        made = el as HTMLCanvasElement;
        made.getContext = (() => ctx) as never;
        made.toBlob = ((cb: BlobCallback, type?: string) => {
          expect(type).toBe("image/png");
          cb(blob);
        }) as never;
      }
      return el;
    }) as never);
    const out = await renderPlanPng(plan());
    expect(out).toBe(blob);
    expect(made!.width).toBeGreaterThan(300 * 2);
    expect(texts).toContain(EXAMPLE_TECHNIQUE.name);
    expect(texts.some((t) => /LGR 2026/.test(t))).toBe(true);
  });

  it("falla con un mensaje claro si no se pudo crear la imagen o no hay contexto", async () => {
    const real = document.createElement.bind(document);
    const stub = (patch: (cv: HTMLCanvasElement) => void) =>
      vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
        const el = real(tag);
        if (tag === "canvas") patch(el as HTMLCanvasElement);
        return el;
      }) as never);
    stub((cv) => {
      cv.getContext = (() => recorder().ctx) as never;
      cv.toBlob = ((cb: BlobCallback) => cb(null)) as never;
    });
    await expect(renderPlanPng(plan())).rejects.toThrow(/imagen/);
    vi.restoreAllMocks();
    stub((cv) => {
      cv.getContext = (() => null) as never;
    });
    await expect(renderPlanPng(plan())).rejects.toThrow(/dibujar/);
  });
});
