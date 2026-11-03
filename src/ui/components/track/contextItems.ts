// Contenido del menú contextual (clic derecho) del plano, portado de `contextFor`/`transformItems`
// del prototipo. Es una función pura: devuelve una lista de ítems y cada ítem lleva su acción.
import type { EditorOptions } from "@/application/state/trackEditorStore";
import {
  closeTrack,
  deletePoints,
  deleteSelection,
  duplicateZone,
  insertPointAt,
  newZone,
  reverseTrack,
  setEdgeLength,
  setRadius,
  setStartAt,
  toggleGap,
} from "@/domain/track/commands";
import { edgesOf } from "@/domain/track/geometry";
import { fmt } from "@/domain/track/rules";
import {
  EMPTY_SELECTION,
  edgeSelection,
  groupSize,
  selectAll,
  selectionTarget,
  type Selection,
} from "@/domain/track/selection";
import { snapPoint } from "@/domain/track/snap";
import { TEMPLATES, insertTemplate } from "@/domain/track/templates";
import { allTarget, mirror, rotate, scale, type Target } from "@/domain/track/transforms";
import { DEG, type Geometry, type Track } from "@/domain/track/types";
import type { MenuRequest } from "@/ui/components/track/TrackCanvasController";

export type MenuItem =
  | { kind: "header"; label: string }
  | { kind: "separator" }
  | { kind: "action"; label: string; kbd?: string; danger?: boolean; run: () => void }
  | {
      kind: "field";
      label: string;
      value: number;
      unit: string;
      /** Botón principal (aplica el valor); si hay `buttons`, se usan esos en su lugar. */
      run: (value: number) => void;
      buttons?: { text: string; title: string; run: (value: number) => void }[];
    }
  | { kind: "buttons"; label: string; buttons: { text: string; title: string; run: () => void }[] };

export interface MenuContext {
  request: MenuRequest;
  track: Track;
  selection: Selection;
  geometry: Geometry;
  options: EditorOptions;
  apply: (track: Track, selection?: Selection) => void;
  setSelection: (selection: Selection) => void;
  fit: () => void;
  notify: (message: string) => void;
}

/** Ítems de transformación para un objetivo (la selección o toda la pista). */
export function transformItems(ctx: MenuContext, target: Target, whole: boolean): MenuItem[] {
  const { track, options, apply } = ctx;
  const n = target.v.length + target.z.length;
  const step = options.angStep > 0 ? options.angStep : 15;
  return [
    { kind: "header", label: whole ? "Toda la pista" : `Selección · ${n} objetos` },
    {
      kind: "field",
      label: "Girar",
      value: step,
      unit: "°",
      run: (v) => apply(rotate(track, target, v)),
      buttons: [
        { text: "↺", title: "Girar a la izquierda", run: (v) => apply(rotate(track, target, v)) },
        { text: "↻", title: "Girar a la derecha", run: (v) => apply(rotate(track, target, -v)) },
      ],
    },
    {
      kind: "field",
      label: "Escalar",
      value: 100,
      unit: "%",
      run: (v) => {
        if (v > 0) apply(scale(track, target, v / 100));
      },
    },
    {
      kind: "buttons",
      label: "Espejo",
      buttons: [
        { text: "↔", title: "Horizontal", run: () => apply(mirror(track, target, "h")) },
        { text: "↕", title: "Vertical", run: () => apply(mirror(track, target, "v")) },
      ],
    },
    ...(target.v.length
      ? [
          {
            kind: "field" as const,
            label: "Radio de todos",
            value: options.radius,
            unit: "cm",
            run: (v: number) => apply(setRadius(track, target.v, v)),
          },
        ]
      : []),
  ];
}

