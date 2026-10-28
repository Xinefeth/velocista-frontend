import { describe, expect, it } from "vitest";
import { RULE_CATALOG, analyze, fmt } from "@/domain/track/rules";
import { fixRadii } from "@/domain/track/commands";
import type { IssueKind, Track, TrackRuleId, TrackRules } from "@/domain/track/types";
import { NO_RULES, withRules } from "./fixtures";

const track = (
  points: [number, number, number?, boolean?][],
  extra: Partial<Track> = {},
): Track => ({
  id: null,
  name: "t",
  board: { widthCm: 300, heightCm: 250 },
  closed: false,
  points: points.map(([x, y, radius = 0, gap = false]) => ({ x, y, radius, gap })),
  zones: [],
  start: { edge: 0, t: 0.5 },
  profileId: null,
  ...extra,
});

const kinds = (t: Track, rules: TrackRules): IssueKind[] => analyze(t, rules).issues.map((i) => i.kind);

describe("catálogo de reglas", () => {
  it("tiene las 13 reglas del contrato en 4 grupos", () => {
    const ids = RULE_CATALOG.flatMap((g) => g.items.map((i) => i.id));
    expect(RULE_CATALOG).toHaveLength(4);
    expect(ids).toHaveLength(13);
    expect(new Set(ids)).toEqual(new Set(Object.keys(NO_RULES.rules)));
  });
});

describe("las 13 reglas: una a la vez (falla y cumple)", () => {
  const rule = (id: TrackRuleId, value: number | boolean) => withRules(NO_RULES, { [id]: [true, value] });

  it("radius_min", () => {
    const pts = (r: number): [number, number, number][] => [[50, 100, 0], [150, 100, r], [150, 200, 0]];
    expect(kinds(track(pts(10)), rule("radius_min", 15))).toContain("radio");
    expect(kinds(track(pts(20)), rule("radius_min", 15))).not.toContain("radio");
  });

  it("angle_min", () => {
    // Esquina viva de 45° (giro de 135°) frente a una de 120°.
    const sharp = track([[100, 50], [200, 50], [129.3, 120.7]]);
    const wide = track([[50, 50], [150, 50], [200, 136.6]]);
    expect(kinds(sharp, rule("angle_min", 90))).toContain("angulo");
    expect(kinds(wide, rule("angle_min", 90))).not.toContain("angulo");
  });

  it("no_sharp", () => {
    const corner = track([[50, 100], [150, 100], [150, 200]]);
    const curved = track([[50, 100], [150, 100, 20], [150, 200]]);
    expect(kinds(corner, rule("no_sharp", true))).toContain("esquina");
    expect(kinds(curved, rule("no_sharp", true))).not.toContain("esquina");
  });

  it("separation_min", () => {
    const thin = (h: number) => track([[50, 100], [250, 100], [250, 100 + h], [50, 100 + h]], { closed: true });
    expect(kinds(thin(10), rule("separation_min", 30))).toContain("separacion");
    expect(kinds(thin(60), rule("separation_min", 30))).not.toContain("separacion");
  });

  it("margin", () => {
    expect(kinds(track([[10, 100], [200, 100]]), rule("margin", 30))).toContain("borde");
    expect(kinds(track([[50, 100], [200, 100]]), rule("margin", 30))).not.toContain("borde");
  });

  it("zone_distance", () => {
    const line: [number, number][] = [[50, 100], [250, 100]];
    const near = track(line, { zones: [{ x: 100, y: 105, width: 20, height: 20, name: "poste" }] });
    const far = track(line, { zones: [{ x: 100, y: 200, width: 20, height: 20, name: "poste" }] });
    expect(kinds(near, rule("zone_distance", 30))).toContain("zona");
    expect(kinds(far, rule("zone_distance", 30))).not.toContain("zona");
  });

  it("closed", () => {
    const pts: [number, number][] = [[50, 50], [250, 50], [250, 200], [50, 200]];
    expect(kinds(track(pts), rule("closed", true))).toContain("cerrado");
    expect(kinds(track(pts, { closed: true }), rule("closed", true))).not.toContain("cerrado");
  });

  it("length_min (en cm) y length_max (en cm)", () => {
    const line = track([[50, 100], [150, 100]]);
    expect(kinds(line, rule("length_min", 500))).toContain("largo");
    expect(kinds(line, rule("length_min", 50))).not.toContain("largo");
    expect(kinds(line, rule("length_max", 50))).toContain("largo");
    expect(kinds(line, rule("length_max", 500))).not.toContain("largo");
    const msg = analyze(line, rule("length_min", 500)).issues[0].msg;
    expect(msg).toBe("La línea mide 1 m (mínimo 5 m)");
  });

  it("straight_min y straight_max", () => {
    const t = track([[50, 100], [150, 100], [150, 105]]);
    expect(kinds(t, rule("straight_min", 10))).toContain("recta");
    expect(kinds(t, rule("straight_min", 3))).not.toContain("recta");
    expect(kinds(t, rule("straight_max", 50))).toContain("recta");
    expect(kinds(t, rule("straight_max", 200))).not.toContain("recta");
  });

  it("cross_max", () => {
    const eight = track(
      [[40, 40, 30], [150, 40], [150, 210, 30], [260, 210, 30], [260, 125, 30], [40, 125, 30]],
      { closed: true },
    );
    expect(kinds(eight, rule("cross_max", 0))).toContain("cruce");
    expect(kinds(eight, rule("cross_max", 1))).not.toContain("cruce");
  });

  it("gap_max", () => {
    const gapped = track([[50, 100], [250, 100, 0, true], [250, 200]]);
    expect(kinds(gapped, rule("gap_max", 0))).toContain("corte");
    expect(kinds(gapped, rule("gap_max", 1))).not.toContain("corte");
  });
});

describe("estructura y ajuste de radio", () => {
  it("avisa de puntos duplicados y de reversa", () => {
    expect(kinds(track([[50, 100], [50, 100], [150, 100]]), NO_RULES)).toContain("forma");
    expect(kinds(track([[50, 100], [150, 100], [60, 100]]), NO_RULES)).toContain("forma");
  });

  it("avisa cuando el radio pedido no entra y `fixRadii` lo corrige", () => {
    const t = track([[50, 100], [100, 100, 40], [100, 110, 40], [150, 110]]);
    const a = analyze(t, NO_RULES);
    const warn = a.issues.find((i) => i.kind === "ajuste");
    expect(warn?.sev).toBe("warn");
    expect(warn?.fix).toBeDefined();
    const fixed = fixRadii(t, 1);
    expect(analyze(fixed, NO_RULES).issues.some((i) => i.kind === "ajuste")).toBe(false);
  });

  it("ordena las incidencias: errores antes que avisos y por tipo", () => {
    const t = track([[50, 100], [100, 100, 40], [100, 110, 40], [150, 110]]);
    const a = analyze(t, withRules(NO_RULES, { closed: [true, true] }));
    expect(a.issues[0].sev).toBe("error");
    expect(a.issues[a.issues.length - 1].sev).toBe("warn");
  });

  it("devuelve un análisis vacío con menos de 2 puntos", () => {
    const a = analyze(track([[50, 100]]), NO_RULES);
    expect(a.issues).toHaveLength(0);
    expect(a.g.L).toBe(0);
  });

  it("formatea con coma decimal", () => {
    expect(fmt(12.34)).toBe("12,3");
    expect(fmt(5)).toBe("5");
  });
});
