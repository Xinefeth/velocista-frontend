/** URLs públicas: Vite las fija al compilar; no deben contener secretos. */
function apiBase(
  value = import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_URL,
): string {
  const base = (value?.trim() || "/api").replace(/\/+$/, "");
  if (base.startsWith("/") && !base.startsWith("//")) return base;
  const url = new URL(base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("VITE_API_BASE_URL debe ser una URL HTTP(S) sin credenciales ni parámetros");
  return base;
}

export function apiUrl(path: string, base?: string): string {
  return `${apiBase(base)}/${path.replace(/^\/+/, "")}`;
}

export function consoleUrl(
  location: Pick<Location, "protocol" | "host">,
  base?: string,
  configuredUrl = import.meta.env.VITE_WS_URL,
): string {
  const origin = `${location.protocol}//${location.host}`;
  const url = configuredUrl?.trim()
    ? new URL(configuredUrl, origin)
    : new URL(apiBase(base), origin);
  if (!configuredUrl?.trim()) {
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = url.pathname.replace(/\/api\/?$/, "").replace(/\/$/, "") + "/ws/console";
  }
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("VITE_WS_URL debe ser una URL WS(S) sin credenciales ni parámetros");
  if (location.protocol === "https:" && url.protocol !== "wss:")
    throw new Error("Una consola HTTPS requiere WebSocket seguro (wss://)");
  return url.toString();
}
