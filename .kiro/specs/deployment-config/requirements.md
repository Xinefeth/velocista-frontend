# Requirements Document — Deployment and Configuration

## Introduction

The Consola is built as a static bundle (Vite) and published on Render as a static site. All
configuration is resolved at **build time** through public `VITE_*` variables; there is no runtime
config and no server-side code. This spec documents the real files (`render.yaml`, `.env.example`,
`vite.config.ts`, `src/infrastructure/config.ts`, `src/infrastructure/config/urls.ts`, `README.md`,
`tests/unit/deployment.test.ts`) and the contract with the backend (CORS, URL shapes). The live Render
service, the real backend URL and the backend's CORS settings were NOT verified from this repository.

## Glossary

- **Render static site**: Servicio `runtime: static` que publica `./dist` y reescribe rutas a `index.html`.
- **`VITE_API_BASE_URL`**: Base de la API; `/api` (mismo origen) o `https://BACKEND/api`.
- **`VITE_WS_URL`**: URL opcional del WebSocket de consola; vacío = se deriva de la base de la API.
- **`VITE_API_URL`**: Alias antiguo aceptado como respaldo de `VITE_API_BASE_URL`.
- **`BACKEND_PROXY_TARGET`**: Solo desarrollo: destino del proxy de Vite (no entra al build).
- **CORS**: Política del backend que debe permitir el origen del sitio publicado (`CORS_ORIGINS`).
- **Rewrite SPA**: Regla `/* → /index.html`.

## Requirements

### Requirement 1: Static build and publish

**User Story:** As an operator, I want a reproducible static build on Render.

#### Acceptance Criteria

1. THE `render.yaml` SHALL define one service `velocista-frontend` with `runtime: static`, `buildCommand: npm ci && npm run build` and `staticPublishPath: ./dist`.
2. THE build SHALL run `tsc -b && vite build`, so a type error fails the deployment.
3. THE `render.yaml` SHALL rewrite every path to `/index.html`.
4. IF an API request path reaches the static host (for example when `VITE_API_BASE_URL` is left as `/api` on Render), THEN the rewrite SHALL return `index.html` instead of JSON — the build SHALL therefore always be given an absolute `VITE_API_BASE_URL` on Render (risk; no guard exists).
5. THE `dist/`, `.env`, `.env.local` and `*.tsbuildinfo` SHALL be git-ignored (verified in `.gitignore`).

### Requirement 2: Public environment variables

**User Story:** As an operator, I want to know which variables to set and that they are public.

#### Acceptance Criteria

1. THE `render.yaml` SHALL declare `VITE_API_BASE_URL` with `sync: false` (value set in the Render dashboard, not in git).
2. WHERE a separate WebSocket host is needed, THE operator MAY set `VITE_WS_URL`; it is NOT declared in `render.yaml` today.
3. THE variables SHALL be set before `npm run build`, because Vite inlines them; changing them requires a rebuild/redeploy.
4. THE `.env.example` SHALL document `BACKEND_PROXY_TARGET` (dev only), `VITE_API_BASE_URL=/api` and an empty `VITE_WS_URL`.
5. THE configuration SHALL also accept `VITE_API_URL` as a fallback (legacy alias); it is undocumented in `.env.example` and `urls.ts` repeats it twice (harmless duplicate).

### Requirement 3: URL derivation and validation

**User Story:** As a developer, I want API and WebSocket URLs to be derived and validated in one place.

#### Acceptance Criteria

1. THE `apiUrl(path)` function SHALL join the base (default `/api`) with the path, trimming trailing/leading slashes.
2. WHEN the base is a relative path (starting with a single `/`), THE function SHALL accept it as same-origin; otherwise it SHALL require an `http(s)` URL.
3. IF the base contains credentials, a query string or a hash, THEN THE function SHALL throw "VITE_API_BASE_URL debe ser una URL HTTP(S) sin credenciales ni parámetros".
4. WHEN `VITE_WS_URL` is empty, THE `consoleUrl()` function SHALL derive `ws(s)://<host><prefix>/ws/console` from the API base (replacing a trailing `/api`), using `wss` over HTTPS.
5. IF `VITE_WS_URL` is not `ws(s)`, or contains credentials/query/hash, THEN THE function SHALL throw; IF the page is HTTPS and the URL is `ws:`, THEN it SHALL throw "Una consola HTTPS requiere WebSocket seguro (wss://)".
6. THE session token SHALL NOT be part of the configured URL (it is appended at connection time; see `realtime-console` Requirement 7).

### Requirement 4: Secrets policy

**User Story:** As an operator, I want no secrets in the public bundle.

#### Acceptance Criteria

1. THE repository, `.env.example` and the `dist/` bundle SHALL NOT contain passwords, JWT secrets, device tokens (`x-device-token`) or database URLs; `VITE_*` values are public by design.
2. THE `.env` files SHALL stay out of git (verified: ignored).
3. THE login credentials SHALL be typed by the pilot and never stored in the bundle (see `auth-session`).
4. WHERE an automated scan of `dist/` for secrets is desired, the project SHALL add it — NOT present.

### Requirement 5: Backend contract for cross-origin deployment

**User Story:** As an operator, I want frontend and backend on different Render domains to work.

#### Acceptance Criteria

1. THE backend SHALL allow the published frontend origin in `CORS_ORIGINS` (stated in `README.md`; backend configuration NOT verifiable here).
2. WHEN the Consola calls the API from another origin, THE REST adapter SHALL avoid unnecessary custom headers on public GETs, to reduce preflights (verified: `tests/unit/auth-integration.test.tsx` "without unnecessary preflight headers").
3. THE WebSocket handshake SHALL be accepted by the backend for the frontend origin (backend behaviour NOT verified).
4. WHILE the token travels as `?token=`, Render and proxy logs SHALL be assumed to record it (known issue; fix tracked in `realtime-console`).

### Requirement 6: Local development

**User Story:** As a developer, I want `npm run dev` to work against a local backend.

#### Acceptance Criteria

1. WHEN `npm run dev` runs, THE Vite server SHALL listen on port 5173 and proxy `/api` and `/ws` (with WebSocket upgrade) to `BACKEND_PROXY_TARGET` (default `http://127.0.0.1:8000`).
2. THE proxy variables SHALL NOT be embedded in the production build (`BACKEND_PROXY_TARGET` has no `VITE_` prefix).
3. THE `README.md` SHOULD list the current verification numbers; today its "59 pruebas" statement is outdated (see `testing-strategy`).

### Requirement 7 (PENDING): Hardening

**User Story:** As an operator, I want misconfiguration to fail loudly.

#### Acceptance Criteria

1. THE build SHOULD fail (or the app SHOULD show a clear error) when `VITE_API_BASE_URL` is unset in a production build on Render — NOT implemented.
2. THE `render.yaml` SHOULD declare `VITE_WS_URL` (empty) for discoverability — NOT done.
3. THE project SHOULD add security headers for the static site (CSP, `X-Content-Type-Options`) via `render.yaml` `headers` — NOT present.
