import { request } from "@/infrastructure/http/api";
import type { Setup } from "@/domain/models/domain";

export function storeSetup(robotId: string, versionId: number, setup: Setup) {
  return request<{ id: number }>(`/robots/${encodeURIComponent(robotId)}/setups`, {
    method: "POST",
    body: JSON.stringify({
      version_id: versionId,
      name: "Setup de consola",
      controller_id: setup.controller,
      parameters: setup.parameters,
    }),
  });
}

export function applyStoredSetup(robotId: string, setupId: number) {
  return request<{ seq: number }>(
    `/robots/${encodeURIComponent(robotId)}/setups/${setupId}/apply`,
    { method: "POST" },
  );
}

export function changeModeLine(
  robotId: string,
  command: "mode" | "line",
  data: Record<string, unknown>,
) {
  return request<{ seq: number }>(`/robots/${encodeURIComponent(robotId)}/mode-line/${command}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
