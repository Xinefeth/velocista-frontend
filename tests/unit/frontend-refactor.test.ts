import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ErrorApi, request } from "@/infrastructure/http/api";
import {
  CLAVE_COMPONENTES,
  CLAVE_ROBOTS,
  cargarComponentes,
  cargarRobots,
  guardarComponentes,
  guardarRobots,
} from "@/infrastructure/persistence/persistence";
import { facts, saveParts } from "@/domain/rules";
import { CAT } from "@/shared/data/catalog";
import { ROBOTS } from "@/shared/data/robots";
import { parseNumber, validateFields, normalizeText } from "@/ui/components/management";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("HTTP boundary after renaming", () => {
  it("sends the existing REST robot and version schema with English enum values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond({ id: "r/1" }));
    vi.stubGlobal("fetch", fetchMock);
    await api.robots.create({ name: "Velocista", shortCode: "001", type: "racer" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: "Velocista",
      short_code: "001",
      type: "racer",
      firmware: null,
    });
    await api.robots.createVersion("r/1", {
      baseVersionId: 9,
      note: "Nueva pieza",
      status: "current",
      parts: { motor: { componentId: "c01", quantity: 2 } },
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/robots/r%2F1/versions");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      base_version_id: 9,
      note: "Nueva pieza",
      status: "current",
      parts: { motor: { component_id: "c01", quantity: 2 } },
    });
  });

  it("loads paginated components into the renamed domain fields", async () => {
    const item = {
      id: "c1",
      type_id: "motor",
      name: "Motor",
      price: 10,
      mass_g: 20,
      current_a: 0.5,
      store: "Club",
      specs: { rpm: 100 },
      stock: 2,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond({ items: [item], total: 2 }))
      .mockResolvedValueOnce(
        respond({ items: [{ ...item, id: "c2", current_a: null }], total: 2 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const components = await api.catalog.list();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/components?limit=200&offset=1");
    expect(components[0]).toEqual({
      id: "c1",
      typeId: "motor",
      name: "Motor",
      price: 10,
      mass: 20,
      amps: 0.5,
      store: "Club",
      specs: { rpm: 100 },
      stock: 2,
    });
    expect(components[1]).not.toHaveProperty("amps");
  });

  it("loads current version quantities and statuses without enum translation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          respond({
            items: [
              {
                id: "r1",
                name: "Robot",
                short_code: "001",
                type: "racer",
                firmware: "1.0",
                current_version_id: 7,
              },
            ],
            total: 1,
          }),
        )
        .mockResolvedValueOnce(
          respond({
            label: "v2",
            date: "hoy",
            note: "Lista",
            status: "current",
            parts: { motor: { component_id: "c1", quantity: 2 } },
          }),
        ),
    );
    const [robot] = await api.robots.selection();
    expect(robot.type).toBe("racer");
    expect(robot.currentVersionId).toBe(7);
    expect(robot.versions[0]).toMatchObject({
      status: "current",
      note: "Lista",
      parts: { motor: { id: "c1", qty: 2 } },
    });
  });

  it("preserves business error reasons and handles empty successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          respond(
            {
              detail: { reason: "invalid_version", detail: "Versión inválida" },
            },
            409,
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );
    await expect(request("/robots")).rejects.toMatchObject({
      status: 409,
      reason: "invalid_version",
      message: "Versión inválida",
    } satisfies Partial<ErrorApi>);
    await expect(request("/robots")).resolves.toBeNull();
  });
});

