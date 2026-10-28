// Catálogo de las 13 reglas de pista y verificación (`analyze`), portados de `Track2`
// (trazador-de-pistas.html, líneas ~596-880). Las reglas llegan de la API (profile.rules.track);
// aquí no hay perfiles propios. Longitudes en cm, `angle_min` en grados.
import { build, crossings, straightRuns } from "@/domain/track/geometry";
import {
  DEG,
  type Analysis,
  type IssueKind,
  type IssueRef,
  type IssueSeverity,
  type Track,
  type TrackIssue,
  type TrackRuleId,
  type TrackRules,
} from "@/domain/track/types";

export type RuleKind = "min" | "max" | "bool" | "count";

export interface RuleDef {
  id: TrackRuleId;
  kind: RuleKind;
  unit: string;
  label: string;
  hint: string;
}

export interface RuleGroup {
  group: string;
  items: RuleDef[];
}

/** Catálogo de reglas en 4 grupos (textos visibles en español). */
export const RULE_CATALOG: RuleGroup[] = [
  {
    group: "Curvas y esquinas",
    items: [
      {
        id: "radius_min",
        kind: "min",
        unit: "cm",
        label: "Radio mínimo de curva",
        hint: "Ninguna curva puede ser más cerrada que este radio.",
      },
      {
        id: "angle_min",
        kind: "min",
        unit: "°",
        label: "Ángulo mínimo en esquinas",
        hint: "Para esquinas sin curva: 90° = escuadra; menos de 90° es una V aguda.",
      },
      {
        id: "no_sharp",
        kind: "bool",
        unit: "",
        label: "Prohibir esquinas sin curva",
        hint: "Toda vuelta tiene que ser una curva con radio.",
      },
    ],
  },
  {
    group: "Espacio",
    items: [
      {
        id: "separation_min",
        kind: "min",
        unit: "cm",
        label: "Separación mínima entre líneas",
        hint: "Medida de centro a centro entre tramos que no son vecinos en el recorrido.",
      },
      {
        id: "margin",
        kind: "min",
        unit: "cm",
        label: "Distancia mínima al borde",
        hint: "Desde el centro de la línea hasta el borde del tablero.",
      },
      {
        id: "zone_distance",
        kind: "min",
        unit: "cm",
        label: "Distancia mínima a zonas",
        hint: "Zonas que dibujas en el plano: logos, postes del cronómetro, rampas.",
      },
    ],
  },
  {
    group: "Recorrido",
    items: [
      {
        id: "closed",
        kind: "bool",
        unit: "",
        label: "Exigir circuito cerrado",
        hint: "La línea tiene que volver a su inicio.",
      },
      {
        id: "length_min",
        kind: "min",
        unit: "cm",
        label: "Largo total mínimo",
        hint: "Largo de la línea en una vuelta.",
      },
      { id: "length_max", kind: "max", unit: "cm", label: "Largo total máximo", hint: "" },
      {
        id: "straight_min",
        kind: "min",
        unit: "cm",
        label: "Recta mínima",
        hint: "Cada tramo recto entre curvas debe medir al menos esto.",
      },
      {
        id: "straight_max",
        kind: "max",
        unit: "cm",
        label: "Recta máxima",
        hint: "Ningún tramo recto puede pasar de esto.",
      },
    ],
  },
  {
    group: "Elementos",
    items: [
      {
        id: "cross_max",
        kind: "count",
        unit: "cruces",
        label: "Máximo de cruces",
        hint: "0 = la línea no puede cruzarse a sí misma.",
      },
      {
        id: "gap_max",
        kind: "count",
        unit: "cortes",
        label: "Máximo de cortes en la línea",
        hint: "0 = la línea no puede tener interrupciones.",
      },
    ],
  },
];

/** Orden de los tipos de incidencia en la lista (igual que el prototipo). */
export const ISSUE_ORDER: IssueKind[] = [
  "forma",
  "ajuste",
  "cerrado",
  "borde",
  "zona",
  "separacion",
  "radio",
  "angulo",
  "esquina",
  "cruce",
  "corte",
  "recta",
  "largo",
];

/**
 * Reglas con todo desactivado: sirven para medir la geometría (largo, curvas, rectas) cuando el perfil
 * elegido no tiene reglas de pista. No es un perfil: no verifica nada.
 */
export const GEOMETRY_ONLY_RULES: TrackRules = {
  lineWidthMm: 19,
  gapLengthCm: 2,
  rules: Object.fromEntries(
    RULE_CATALOG.flatMap((g) => g.items).map((d) => [
      d.id,
      { enabled: false, value: d.kind === "bool" ? true : 0 },
    ]),
  ) as TrackRules["rules"],
};

/** Formato numérico en español: un decimal y coma. */
export const fmt = (v: number): string => (Math.round(v * 10) / 10).toString().replace(".", ",");

function srcRef(src: string | null | undefined): IssueRef | null {
  if (!src) return null;
  const k = src[0];
  const i = +src.slice(1);
  return k === "v" ? { v: i } : { e: i };
}

