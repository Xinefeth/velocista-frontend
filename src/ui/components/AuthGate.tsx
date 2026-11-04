import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { api } from "@/infrastructure/http/api";
import { AUTH_EVENT, setAccessToken } from "@/infrastructure/config";

/**
 * Cuando el servidor requiere sesión, desmonta la consola y permite autenticarse.
 * Con `keepMounted` (página del celular) NO desmonta: el login se muestra encima y la página sigue
 * viva debajo, para no cortar una medición en curso ni perder su cola de lecturas.
 */
export function AuthGate({
  children,
  keepMounted = false,
}: {
  children: ReactNode;
  keepMounted?: boolean;
}) {
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
  if (!required && !keepMounted) return children;
  const loginForm = (
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
  if (!keepMounted) return loginForm;
  // el login tapa la página (sin desmontarla); su lugar en el árbol no cambia con `required`
  return (
    <>
      {children}
      {required && (
        <div
          role="dialog"
          aria-label="Iniciar sesión"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            overflowY: "auto",
            background: "var(--bg)",
          }}
        >
          {loginForm}
        </div>
      )}
    </>
  );
}
