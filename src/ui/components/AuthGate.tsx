import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { api } from "@/infrastructure/http/api";
import { AUTH_EVENT, setAccessToken } from "@/infrastructure/config";

/** Cuando el servidor requiere sesión, desmonta la consola y permite autenticarse. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [required, setRequired] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const requireLogin = () => setRequired(true);
    window.addEventListener(AUTH_EVENT, requireLogin);
    return () => window.removeEventListener(AUTH_EVENT, requireLogin);
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.login(username, password);
      setAccessToken(result.access_token);
      setPassword("");
      setRequired(false);
    } catch {
      setError("No se pudo iniciar sesión. Revisa tus credenciales y la conexión.");
    } finally {
      setBusy(false);
    }
  }
  if (!required) return children;
  return (
    <main style={{ maxWidth: 400, margin: "15vh auto", padding: 24 }}>
      <h1>Velocista</h1>
      <p>Inicia sesión para acceder a la consola.</p>
      <form onSubmit={login} style={{ display: "grid", gap: 12 }}>
        <label>
          Usuario
          <input
            className="inp"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            className="inp"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="sb" disabled={busy}>
          {busy ? "Conectando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
