import { AUTH_EVENT, accessToken, setAccessToken } from "@/infrastructure/config";
import { apiUrl } from "@/infrastructure/config/urls";
// Única capa que hace llamadas HTTP a la API (DO-02, sección 6).
// Actúa como anti-corruption layer: traduce entre el contrato en inglés (docs/CONTRACT.md)
// y el modelo de dominio de la consola. Las vistas no dependen del formato REST.
import type {
  ErrorNegocio,
  PaginaCorridas,
  ComponenteApi,
  PaginaComponentes,
  PaginaRobots,
  Salud,
  RobotApi,
  RobotVersionApi,
} from "@/infrastructure/contracts/api";
import type { Component, RobotDef } from "@/domain/models/domain";

/** Mapea un componente de la API al modelo de la consola. */
function toComponent(r: ComponenteApi): Component {
  return {
    id: r.id,
    typeId: r.type_id,
    name: r.name,
    price: r.price,
    mass: r.mass_g,
    store: r.store,
    stock: r.stock,
    specs: translateSpecs(r.specs, false),
    ...(r.current_a != null ? { amps: r.current_a } : {}),
  };
}

export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    detail: string,
  ) {
    super(detail);
  }
}

/** Convierte cualquier respuesta de error al formato estándar { reason, detail }. */
export function toApiError(status: number, body: unknown): ErrorApi {
  const detail = (body as { detail?: unknown } | null)?.detail;
  const reason = (body as { reason?: unknown } | null)?.reason;
  if (typeof reason === "string" && typeof detail === "string")
    return new ErrorApi(status, reason, detail);
  if (detail && typeof detail === "object" && !Array.isArray(detail) && "reason" in detail) {
    const d = detail as ErrorNegocio;
    return new ErrorApi(status, d.reason, d.detail);
  }
  if (Array.isArray(detail))
    return new ErrorApi(status, "validacion", "Hay datos inválidos en la solicitud");
  return new ErrorApi(status, "error_http", `La API respondió ${status}`);
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(apiUrl(path), { ...options, headers });
  if (response.status === 401 && path !== "/auth/login") {
    setAccessToken(null);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

const SPEC_KEYS: Record<string, string> = {
  celdas: "cells",
  mah: "capacity_mah",
  c: "discharge_c",
  vmax: "max_voltage_v",
  ancho: "width_mm",
  largo: "length_mm",
  canales: "channels",
  icont: "continuous_current_a",
  ipico: "peak_current_a",
  vmin: "min_voltage_v",
  cpr: "counts_per_revolution",
  tipo: "type",
  bornes: "terminals",
  comercial: "commercial_pcb",
  ejes: "axes",
  salida: "output",
  paso: "pitch_mm",
  i: "current_a",
  mhz: "clock_mhz",
  logica: "logic_voltage_v",
  adc: "analog_inputs",
  v: "voltage_v",
  rpm: "no_load_rpm",
  inom: "nominal_current_a",
  red: "gear_ratio",
  familia: "family",
  vout: "output_voltage_v",
  imax: "max_current_a",
  diam: "diameter_mm",
};
function translateSpecs(specs: Record<string, string | number>, outgoing: boolean) {
  const keys = outgoing
    ? SPEC_KEYS
    : Object.fromEntries(Object.entries(SPEC_KEYS).map(([a, b]) => [b, a]));
  return Object.fromEntries(Object.entries(specs).map(([key, value]) => [keys[key] ?? key, value]));
}
export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  command: (type: string, data: Record<string, unknown> = {}, robotId?: string) =>
    request<{ seq: number }>("/devices/robot/commands", {
      method: "POST",
      body: JSON.stringify({ type, data, ...(robotId ? { robot_id: robotId } : {}) }),
    }),
  health: () => request<Salud>("/health"),
  robots: {
    /** Lista los robots del armador (HU-13). `query` es la cadena ?a=b opcional. */
    list: (query = "") => request<PaginaRobots>(`/robots${query}`),
    getVersion: (robotId: string, versionId: number) =>
      request<RobotVersionApi>(`/robots/${encodeURIComponent(robotId)}/versions/${versionId}`),
    /** Registra un robot en la base de datos (POST /robots, HU-06). Sin versiones. */
    create: (data: {
      name: string;
      shortCode: string;
      type: "racer" | "minisumo";
      firmware?: string | null;
    }) =>
      request<RobotApi>("/robots", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          short_code: data.shortCode,
          type: data.type,
          firmware: data.firmware ?? null,
        }),
      }),
    /** Guarda una nueva versión del robot con su lista de piezas (POST, HU-06). */
    createVersion: (
      robotId: string,
      data: {
        baseVersionId: number | null;
        note: string;
        status: "current" | "concept" | "draft";
        parts: Record<string, { componentId: string; quantity: number }>;
      },
    ) =>
      request<RobotVersionApi>(`/robots/${encodeURIComponent(robotId)}/versions`, {
        method: "POST",
        body: JSON.stringify({
          base_version_id: data.baseVersionId,
          note: data.note,
          status: data.status,
          parts: Object.fromEntries(
            Object.entries(data.parts).map(([slot, p]) => [
              slot,
              { component_id: p.componentId, quantity: p.quantity },
            ]),
          ),
        }),
      }),
    /** Lista completa y versión actual, sin sustituir datos del servidor por prototipos. */
    async selection(): Promise<RobotDef[]> {
      const records: PaginaRobots["items"] = [];
      let page: PaginaRobots;
      do {
        page = await api.robots.list(`?limit=200&offset=${records.length}`);
        records.push(...page.items);
      } while (page.items.length > 0 && records.length < page.total);
      return Promise.all(
        records.map(async (record): Promise<RobotDef> => {
          const version =
            record.current_version_id === null
              ? null
              : await api.robots.getVersion(record.id, record.current_version_id);
          return {
            id: record.id,
            name: record.name,
            short: record.short_code,
            type: record.type,
            fw: record.firmware,
            currentVersionId: record.current_version_id,
            versions: [
              {
                v: version?.label ?? "Sin versión",
                date: version?.date ?? "—",
                note: version?.note ?? "Sin versión registrada",
                status: version?.status ?? "draft",
                parts: Object.fromEntries(
                  Object.entries(version?.parts ?? {}).map(([slot, part]) => [
                    slot,
                    { id: part.component_id, qty: part.quantity },
                  ]),
                ),
              },
            ],
          };
        }),
      );
    },
  },
  catalog: {
    /** Lista todos los componentes del catálogo desde la base de datos (HU-01). */
    async list(): Promise<Component[]> {
      const records: ComponenteApi[] = [];
      let page: PaginaComponentes;
      do {
        page = await request<PaginaComponentes>(`/components?limit=200&offset=${records.length}`);
        records.push(...page.items);
      } while (page.items.length > 0 && records.length < page.total);
      return records.map(toComponent);
    },
    /** Registra un componente en la base de datos (POST /components, HU-02). */
    async create(data: {
      typeId: string;
      name: string;
      price: number;
      mass: number;
      store: string;
      amps?: number | null;
      specs: Record<string, string | number>;
      stock: number;
    }): Promise<Component> {
      return toComponent(
        await request<ComponenteApi>("/components", {
          method: "POST",
          body: JSON.stringify({
            type_id: data.typeId,
            name: data.name,
            price: data.price,
            mass_g: data.mass,
            store: data.store,
            current_a: data.amps ?? null,
            specs: translateSpecs(data.specs, true),
            stock: data.stock,
          }),
        }),
      );
    },
  },
  runs: {
    /** Historial persistido por el backend, incluida la ingesta del servicio de simulación. */
    list: (query = "") => request<PaginaCorridas>(`/runs${query}`),
  },
};
