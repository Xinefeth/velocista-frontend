import { describe, expect, it } from "vitest";
import {
  CLAVE_COMPONENTES,
  borrarRegistrados,
  cargarComponentes,
  esComponente,
  guardarComponentes,
  type Almacen,
} from "@/infrastructure/persistence/persistence";
import { CAT } from "@/shared/data/catalog";

function memoryStore(
  initial: Record<string, string> = {},
): Almacen & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

describe("local persistence of registered components", () => {
  it("accepts a well formed component and rejects garbage", () => {
    expect(esComponente(CAT[0])).toBe(true);
    expect(esComponente(null)).toBe(false);
    expect(esComponente({ id: 1 })).toBe(false);
  });

  it("returns the seed catalog when storage is empty", () => {
    expect(cargarComponentes(CAT, memoryStore())).toEqual(CAT);
  });

  it("falls back to the seed when storage holds invalid JSON", () => {
    const store = memoryStore({ [CLAVE_COMPONENTES]: "{not json" });
    expect(cargarComponentes(CAT, store)).toEqual(CAT);
  });

  it("keeps a component the user registered after reloading", () => {
    const store = memoryStore();
    const custom = { ...CAT[0], id: "c99", name: "Mi sensor" };
    guardarComponentes([...CAT, custom], CAT, store);
    expect(cargarComponentes(CAT, store).some((c) => c.id === "c99")).toBe(true);
  });

  it("borrarRegistrados removes what was stored", () => {
    const store = memoryStore();
    guardarComponentes([...CAT, { ...CAT[0], id: "c99" }], CAT, store);
    borrarRegistrados(store);
    expect(cargarComponentes(CAT, store).some((c) => c.id === "c99")).toBe(false);
  });
});
