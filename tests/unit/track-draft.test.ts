import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_PREFIX,
  clearDraft,
  draftKey,
  isTrackLike,
  listDrafts,
  loadDraft,
  saveDraft,
} from "@/infrastructure/persistence/trackDraft";
import { EXAMPLE_EIGHT, EXAMPLE_TECHNIQUE } from "@/domain/track/examples";

beforeEach(() => localStorage.clear());

describe("borrador local: claves", () => {
  it("una clave por pista: el id, o «new» si aún no está en la API", () => {
    expect(draftKey(7)).toBe(`${DRAFT_PREFIX}7`);
    expect(draftKey(null)).toBe(`${DRAFT_PREFIX}new`);
    expect(draftKey(7)).not.toBe(draftKey(8));
  });

  it("dos pistas distintas no se pisan", () => {
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 7, name: "A" });
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 8, name: "B" });
    saveDraft({ ...EXAMPLE_EIGHT, id: null, name: "C" });
    expect(loadDraft(draftKey(7))!.track.name).toBe("A");
    expect(loadDraft(draftKey(8))!.track.name).toBe("B");
    expect(loadDraft(draftKey(null))!.track.name).toBe("C");
    expect(listDrafts()).toHaveLength(3);
  });

  it("guardar de nuevo la misma pista reemplaza su borrador", () => {
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 7, name: "viejo" });
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 7, name: "nuevo" });
    expect(listDrafts()).toHaveLength(1);
    expect(loadDraft(draftKey(7))!.track.name).toBe("nuevo");
  });
});

describe("borrador local: guardar, leer y borrar", () => {
  it("ida y vuelta conserva la pista y anota la hora", () => {
    const when = new Date("2026-11-03T10:00:00Z");
    expect(saveDraft({ ...EXAMPLE_TECHNIQUE, id: 7 }, localStorage, when)).toBe(true);
    const d = loadDraft(draftKey(7))!;
    expect(d.savedAt).toBe("2026-11-03T10:00:00.000Z");
    expect(d.track).toEqual({ ...EXAMPLE_TECHNIQUE, id: 7 });
    expect(d.key).toBe(draftKey(7));
    expect(d.v).toBe(1);
  });

  it("borrar quita solo ese borrador", () => {
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 7 });
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 8 });
    clearDraft(draftKey(7));
    expect(loadDraft(draftKey(7))).toBeNull();
    expect(loadDraft(draftKey(8))).not.toBeNull();
  });

  it("la lista va del más reciente al más antiguo y solo incluye claves del borrador", () => {
    saveDraft(
      { ...EXAMPLE_TECHNIQUE, id: 1, name: "viejo" },
      localStorage,
      new Date("2026-11-01T00:00:00Z"),
    );
    saveDraft(
      { ...EXAMPLE_TECHNIQUE, id: 2, name: "medio" },
      localStorage,
      new Date("2026-11-02T00:00:00Z"),
    );
    saveDraft(
      { ...EXAMPLE_TECHNIQUE, id: 3, name: "nuevo" },
      localStorage,
      new Date("2026-11-03T00:00:00Z"),
    );
    localStorage.setItem("apaec.v2.robots", "[]"); // otra clave de la consola: no debe aparecer
    expect(listDrafts().map((d) => d.track.name)).toEqual(["nuevo", "medio", "viejo"]);
  });

  it("no guarda secretos: solo la pista (sin token ni cabeceras)", () => {
    saveDraft({ ...EXAMPLE_TECHNIQUE, id: 7 });
    const raw = localStorage.getItem(draftKey(7))!;
    expect(raw).not.toMatch(/token|authorization|bearer|password/i);
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["key", "savedAt", "track", "v"]);
  });
});

describe("borrador local: datos dañados y almacenamiento no disponible", () => {
  it("un borrador corrupto, de otra versión o con forma de pista inválida se ignora", () => {
    localStorage.setItem(draftKey(1), "{no es json");
    localStorage.setItem(
      draftKey(2),
      JSON.stringify({ v: 2, savedAt: "x", track: EXAMPLE_TECHNIQUE }),
    );
    localStorage.setItem(draftKey(3), JSON.stringify({ v: 1, savedAt: "x", track: { name: "x" } }));
    localStorage.setItem(draftKey(4), JSON.stringify({ v: 1, track: EXAMPLE_TECHNIQUE }));
    localStorage.setItem(draftKey(5), JSON.stringify([1, 2]));
    for (const id of [1, 2, 3, 4, 5]) expect(loadDraft(draftKey(id))).toBeNull();
    expect(listDrafts()).toEqual([]);
  });

  it("sin almacén (modo privado o bloqueado) no lanza nada", () => {
    expect(saveDraft(EXAMPLE_TECHNIQUE, null)).toBe(false);
    expect(loadDraft(draftKey(1), null)).toBeNull();
    expect(listDrafts(null)).toEqual([]);
    expect(() => clearDraft(draftKey(1), null)).not.toThrow();
  });

  it("si escribir falla (sin espacio), devuelve false y no lanza", () => {
    const full = {
      length: 0,
      key: () => null,
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    };
    expect(saveDraft(EXAMPLE_TECHNIQUE, full)).toBe(false);
  });

  it("si leer falla, se trata como que no hay borrador", () => {
    const broken = {
      length: 1,
      key: () => DRAFT_PREFIX + "1",
      getItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {},
    };
    expect(loadDraft(draftKey(1), broken)).toBeNull();
    expect(listDrafts(broken)).toEqual([]);
    expect(() => clearDraft(draftKey(1), broken)).not.toThrow();
  });

  it("si `localStorage` lanza al acceder, no se rompe", () => {
    const spy = vi.spyOn(globalThis, "localStorage", "get").mockImplementation(() => {
      throw new Error("denegado");
    });
    expect(saveDraft(EXAMPLE_TECHNIQUE)).toBe(false);
    expect(listDrafts()).toEqual([]);
    spy.mockRestore();
  });
});

describe("isTrackLike", () => {
  it("acepta pistas válidas, con o sin id", () => {
    expect(isTrackLike(EXAMPLE_TECHNIQUE)).toBe(true);
    expect(isTrackLike({ ...EXAMPLE_EIGHT, id: 3 })).toBe(true);
  });

  it("rechaza lo que no tiene la forma", () => {
    expect(isTrackLike(null)).toBe(false);
    expect(isTrackLike("pista")).toBe(false);
    expect(isTrackLike({ ...EXAMPLE_TECHNIQUE, points: [{ x: 1 }] })).toBe(false);
    expect(isTrackLike({ ...EXAMPLE_TECHNIQUE, board: { widthCm: "a", heightCm: 1 } })).toBe(false);
    expect(isTrackLike({ ...EXAMPLE_TECHNIQUE, zones: [{ x: 1 }] })).toBe(false);
    expect(isTrackLike({ ...EXAMPLE_TECHNIQUE, start: null })).toBe(false);
    expect(isTrackLike({ ...EXAMPLE_TECHNIQUE, id: "7" })).toBe(false);
    expect(isTrackLike({ ...EXAMPLE_TECHNIQUE, profileId: 3 })).toBe(false);
    expect(
      isTrackLike({
        ...EXAMPLE_TECHNIQUE,
        points: Array.from({ length: 5001 }, () => EXAMPLE_TECHNIQUE.points[0]),
      }),
    ).toBe(false);
    expect(
      isTrackLike({ ...EXAMPLE_TECHNIQUE, points: [{ x: NaN, y: 1, radius: 0, gap: false }] }),
    ).toBe(false);
  });
});