/** Menú contextual para lo que hay bajo el puntero (punto, curva, tramo, zona, grupo o vacío). */
export function buildMenu(ctx: MenuContext): MenuItem[] {
  const { request, track, selection, geometry, options, apply } = ctx;
  const { hit, world } = request;
  const [wx, wy] = world;
  const items: MenuItem[] = [];
  const del = (label: string): MenuItem => ({
    kind: "action",
    label,
    kbd: "Supr",
    danger: true,
    run: () => apply(deleteSelection(track, selection), EMPTY_SELECTION),
  });

  if (hit.type === "v" || hit.type === "arc") {
    const i = hit.i;
    if (groupSize(selection) >= 2) {
      items.push(
        ...transformItems(ctx, selectionTarget(selection), false),
        { kind: "separator" },
        del("Borrar selección"),
      );
      return items;
    }
    const pt = track.points[i];
    const V = geometry.V[i];
    items.push({
      kind: "header",
      label: `Punto ${i + 1}${V && V.turn ? ` · giro ${Math.round(Math.abs(V.turn) / DEG)}°` : ""}`,
    });
    items.push({
      kind: "field",
      label: "Radio",
      value: pt.radius,
      unit: "cm",
      run: (v) => apply(setRadius(track, [i], v)),
    });
    items.push({
      kind: "buttons",
      label: "Rápido",
      buttons: [0, 15, 30, 45].map((r) => ({
        text: r ? `R${r}` : "Sin curva",
        title: r ? `Radio ${r} cm` : "Esquina viva",
        run: () => apply(setRadius(track, [i], r)),
      })),
    });
    if (!track.closed && i === track.points.length - 1 && track.points.length >= 3)
      items.push({
        kind: "action",
        label: "Cerrar circuito aquí",
        run: () => {
          const closed = closeTrack(track);
          if (closed) apply(closed);
        },
      });
    items.push({ kind: "separator" }, ...transformItems(ctx, allTarget(track), true));
    items.push(
      {
        kind: "separator",
      },
      {
        kind: "action",
        label: "Borrar punto",
        kbd: "Supr",
        danger: true,
        run: () => apply(deletePoints(track, [i]), EMPTY_SELECTION),
      },
    );
    return items;
  }

  if (hit.type === "e") {
    const ei = hit.i;
    const edge = edgesOf(track)[ei];
    if (!edge) return items;
    const A = track.points[edge[0]];
    const B = track.points[edge[1]];
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    items.push({ kind: "header", label: `Tramo ${ei + 1} · ${fmt(L)} cm entre puntos` });
    items.push({
      kind: "action",
      label: "Agregar punto aquí",
      kbd: "doble clic",
      run: () => {
        const r = insertPointAt(track, ei, wx, wy, options.radius);
        if (r) apply(r.track, { points: [r.index], edge: null, zones: [] });
      },
    });
    items.push({
      kind: "field",
      label: "Largo",
      value: Math.round(L * 10) / 10,
      unit: "cm",
      run: (v) => {
        if (v > 0) apply(setEdgeLength(track, ei, v), edgeSelection(track, ei));
      },
    });
    items.push({
      kind: "action",
      label: A.gap ? "Quitar el corte" : "Poner un corte en este tramo",
      run: () => apply(toggleGap(track, edge[0])),
    });
    items.push({
      kind: "action",
      label: "Poner la salida aquí",
      run: () => apply(setStartAt(track, ei, wx, wy)),
    });
    items.push({ kind: "header", label: "Insertar plantilla hacia este lado" });
    items.push({
      kind: "buttons",
      label: "Plantillas",
      buttons: TEMPLATES.map((t) => ({
        text: t.name,
        title: t.hint,
        run: () => {
          const side = (B.x - A.x) * (wy - A.y) - (B.y - A.y) * (wx - A.x) >= 0 ? 1 : -1;
          const r = insertTemplate(track, ei, wx, wy, t.id, side);
          if (r) {
            apply(r.track, {
              points: Array.from({ length: r.count }, (_, k) => r.from + k),
              edge: null,
              zones: [],
            });
            ctx.notify(`${t.name} insertada.`);
          }
        },
      })),
    });
    items.push(
      { kind: "separator" },
      {
        kind: "action",
        label: "Invertir el sentido",
        run: () => apply(reverseTrack(track), EMPTY_SELECTION),
      },
    );
    items.push({ kind: "separator" }, ...transformItems(ctx, allTarget(track), true));
    return items;
  }

  if (hit.type === "z" || hit.type === "zr") {
    const zn = track.zones[hit.i];
    if (!zn) return items;
    items.push({ kind: "header", label: zn.name || "Zona" });
    items.push({
      kind: "action",
      label: "Duplicar zona",
      run: () => {
        const next = duplicateZone(track, hit.i);
        if (next) apply(next, { points: [], edge: null, zones: [next.zones.length - 1] });
        else ctx.notify("Máximo 100 zonas por pista.");
      },
    });
    items.push({
      kind: "action",
      label: "Borrar zona",
      kbd: "Supr",
      danger: true,
      run: () => apply(deleteSelection(track, { points: [], zones: [hit.i] }), EMPTY_SELECTION),
    });
    return items;
  }

  // Vacío (o un grupo): acciones generales
  if (groupSize(selection) >= 2) {
    items.push(
      ...transformItems(ctx, selectionTarget(selection), false),
      { kind: "separator" },
      del("Borrar selección"),
      { kind: "separator" },
    );
  }
  if (!track.closed && track.points.length >= 3)
    items.push({
      kind: "action",
      label: "Cerrar circuito",
      run: () => {
        const closed = closeTrack(track);
        if (closed) apply(closed);
      },
    });
  if (track.points.length)
    items.push({
      kind: "action",
      label: "Seleccionar todo",
      kbd: "Ctrl A",
      run: () => ctx.setSelection(selectAll(track)),
    });
  const inside = wx >= 0 && wy >= 0 && wx <= track.board.widthCm && wy <= track.board.heightCm;
  if (inside)
    items.push({
      kind: "action",
      label: "Nueva zona prohibida aquí",
      run: () => {
        const [x, y] = snapPoint(wx, wy, options);
        const next = newZone(track, x - 10, y - 10, x + 10, y + 10);
        if (next) apply(next, { points: [], edge: null, zones: [next.zones.length - 1] });
        else ctx.notify("Máximo 100 zonas por pista.");
      },
    });
  items.push({ kind: "action", label: "Ajustar vista", kbd: "0", run: ctx.fit });
  if (track.points.length >= 2 && groupSize(selection) < 2)
    items.push({ kind: "separator" }, ...transformItems(ctx, allTarget(track), true));
  return items;
}