describe("browser storage schema migration", () => {
  it("keeps previously registered components and writes the new schema", () => {
    localStorage.setItem(
      CLAVE_COMPONENTES,
      JSON.stringify({
        version: 1,
        items: [
          {
            id: "custom",
            t: "mcu",
            nm: "Personalizado",
            precio: 10,
            masa: 3,
            tienda: "Club",
            stock: 1,
            i: 0.1,
            s: { radio: "WiFi" },
          },
        ],
      }),
    );
    const items = cargarComponentes([], localStorage);
    expect(items).toEqual([
      {
        id: "custom",
        typeId: "mcu",
        name: "Personalizado",
        price: 10,
        mass: 3,
        store: "Club",
        stock: 1,
        amps: 0.1,
        specs: { radio: "WiFi" },
      },
    ]);
    guardarComponentes(items, [], localStorage);
    expect(JSON.parse(localStorage.getItem(CLAVE_COMPONENTES)!).version).toBe(2);
    expect(cargarComponentes([], localStorage)).toEqual(items);
  });

  it.each([
    ["Actual", "current"],
    ["Borrador", "draft"],
    ["Anterior", "previous"],
    ["Concepto", "concept"],
    ["Descartada", "discarded"],
  ])("preserves legacy robot versions with status %s", (oldStatus, status) => {
    localStorage.setItem(
      CLAVE_ROBOTS,
      JSON.stringify({
        version: 1,
        items: [
          {
            id: "custom",
            nm: "Mi robot",
            short: "123",
            tipo: "velocista",
            fw: null,
            verActualId: 7,
            ver: [
              {
                v: "v1",
                fecha: "ayer",
                nota: "Nota en español",
                estado: oldStatus,
                parts: { motor: { id: "c1", q: 2 } },
              },
            ],
          },
        ],
      }),
    );
    const [robot] = cargarRobots([], localStorage);
    expect(robot).toMatchObject({
      name: "Mi robot",
      type: "racer",
      currentVersionId: 7,
      versions: [
        { status, date: "ayer", note: "Nota en español", parts: { motor: { id: "c1", qty: 2 } } },
      ],
    });
    guardarRobots([robot], [], localStorage);
    expect(cargarRobots([], localStorage)).toEqual([robot]);
  });

  it("rejects malformed stored data and keeps the seed usable", () => {
    localStorage.setItem(CLAVE_ROBOTS, "invalid json");
    expect(cargarRobots(ROBOTS, localStorage)).toEqual(ROBOTS);
    localStorage.setItem(
      CLAVE_COMPONENTES,
      JSON.stringify({ version: 2, items: [{ id: "broken" }] }),
    );
    expect(cargarComponentes(CAT, localStorage)).toEqual(CAT);
  });
});

describe("domain and forms", () => {
  it("uses quantities for cost, mass and current", () => {
    const result = facts({ motor: { id: "c1", qty: 3 } }, [
      {
        id: "c1",
        typeId: "motor",
        name: "Motor",
        price: 2,
        mass: 5,
        amps: 0.5,
        store: "Club",
        stock: 3,
        specs: {},
      },
    ]);
    expect(result).toMatchObject({ cost: 6, mass: 23, current: 1.5, motors: 3 });
  });

  it("archives the former current version when saving parts", () => {
    const original = { ...ROBOTS[0], fw: "1.0" };
    const { robot, version } = saveParts(original, { motor: { id: "c1", qty: 2 } }, "Cambio");
    expect(version.status).toBe("current");
    expect(version.note).toBe("Cambio");
    expect(robot.versions.at(-2)?.status).toBe("previous");
    expect(original.versions.at(-1)?.status).toBe("current");
  });

  it("validates English field discriminants while keeping Spanish messages", () => {
    expect(parseNumber("1,5")).toBe(1.5);
    expect(normalizeText(" Batería ")).toBe("bateria");
    expect(
      validateFields([{ nombre: "qty", etiqueta: "Cantidad", tipo: "number", entero: true }], {
        qty: "1,5",
      }),
    ).toEqual({ qty: "Debe ser un número entero." });
    expect(
      validateFields(
        [
          {
            nombre: "type",
            etiqueta: "Tipo",
            tipo: "select",
            opciones: [{ valor: "mcu", etiqueta: "Microcontrolador" }],
          },
        ],
        { type: "invalid" },
      ),
    ).toEqual({ type: "Elige una opción de la lista." });
  });
});
