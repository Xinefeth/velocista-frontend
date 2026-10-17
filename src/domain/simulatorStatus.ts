import type { MensajeConsola } from "@/infrastructure/contracts/messages";

export interface SimulatorStatus {
  available: boolean;
  state: string;
  connected: boolean;
  running: boolean;
  sessionId: string | null;
  activeRunId: string | number | null;
  telemetry: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
}

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

/** Interpreta snapshots y eventos del emisor sim publicados por /ws/console. */
export function simulatorFromMessages(messages: MensajeConsola[]): SimulatorStatus {
  const frames = messages.filter((message) => message.sender === "sim");
  const connection = frames.find((message) => message.type === "connection");
  const snapshot = object(connection?.data);
  const latestTelemetry = frames.find((message) => message.type === "telemetry");
  const telemetry = object(latestTelemetry?.data) ?? object(snapshot?.telemetry);
  const configFrame = frames.find((message) => message.type === "config");
  const config = object(configFrame?.data) ?? object(snapshot?.config);
  const latestEvent = frames.find((message) => message.type === "event");
  const event = object(latestEvent?.data);
  const stateValue = typeof snapshot?.state === "string" ? snapshot.state : "unknown";
  const received = (message: MensajeConsola | undefined) =>
    typeof message?.received_ms === "number" ? message.received_ms : 0;
  const disconnectedAfterTelemetry = stateValue !== "ready" && connection &&
    received(connection) >= received(latestTelemetry);
  const connected = Boolean(frames.length) && !disconnectedAfterTelemetry &&
    (stateValue === "ready" || received(latestTelemetry) > received(connection));
  const eventRunning = event?.event === "run_started" ? true
    : event?.event === "run_finished" ? false
    : null;
  const telemetryRunning = typeof telemetry?.running === "boolean" ? telemetry.running : null;
  const activeRunId = typeof snapshot?.active_run_id === "string" ||
    typeof snapshot?.active_run_id === "number" ? snapshot.active_run_id : null;
  const running = eventRunning ?? telemetryRunning ?? (activeRunId !== null);
  return {
    available: frames.length > 0,
    state: stateValue,
    connected,
    running,
    sessionId: typeof snapshot?.session_id === "string" ? snapshot.session_id : null,
    activeRunId,
    telemetry,
    config,
  };
}
