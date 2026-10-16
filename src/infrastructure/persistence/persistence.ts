// Conserva en el navegador lo que se registra a mano mientras no exista la API (HU-02, HU-06, EN-17).
// Es una solución temporal: cuando el catálogo y los robots vivan en la base de datos (T-21, T-22),
// este módulo se reemplaza por llamadas a services/api.ts.
//
// Componentes: solo se guardan los registrados a mano; los de ejemplo salen siempre de datos/catalogo.ts,
// así los cambios de la semilla no quedan ocultos por datos viejos.
// Robots: se guarda la lista completa (nuevos robots y versiones nuevas de los de ejemplo).
import { TIPOS } from "@/shared/data/componentTypes";
import type { Component, RobotDef } from "@/domain/models/domain";
import { clone } from "@/domain/format";

const VERSION = 2;
export const CLAVE_COMPONENTES = "apaec.v2.componentes";
export const CLAVE_ROBOTS = "apaec.v2.robots";

export type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function almacenPorDefecto(): Almacen | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Revisa la forma de un componente leído del navegador, para no usar datos dañados. */
export function esComponente(x: unknown): x is Component {
  if (!esObjeto(x)) return false;
  return (
    typeof x.id === "string" &&
    x.id !== "" &&
    typeof x.typeId === "string" &&
    Object.hasOwn(TIPOS, x.typeId) &&
    typeof x.name === "string" &&
    x.name.trim() !== "" &&
    esNumero(x.price) &&
    x.price >= 0 &&
    esNumero(x.mass) &&
    x.mass >= 0 &&
    typeof x.store === "string" &&
    esNumero(x.stock) &&
    x.stock >= 0 &&
    (x.amps === undefined || esNumero(x.amps)) &&
    esObjeto(x.specs) &&
    Object.values(x.specs).every((v) => typeof v === "string" || esNumero(v))
  );
}

/** Revisa la forma de un robot leído del navegador. */
export function esRobot(x: unknown): x is RobotDef {
  if (!esObjeto(x)) return false;
  if (
    typeof x.id !== "string" ||
    typeof x.name !== "string" ||
    typeof x.short !== "string" ||
    (x.type !== "racer" && x.type !== "minisumo") ||
    (x.fw !== null && typeof x.fw !== "string") ||
    !Array.isArray(x.versions) ||
    x.versions.length === 0
  )
    return false;
  return x.versions.every(
    (v: unknown) =>
      esObjeto(v) &&
      typeof v.v === "string" &&
      typeof v.date === "string" &&
      typeof v.note === "string" &&
      typeof v.status === "string" &&
      esObjeto(v.parts) &&
      Object.values(v.parts).every(
        (p) => p === undefined || (esObjeto(p) && typeof p.id === "string" && esNumero(p.qty)),
      ),
  );
}

/** Lee el esquema anterior sin borrar componentes o versiones del usuario. */
function migrateComponent(value: unknown): unknown {
  if (!esObjeto(value) || "typeId" in value) return value;
  const { t, nm, precio, masa, tienda, i, s, ...rest } = value;
  return {
    ...rest,
    typeId: t,
    name: nm,
    price: precio,
    mass: masa,
    store: tienda,
    specs: s,
    ...(i !== undefined ? { amps: i } : {}),
  };
}

function migrateRobot(value: unknown): unknown {
  if (!esObjeto(value) || "versions" in value) return value;
  const { nm, tipo, ver, verActualId, ...rest } = value;
  if (!Array.isArray(ver)) return value;
  const statuses: Record<string, string> = {
    Actual: "current",
    Borrador: "draft",
    Anterior: "previous",
    Concepto: "concept",
    Descartada: "discarded",
  };
  return {
    ...rest,
    name: nm,
    type: tipo === "velocista" ? "racer" : tipo,
    ...(verActualId !== undefined ? { currentVersionId: verActualId } : {}),
    versions: ver.map((version: unknown) => {
      if (!esObjeto(version)) return version;
      const { fecha, nota, estado, parts, ...other } = version;
      return {
        ...other,
        date: fecha,
        note: nota,
        status: typeof estado === "string" ? (statuses[estado] ?? estado) : estado,
        parts: esObjeto(parts)
          ? Object.fromEntries(
              Object.entries(parts).map(([slot, part]) => {
                if (!esObjeto(part)) return [slot, part];
                const { q, ...fields } = part;
                return [slot, { ...fields, qty: q }];
              }),
            )
          : parts,
      };
    }),
  };
}