/** Verifica la pista contra las reglas de un perfil: incidencias y estadísticas. */
export function analyze(track: Track, profile: TrackRules): Analysis {
  const g = build(track);
  const rules = profile.rules;
  const issues: TrackIssue[] = [];
  const tol = 0.3;
  const add = (
    sev: IssueSeverity,
    kind: IssueKind,
    msg: string,
    x: number | null,
    y: number | null,
    ref: IssueRef | null,
  ): TrackIssue => {
    const issue: TrackIssue = { sev, kind, msg, x, y, ref };
    issues.push(issue);
    return issue;
  };
  const on = (id: TrackRuleId) => !!rules[id] && rules[id].enabled;
  const val = (id: TrackRuleId) => +rules[id].value;
  const n = track.points.length;
  const W = track.board.widthCm;
  const H = track.board.heightCm;
  const stats = {
    length: g.L,
    straight: { L: 0 },
    sepMin: Infinity,
    edgeMin: Infinity,
    crossings: 0,
    corners: g.corners.length,
    curves: g.arcs.length,
    radiusMin: Infinity,
    points: n,
    gaps: g.gaps.length,
  };
  if (n < 2) return { g, issues, stats, cross: [] };

  // Estructura
  g.V.forEach((v, i) => {
    const p = track.points[i];
    if (v.bad === "reversa")
      add("error", "forma", "La línea se devuelve sobre sí misma en este punto", p.x, p.y, {
        v: i,
      });
    else if (v.bad === "dup")
      add("error", "forma", "Dos puntos están en el mismo lugar", p.x, p.y, { v: i });
    else if (v.r > 0 && v.r - v.rEff > 0.15) {
      const issue = add(
        "warn",
        "ajuste",
        `Pediste R ${fmt(v.r)} pero solo entra R ${fmt(v.rEff)}: los puntos vecinos están muy cerca`,
        p.x,
        p.y,
        { v: i },
      );
      issue.fix = { v: i, r: Math.floor(v.rEff * 10) / 10 };
    }
  });
  if (on("closed") && !g.closed)
    add(
      "error",
      "cerrado",
      "El circuito no está cerrado",
      track.points[n - 1].x,
      track.points[n - 1].y,
      { v: n - 1 },
    );

  // Curvas y esquinas
  for (const a of g.arcs) {
    stats.radiusMin = Math.min(stats.radiusMin, a.r);
    if (on("radius_min") && a.r < val("radius_min") - tol) {
      const p = track.points[a.v];
      add(
        "error",
        "radio",
        `Curva de radio ${fmt(a.r)} cm (mínimo ${fmt(val("radius_min"))})`,
        p.x,
        p.y,
        { v: a.v },
      );
    }
  }
  for (const c of g.corners) {
    if (on("no_sharp") && rules.no_sharp.value)
      add(
        "error",
        "esquina",
        `Esquina sin curva de ${Math.round(c.a)}° (deben tener radio)`,
        c.x,
        c.y,
        { v: c.v },
      );
    else if (on("angle_min") && c.a < val("angle_min") - 0.5)
      add(
        "error",
        "angulo",
        `Esquina de ${Math.round(c.a)}° (mínimo ${fmt(val("angle_min"))}°)`,
        c.x,
        c.y,
        { v: c.v },
      );
  }

  // Cruces
  const cross = crossings(g.pts, g.closed);
  stats.crossings = cross.length;
  if (on("cross_max") && cross.length > val("cross_max")) {
    cross.forEach((c) =>
      add(
        "error",
        "cruce",
        val("cross_max") === 0
          ? "La línea se cruza (no permitido)"
          : `Cruce de más: ${cross.length} de ${fmt(val("cross_max"))} permitidos`,
        c.x,
        c.y,
        null,
      ),
    );
  }

  // Cortes
  g.gaps.forEach((gp) => {
    if (gp.room < profile.gapLengthCm + 1)
      add("error", "forma", "El corte no cabe en este tramo recto", gp.x, gp.y, { e: gp.e });
  });
  if (on("gap_max") && g.gaps.length > val("gap_max")) {
    g.gaps.forEach((gp) =>
      add(
        "error",
        "corte",
        val("gap_max") === 0
          ? "Corte en la línea (no permitido)"
          : `Cortes de más: ${g.gaps.length} de ${fmt(val("gap_max"))} permitidos`,
        gp.x,
        gp.y,
        { e: gp.e },
      ),
    );
  }

  // Separación entre líneas
  const sep = on("separation_min") ? val("separation_min") : 0;
  const pts = g.pts;
  const Ltot = g.L;
  const sepRef = sep || 30;
  const Tarc = 1.65 * sepRef;
  const zones: { x: number; y: number; r: number }[] = cross.map((c) => ({
    x: c.x,
    y: c.y,
    r: sepRef,
  }));
  for (const c of g.corners)
    if (c.a < 90)
      zones.push({ x: c.x, y: c.y, r: Math.min(3, 1.05 / Math.sin(c.a * DEG)) * sepRef });
  if (!g.closed) zones.push({ x: pts[0].x, y: pts[0].y, r: sepRef * 0.6 });
  const inZ = (q: { x: number; y: number }, z: { x: number; y: number; r: number }) =>
    Math.hypot(q.x - z.x, q.y - z.y) < z.r + tol;
  const cell = sepRef;
  const hash = new Map<string, number[]>();
  pts.forEach((q, i) => {
    const k = Math.floor(q.x / cell) + ":" + Math.floor(q.y / cell);
    const list = hash.get(k);
    if (list) list.push(i);
    else hash.set(k, [i]);
  });
  const hits = new Map<string, { d: number; x: number; y: number; src: string }>();
  pts.forEach((q, i) => {
    const gx = Math.floor(q.x / cell);
    const gy = Math.floor(q.y / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const b = hash.get(gx + dx + ":" + (gy + dy));
        if (!b) continue;
        for (const j of b) {
          if (j <= i) continue;
          const r = pts[j];
          const d = Math.hypot(q.x - r.x, q.y - r.y);
          if (d >= sepRef * 1.5) continue;
          let ds = Math.abs(q.s - r.s);
          if (g.closed) ds = Math.min(ds, Ltot - ds);
          if (ds < Tarc) continue;
          if (zones.some((z) => inZ(q, z) && inZ(r, z))) continue;
          if (d < stats.sepMin) stats.sepMin = d;
          if (sep && d < sep - tol) {
            const k = [q.src, r.src].sort().join("|");
            const h = hits.get(k);
            if (!h || d < h.d)
              hits.set(k, { d, x: (q.x + r.x) / 2, y: (q.y + r.y) / 2, src: q.src });
          }
        }
      }
  });
  for (const h of hits.values())
    add(
      "error",
      "separacion",
      `Líneas a ${fmt(h.d)} cm (mínimo ${fmt(sep)})`,
      h.x,
      h.y,
      srcRef(h.src),
    );

  // Borde del tablero
  const edgeHits = new Map<string, { d: number; x: number; y: number }>();
  for (const q of pts) {
    const d = Math.min(q.x, W - q.x, q.y, H - q.y);
    stats.edgeMin = Math.min(stats.edgeMin, d);
    if (d < (on("margin") ? val("margin") : 0) - tol || d < -tol) {
      const h = edgeHits.get(q.src);
      if (!h || d < h.d) edgeHits.set(q.src, { d, x: q.x, y: q.y });
    }
  }
  for (const [src, h] of edgeHits)
    add(
      "error",
      "borde",
      h.d < 0
        ? "La línea se sale del tablero"
        : `Línea a ${fmt(h.d)} cm del borde (mínimo ${fmt(val("margin"))})`,
      h.x,
      h.y,
      srcRef(src),
    );

  // Zonas
  track.zones.forEach((z, zi) => {
    let best: { d: number; x: number; y: number } | null = null;
    for (const q of pts) {
      const dx = Math.max(z.x - q.x, 0, q.x - (z.x + z.width));
      const dy = Math.max(z.y - q.y, 0, q.y - (z.y + z.height));
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { d, x: q.x, y: q.y };
    }
    if (!best) return;
    const need = on("zone_distance") ? val("zone_distance") : 0;
    if (best.d < 1e-6)
      add("error", "zona", `La línea pasa por ${z.name || "una zona"}`, best.x, best.y, { z: zi });
    else if (best.d < need - tol)
      add(
        "error",
        "zona",
        `Línea a ${fmt(best.d)} cm de ${z.name || "una zona"} (mínimo ${fmt(need)})`,
        best.x,
        best.y,
        { z: zi },
      );
  });

  // Rectas
  const runs = straightRuns(g);
  runs.forEach((r) => {
    if (r.L > stats.straight.L) stats.straight = r;
  });
  if (on("straight_min"))
    runs.forEach((r) => {
      if (r.L > 0.5 && r.L < val("straight_min") - tol)
        add(
          "error",
          "recta",
          `Recta de ${fmt(r.L)} cm (mínimo ${fmt(val("straight_min"))})`,
          r.mx,
          r.my,
          srcRef(r.src),
        );
    });
  if (on("straight_max"))
    runs.forEach((r) => {
      if (r.L > val("straight_max") + tol)
        add(
          "error",
          "recta",
          `Recta de ${fmt(r.L)} cm (máximo ${fmt(val("straight_max"))})`,
          r.mx,
          r.my,
          srcRef(r.src),
        );
    });

  // Largo total: la regla está en cm; en el mensaje se muestran metros.
  if (on("length_min") && g.L < val("length_min") - 1e-4)
    add(
      "error",
      "largo",
      `La línea mide ${fmt(g.L / 100)} m (mínimo ${fmt(val("length_min") / 100)} m)`,
      null,
      null,
      null,
    );
  if (on("length_max") && g.L > val("length_max") + 1e-4)
    add(
      "error",
      "largo",
      `La línea mide ${fmt(g.L / 100)} m (máximo ${fmt(val("length_max") / 100)} m)`,
      null,
      null,
      null,
    );

  issues.sort(
    (a, b) =>
      (a.sev === b.sev ? 0 : a.sev === "error" ? -1 : 1) ||
      ISSUE_ORDER.indexOf(a.kind) - ISSUE_ORDER.indexOf(b.kind),
  );
  return { g, issues, stats, cross };
}
