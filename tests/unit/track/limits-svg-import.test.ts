import { describe, expect, it } from "vitest";
import { TRACK_LIMITS, lengthCmOf, normalizeTrack, validateTrack } from "@/domain/track/limits";
import { escapeXml, splitGaps, toSVG } from "@/domain/track/svg";
import { TrackImportError, fromPrototypeV2, isPrototypeV2 } from "@/domain/track/prototypeV2";
import { build } from "@/domain/track/geometry";
import { EXAMPLE_EIGHT, EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import type { Track } from "@/domain/track/types";
import { FREE_TRAINING, LGR_2026 } from "./fixtures";

const ok: Track = { ...EXAMPLE_TECHNIQUE, id: null };
const paths = (t: Track) => validateTrack(t).map((e) => e.path);

describe("límites antes de enviar", () => {
  it("una pista válida no tiene errores y el largo se redondea a 0,01", () => {
    expect(validateTrack(ok)).toEqual([]);
    expect(lengthCmOf(ok)).toBe(833.45);
  });

  it("nombre: 1..80 caracteres tras recortar", () => {
    expect(paths({ ...ok, name: "   " })).toContain("name");
    expect(paths({ ...ok, name: "x".repeat(81) })).toContain("name");
    expect(paths({ ...ok, name: "x".repeat(80) })).not.toContain("name");
  });

  it("puntos 2..500 y zonas 0..100", () => {
    expect(paths({ ...ok, points: ok.points.slice(0, 1), closed: false })).toContain("points");
    const many = Array.from({ length: 501 }, (_, i) => ({ x: i, y: 10, radius: 0, gap: false }));
    expect(paths({ ...ok, points: many, closed: false })).toContain("points");
    const zones = Array.from({ length: 101 }, () => ({ x: 1, y: 1, width: 2, height: 2, name: "" }));
    expect(paths({ ...ok, zones })).toContain("zones");
  });

  it("tablero 50..2000 cm por lado", () => {
    expect(paths({ ...ok, board: { widthCm: 49, heightCm: 250 } })).toContain("board.width_cm");
    expect(paths({ ...ok, board: { widthCm: 300, heightCm: 2001 } })).toContain("board.height_cm");
    expect(paths({ ...ok, board: { widthCm: 50, heightCm: 2000 } })).toEqual([]);
  });

  it("radio 0..200 y coordenadas finitas con |valor| ≤ 10000 (pueden estar fuera del tablero)", () => {
    const withPoint = (p: Partial<Track["points"][number]>): Track => ({
      ...ok,
      points: ok.points.map((q, i) => (i === 3 ? { ...q, ...p } : q)),
    });
    expect(paths(withPoint({ radius: 201 }))).toContain("points[3].radius");
    expect(paths(withPoint({ radius: -1 }))).toContain("points[3].radius");
    expect(paths(withPoint({ x: 10001 }))).toContain("points[3].x");
    expect(paths(withPoint({ y: NaN }))).toContain("points[3].y");
    expect(paths(withPoint({ x: -500, y: 900 }))).toEqual([]);
  });

  it("zonas: ancho y alto en (0, 2000], nombre ≤ 80", () => {
    const withZone = (z: Partial<Track["zones"][number]>): Track => ({
      ...ok,
      zones: [{ x: 1, y: 1, width: 5, height: 5, name: "", ...z }],
    });
    expect(paths(withZone({ width: 0 }))).toContain("zones[0].width");
    expect(paths(withZone({ height: 2001 }))).toContain("zones[0].height");
    expect(paths(withZone({ name: "n".repeat(81) }))).toContain("zones[0].name");
    expect(paths(withZone({}))).toEqual([]);
  });

  it("salida: t en 0..1 y edge entero 0..(puntos−1) si es cerrada, 0..(puntos−2) si es abierta", () => {
    expect(paths({ ...ok, start: { edge: 0, t: 1.2 } })).toContain("start.t");
    expect(paths({ ...ok, start: { edge: 11, t: 0.5 } })).toEqual([]);
    expect(paths({ ...ok, start: { edge: 12, t: 0.5 } })).toContain("start.edge");
    expect(paths({ ...ok, start: { edge: 0.5, t: 0.5 } })).toContain("start.edge");
    const open: Track = { ...ok, closed: false };
    expect(paths({ ...open, start: { edge: 10, t: 0.5 } })).toEqual([]);
    expect(paths({ ...open, start: { edge: 11, t: 0.5 } })).toContain("start.edge");
  });

  it("circuito cerrado con menos de 3 puntos", () => {
    const two: Track = { ...ok, closed: true, points: ok.points.slice(0, 2), start: { edge: 0, t: 0.5 } };
    expect(paths(two)).toContain("closed");
  });

  it("largo mayor que 0 y hasta 100000 cm", () => {
    const same: Track = { ...ok, closed: false, points: [ok.points[0], { ...ok.points[0] }] };
    expect(paths(same)).toContain("length_cm");
    expect(TRACK_LIMITS.lengthCmMax).toBe(100000);
  });
});

describe("normalizeTrack", () => {
  it("abre un circuito cerrado con menos de 3 puntos y avisa", () => {
    const two: Track = { ...ok, closed: true, points: ok.points.slice(0, 2) };
    const r = normalizeTrack(two);
    expect(r.track.closed).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(validateTrack(r.track)).toEqual([]);
  });

  it("reinicia la salida fuera de rango y recorta t", () => {
    const r = normalizeTrack({ ...ok, start: { edge: 99, t: 7 } });
    expect(r.track.start).toEqual({ edge: 0, t: 0.5 });
    expect(r.warnings).toHaveLength(1);
    expect(normalizeTrack({ ...ok, start: { edge: 1, t: 7 } }).track.start).toEqual({ edge: 1, t: 1 });
  });

  it("no toca una pista válida", () => {
    const r = normalizeTrack(ok);
    expect(r.track).toEqual(ok);
    expect(r.warnings).toEqual([]);
  });
});

describe("SVG 1:1", () => {
  it("usa centímetros, el ancho de línea del perfil y marcas de esquina", () => {
    const svg = toSVG(EXAMPLE_TECHNIQUE, LGR_2026);
    expect(svg).toContain('width="300cm" height="250cm" viewBox="0 0 300 250"');
    expect(svg).toContain('stroke-width="1.9"');
    expect(svg).toContain("<polyline");
    expect((svg.match(/<path d="M/g) ?? []).length).toBe(4);
    expect(svg).not.toContain("<rect x=");
  });

  it("la variante con zonas dibuja el rectángulo punteado", () => {
    const svg = toSVG(EXAMPLE_TECHNIQUE, LGR_2026, { zones: true });
    expect(svg).toContain('stroke-dasharray="1 1"');
    expect(svg).toContain('<rect x="104" y="238" width="12" height="12"');
  });

  it("corta la línea donde hay un corte", () => {
    const a = toSVG(EXAMPLE_EIGHT, FREE_TRAINING);
    const g = build(EXAMPLE_EIGHT);
    expect((a.match(/<polyline/g) ?? []).length).toBe(splitGaps(g.pts.concat([g.pts[0]]), g.gaps, 2).length);
    expect((a.match(/<polyline/g) ?? []).length).toBeGreaterThan(1);
  });

  it("escapa texto para XML", () => {
    expect(escapeXml(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&apos;");
  });

  it("es determinista", () => {
    expect(toSVG(EXAMPLE_EIGHT, FREE_TRAINING)).toBe(toSVG(EXAMPLE_EIGHT, FREE_TRAINING));
  });
});

describe("importación del formato v2 del prototipo", () => {
  const v2 = {
    app: "trazador-de-pistas",
    v: 2,
    pista: {
      name: "Técnica 3 × 2,5",
      board: { w: 300, h: 250 },
      closed: true,
      pts: [
        { x: 50, y: 45, r: 25 },
        { x: 250, y: 45, r: 45, g: true },
        { x: 250, y: 205, r: 25 },
      ],
      zones: [{ x: 104, y: 0, w: 12, h: 12, name: "poste" }],
      start: { e: 1, t: 0.35 },
    },
    perfil: { id: "lgr2026", name: "Let's Go Robot 2026", rules: { radiusMin: { on: true, v: 15 } } },
  };

  it("reconoce el sobre y lo traduce al contrato", () => {
    expect(isPrototypeV2(v2)).toBe(true);
    const r = fromPrototypeV2(v2);
    expect(r.profileId).toBe("lgr2026");
    expect(r.track).toEqual({
      id: null,
      name: "Técnica 3 × 2,5",
      board: { widthCm: 300, heightCm: 250 },
      closed: true,
      points: [
        { x: 50, y: 45, radius: 25, gap: false },
        { x: 250, y: 45, radius: 45, gap: true },
        { x: 250, y: 205, radius: 25, gap: false },
      ],
      zones: [{ x: 104, y: 0, width: 12, height: 12, name: "poste" }],
      start: { edge: 1, t: 0.35 },
      profileId: null,
    });
  });

  it("acepta la pista sin sobre y usa valores por defecto", () => {
    const r = fromPrototypeV2({ pts: [{ x: 1, y: 2 }], board: { w: 100, h: 100 } });
    expect(r.track.name).toBe("Pista importada");
    expect(r.track.start).toEqual({ edge: 0, t: 0.5 });
    expect(r.track.points[0]).toEqual({ x: 1, y: 2, radius: 0, gap: false });
    expect(r.profileId).toBeNull();
  });

  it("rechaza archivos que no son del trazador con un mensaje claro", () => {
    expect(() => fromPrototypeV2(null)).toThrow(TrackImportError);
    expect(() => fromPrototypeV2({ board: { w: 1, h: 1 } })).toThrow(/pts/);
    expect(() => fromPrototypeV2({ pts: [] })).toThrow(/tablero/);
    expect(() => fromPrototypeV2({ pts: [], board: { w: "a" } })).toThrow(/ancho y alto/);
    expect(() => fromPrototypeV2({ pts: [{ x: 1 }], board: { w: 1, h: 1 } })).toThrow(/punto 1/);
    expect(isPrototypeV2({ app: "otra" })).toBe(false);
  });

  it("el resultado de importar pasa la validación o dice qué falla", () => {
    expect(validateTrack(normalizeTrack(fromPrototypeV2(v2).track).track)).toEqual([]);
  });
});