function leer(clave: string, almacen: Almacen | null): unknown {
  try {
    const crudo = almacen?.getItem(clave);
    if (!crudo) return undefined;
    const dato: unknown = JSON.parse(crudo);
    if (!esObjeto(dato)) return undefined;
    if (dato.version === VERSION) return dato.items;
    if (dato.version === 1 && Array.isArray(dato.items))
      return dato.items.map(clave === CLAVE_COMPONENTES ? migrateComponent : migrateRobot);
    return undefined;
  } catch {
    return undefined;
  }
}

function escribir(clave: string, items: unknown, almacen: Almacen | null): void {
  try {
    almacen?.setItem(clave, JSON.stringify({ version: VERSION, items }));
  } catch {
    /* almacenamiento lleno o no disponible: la consola sigue funcionando sin guardar */
  }
}

function quitar(clave: string, almacen: Almacen | null): void {
  try {
    almacen?.removeItem(clave);
  } catch {
    /* sin almacenamiento */
  }
}

/** Catálogo de ejemplo más los componentes registrados a mano que siguen siendo válidos. */
export function cargarComponentes(
  semilla: Component[],
  almacen: Almacen | null = almacenPorDefecto(),
): Component[] {
  const lista = clone(semilla);
  const guardados = leer(CLAVE_COMPONENTES, almacen);
  if (!Array.isArray(guardados)) return lista;
  const ids = new Set(lista.map((c) => c.id));
  for (const c of guardados) {
    if (esComponente(c) && !ids.has(c.id)) {
      ids.add(c.id);
      lista.push(c);
    }
  }
  return lista;
}

/** Guarda solo los componentes que no son de ejemplo. */
export function guardarComponentes(
  lista: Component[],
  semilla: Component[],
  almacen: Almacen | null = almacenPorDefecto(),
): void {
  const ids = new Set(semilla.map((c) => c.id));
  const registrados = lista.filter((c) => !ids.has(c.id));
  if (registrados.length === 0) quitar(CLAVE_COMPONENTES, almacen);
  else escribir(CLAVE_COMPONENTES, registrados, almacen);
}

/** Robots guardados, o los de ejemplo si no hay nada guardado o los datos no son válidos. */
export function cargarRobots(
  semilla: RobotDef[],
  almacen: Almacen | null = almacenPorDefecto(),
): RobotDef[] {
  const guardados = leer(CLAVE_ROBOTS, almacen);
  if (Array.isArray(guardados) && guardados.length > 0 && guardados.every(esRobot))
    return guardados;
  return clone(semilla);
}

/** Guarda los robots; si son idénticos a los de ejemplo no guarda nada. */
export function guardarRobots(
  lista: RobotDef[],
  semilla: RobotDef[],
  almacen: Almacen | null = almacenPorDefecto(),
): void {
  if (JSON.stringify(lista) === JSON.stringify(semilla)) quitar(CLAVE_ROBOTS, almacen);
  else escribir(CLAVE_ROBOTS, lista, almacen);
}

/** Borra lo registrado a mano y vuelve a los datos de ejemplo. */
export function borrarRegistrados(almacen: Almacen | null = almacenPorDefecto()): void {
  quitar(CLAVE_COMPONENTES, almacen);
  quitar(CLAVE_ROBOTS, almacen);
}
