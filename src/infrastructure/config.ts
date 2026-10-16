import { consoleUrl } from "@/infrastructure/config/urls";
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "/api"
).replace(/\/$/, "");
export const AUTH_EVENT = "velocista:auth-required";
const TOKEN_KEY = "velocista.access-token";
export function accessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function setAccessToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}
export function socketUrl(
  location: Pick<Location, "protocol" | "host">,
  apiBase = API_BASE,
  explicit = import.meta.env.VITE_WS_URL || "",
): string {
  const url = new URL(consoleUrl(location, apiBase, explicit));
  const token = accessToken();
  if (token) url.searchParams.set("token", token);
  return url.toString();
}
