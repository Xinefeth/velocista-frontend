/// <reference types="vitest" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Desarrollo: Vite reenvía /api y /ws a la API en :8000.
// Pista: la API sirve esta consola compilada desde el mismo origen (:8000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.BACKEND_PROXY_TARGET || "http://127.0.0.1:8000";
  return {
    plugins: [react()],
    // Alias "@/..." → src/... (arquitectura Clean: imports independientes de la ubicación).
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        "/api": backend,
        "/ws": { target: backend.replace(/^http/, "ws"), ws: true },
      },
    },
    test: { environment: "jsdom", globals: false },
  };
});
