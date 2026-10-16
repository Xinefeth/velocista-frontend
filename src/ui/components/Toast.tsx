// Aviso breve (toast) de la consola (Protoripo.html).
import { useConsole } from "@/application/state/ConsoleContext";

export function Toast() {
  const { toast } = useConsole();
  return (
    <div id="toast" role="status" aria-live="polite" className={toast ? "show" : ""}>
      {toast}
    </div>
  );
}
