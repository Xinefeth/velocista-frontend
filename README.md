# velocista-frontend

Consola React 18, TypeScript y Vite para operar robots velocistas, visualizar telemetría y consultar corridas. Las páginas llaman a la API mediante la capa HTTP y WebSocket de `src/infrastructure`.

## Desarrollo local

Requiere Node.js 20 o superior.

```powershell
npm ci
npm run dev
```

Vite sirve la consola en `http://127.0.0.1:5173` y reenvía `/api` y `/ws` a `http://127.0.0.1:8000`. Se puede cambiar el destino local con `BACKEND_PROXY_TARGET`.

## Despliegue separado

Este repositorio incluye `render.yaml` para publicar como sitio estático. Define `VITE_API_BASE_URL` antes de compilar, con el origen HTTPS del backend y el sufijo `/api`, por ejemplo `https://velocista-backend.onrender.com/api`. `VITE_WS_URL` es opcional; si se deja vacío, la consola deriva `wss://.../ws/console` desde esa URL.

El frontend obtiene el token mediante `POST /api/auth/login` y lo usa en las solicitudes protegidas y en el WebSocket de consola. Las variables `VITE_*` son públicas y nunca deben contener secretos. El origen publicado debe estar permitido en `CORS_ORIGINS` del backend.

## Trazador de pistas

La vista **Trazador de pistas** (EN-28) permite dibujar y verificar pistas, simular una vuelta, guardarlas en la API y exportarlas (SVG 1:1, SVG con zonas, PNG y JSON) o importar un JSON (de la API o del prototipo v2). Mientras se edita guarda un borrador local por pista. El detalle de capas y pruebas está en `docs/ARCHITECTURE.md`; el spec, en `.kiro/specs/EN-28 — Integrar-creador-de-pista/`.

## Página del celular (medición)

`/celular.html` (o `/celular` y `/celular/` en Render, y también en `npm run dev` y `vite preview`) es la página que se abre en el celular para calibrar,
medir por pasos o GPS, probar el error del GPS y correr el modelo de precisión (HU-37, HU-40,
EN-35, SP-06, SP-07). Es una segunda entrada de Vite con React y usa la misma API y sesión que la
consola. Los sensores necesitan HTTPS: en local, levanta `npm run dev` y abre un túnel, por
ejemplo `cloudflared tunnel --url http://127.0.0.1:5173`, y en el celular entra a
`https://<túnel>/celular.html`. El código del celular se guarda en el navegador; si cambias de
enlace, recupéralo en la pestaña Conexión.

## Comprobaciones

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

En la verificación local del frontend: 59 pruebas pasaron al habilitar `RUN_LIVE_QA=1` contra el backend local, incluyendo 12 pruebas REST vivas a través del proxy; lint, TypeScript, Prettier y build también pasaron. Además, una prueba de protocolo comprobó consola y robot WebSocket a través del proxy Vite y el ciclo REST comando/ACK.
