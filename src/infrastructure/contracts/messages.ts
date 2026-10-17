// Sobre que la API reenvía a la consola por /ws/console. Claves en inglés (docs/CONTRACT.md).
// Los tipos de cada mensaje de dispositivo se agregan con el contrato de mensajes.

export interface MensajeConsola<T = Record<string, unknown>> {
  sender: "robot" | "timer" | "api" | "sim";
  type: string;
  data: T;
  received_ms: number;
}
