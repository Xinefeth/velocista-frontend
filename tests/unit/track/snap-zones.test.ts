import { describe, expect, it } from "vitest";
import { angleSnap, snapPoint, DEFAULT_SNAP } from "@/domain/track/snap";
import {
  MIN_ZONE_CM,
  blankTrack,
  deleteSelection,
  duplicateZone,
  moveZoneTo,
  newZone,
  resizeZone,
  setStartAt,
  setZone,
} from "@/domain/track/commands";
import { EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import type { Track } from "@/domain/track/types";

describe("ajuste a la rejilla y al ángulo", () => {
  const on = { snap: true, step: 5, angStep: 15 };

  it("redondea al paso de la rejilla y se desactiva con Alt o apagado", () => {
    expect(DEFAULT_SNAP).toEqual({ snap: true, step: 5, angStep: 15 });
    expect(snapPoint(101.9, 63.2, on)).toEqual([100, 65]);
    expect(snapPoint(101.9, 63.2, on, true)).toEqual([101.9, 63.2]);
    expect(snapPoint(101.9, 63.2, { ...on, snap: false })).toEqual([101.9, 63.2]);
    expect(snapPoint(7, 7, { ...on, step: 0 })).toEqual([7, 7]);
    expect(snapPoint(7, 12, { ...on, step: 10 })).toEqual([10, 10]);
  });

  it("el ángulo se redondea al múltiplo más cercano y el largo a la rejilla", () => {
    const [x, y] = angleSnap({ x: 0, y: 0 }, 90, 20, on); // 12,5° → 15°
    expect(Math.atan2(y, x) * (180 / Math.PI)).toBeCloseTo(15, 6);
    expect(Math.hypot(x, y)).toBeCloseTo(90, 6); // 92,2 → 90 (múltiplo de 5)
  });

  it("sin rejilla conserva el largo; con otro paso de ángulo cambia el resultado", () => {
    const [x, y] = angleSnap({ x: 10, y: 10 }, 110, 12, { snap: false, step: 5, angStep: 45 });
    expect(Math.atan2(y - 10, x - 10) * (180 / Math.PI)).toBeCloseTo(0, 6);
    expect(Math.hypot(x - 10, y - 10)).toBeCloseTo(Math.hypot(100, 2), 6);
  });

  it("un paso de ángulo inválido usa 15°", () => {
    const [x, y] = angleSnap({ x: 0, y: 0 }, 100, 30, { snap: false, step: 5, angStep: 0 });
    expect(Math.atan2(y, x) * (180 / Math.PI)).toBeCloseTo(15, 6);
  });
});

describe("zonas", () => {
  const base = blankTrack();

  it("crea una zona desde dos esquinas en cualquier orden, con nombre numerado", () => {
    const t = newZone(base, 140, 130, 100, 100)!;
    expect(t.zones).toEqual([{ x: 100, y: 100, width: 40, height: 30, name: "zona 1" }]);
    expect(newZone(t, 0, 0, 10, 10)!.zones[1].name).toBe("zona 2");
  });

  it("rechaza zonas muy pequeñas y más de 100 zonas", () => {
    expect(newZone(base, 0, 0, MIN_ZONE_CM - 0.1, 50)).toBeNull();
    expect(newZone(base, 0, 0, 50, 1)).toBeNull();
    const full: Track = {
      ...base,
      zones: Array.from({ length: 100 }, () => ({ x: 0, y: 0, width: 5, height: 5, name: "z" })),
    };
    expect(newZone(full, 0, 0, 10, 10)).toBeNull();
    expect(duplicateZone(full, 0)).toBeNull();
  });

  it("cambia nombre, posición y tamaño sin mutar", () => {
    const t = newZone(base, 0, 0, 20, 20)!;
    expect(setZone(t, 0, { name: "poste" }).zones[0].name).toBe("poste");
    expect(t.zones[0].name).toBe("zona 1");
    expect(setZone(t, 5, { name: "x" })).toBe(t);
    expect(moveZoneTo(t, 0, 33.33, 44.44).zones[0]).toMatchObject({ x: 33.3, y: 44.4 });
  });

  it("redimensiona con la esquina inferior derecha y respeta el mínimo", () => {
    const t = newZone(base, 100, 100, 140, 130)!;
    const bigger = resizeZone(t, 0, 180, 90);
    expect(bigger.zones[0]).toMatchObject({ x: 100, y: 90, width: 80, height: 40 });
    const tiny = resizeZone(t, 0, 90, 200);
    expect(tiny.zones[0].width).toBe(MIN_ZONE_CM);
    expect(tiny.zones[0].height).toBe(MIN_ZONE_CM);
    expect(resizeZone(t, 7, 1, 1)).toBe(t);
  });

  it("duplica la zona un poco desplazada y la selecciona al final", () => {
    const t = newZone(base, 100, 100, 140, 130)!;
    const d = duplicateZone(t, 0)!;
    expect(d.zones).toHaveLength(2);
    expect(d.zones[1]).toMatchObject({ x: 110, y: 90, name: "zona 1 (copia)" });
    expect(duplicateZone(t, 3)).toBeNull();
  });

  it("borra puntos y zonas de una vez", () => {
    const t = deleteSelection(EXAMPLE_TECHNIQUE, { points: [0, 1], zones: [0] });
    expect(t.points).toHaveLength(10);
    expect(t.zones).toHaveLength(0);
    expect(deleteSelection(EXAMPLE_TECHNIQUE, { points: [], zones: [] })).toEqual(
      EXAMPLE_TECHNIQUE,
    );
  });

  it("pone la salida en un tramo, en la proyección del punto", () => {
    const t = setStartAt(EXAMPLE_TECHNIQUE, 0, 100, 45);
    expect(t.start.edge).toBe(0);
    expect(t.start.t).toBeGreaterThan(0);
    expect(t.start.t).toBeLessThan(1);
    expect(setStartAt(EXAMPLE_TECHNIQUE, 0, -500, 45).start.t).toBe(0);
    expect(setStartAt(EXAMPLE_TECHNIQUE, 0, 5000, 45).start.t).toBe(1);
  });
});
