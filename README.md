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

## Comprobaciones

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

En la verificación local del frontend: 59 pruebas pasaron al habilitar `RUN_LIVE_QA=1` contra el backend local, incluyendo 12 pruebas REST vivas a través del proxy; lint, TypeScript, Prettier y build también pasaron. Además, una prueba de protocolo comprobó consola y robot WebSocket a través del proxy Vite y el ciclo REST comando/ACK.
