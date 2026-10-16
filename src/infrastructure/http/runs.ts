import { api, request } from "@/infrastructure/http/api";
import type { CorridaApi } from "@/infrastructure/contracts/api";
import type { RobotDef } from "@/domain/models/domain";
import type { Corrida } from "@/domain/models/runs";

/** Adapta el historial persistido al modelo de las vistas, conservando su ID de BD. */
export function toRun(record: CorridaApi, robots: RobotDef[]): Corrida {
  const robot = robots.find((item) => item.id === record.robot_id);
  const version =
    robot?.currentVersionId === record.version_id ? robot.versions.at(-1)?.v : undefined;
  return {
    id: record.id,
    n: record.number,
    robot: record.robot_id,
    ver: version ?? `#${record.version_id}`,
    ctrl: record.controller_id,
    p: { ...record.parameters },
    t: record.time_s,
    fin: record.finished,
    iae: record.accumulated_error,
    vbat: record.battery_v,
    sec: [...record.sectors_s],
    src: record.time_source === "finish" ? "Meta" : "Telemetría",
    note: record.note,
    J: record.j,
  };
}

export async function loadRunHistory(robots: RobotDef[]): Promise<Corrida[]> {
  const records: CorridaApi[] = [];
  let page;
  do {
    page = await api.runs.list(`?limit=200&offset=${records.length}`);
    records.push(...page.items);
  } while (page.items.length && records.length < page.total);
  return [...new Map(records.map((record) => [record.id, record])).values()]
    .sort((a, b) => a.number - b.number)
    .map((record) => toRun(record, robots));
}

export function annotateRun(id: number, note: string): Promise<CorridaApi> {
  return request<CorridaApi>(`/runs/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
}
