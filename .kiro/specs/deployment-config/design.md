# Design Document — Deployment and Configuration

## Introduction

The deployment unit is the `dist/` folder produced by `npm run build`. Render serves it as a static
site with an SPA rewrite. Two public variables decide where the bundle talks to: `VITE_API_BASE_URL`
(REST) and `VITE_WS_URL` (optional WebSocket). Their parsing, validation and the WebSocket URL
derivation live in `infrastructure/config/urls.ts`; the token and `socketUrl()` live in
`infrastructure/config.ts`.

## Goals & Non-Goals

**Goals**

- Document the Render configuration, the variables and the URL rules as they are.
- Document the CORS/WebSocket expectations on the backend and the "no secrets" policy.

**Non-Goals**

- Provisioning Render, DNS, TLS or the backend service.
- Backend CORS implementation.
- Changing configuration files (documentation only).

## Architecture Overview

```
 GitHub (main) ──► Render static site "velocista-frontend"
                     build:  npm ci && npm run build        (VITE_* inlined here)
                     publish: ./dist     rewrite /* → /index.html
                         │
   Browser loads SPA ◄───┘
        │ REST  https://BACKEND/api/*      (CORS: origin ∈ CORS_ORIGINS of backend)
        │ WS    wss://BACKEND/ws/console   (derived, or VITE_WS_URL)
        ▼
   velocista-backend (separate Render web service) ──► PostgreSQL

 Dev:  browser ─► Vite :5173 ─proxy /api, /ws─► BACKEND_PROXY_TARGET (default http://127.0.0.1:8000)
```

## Component Design

### 3.1 Variables

| Variable | Where | Default | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | Render dashboard (`sync: false`) | `/api` | absolute HTTPS URL ending in `/api` on Render |
| `VITE_API_URL` | code fallback | — | legacy alias; not in `.env.example` |
| `VITE_WS_URL` | optional | derived | must be `wss://` when the page is HTTPS |
| `BACKEND_PROXY_TARGET` | local `.env` | `http://127.0.0.1:8000` | dev only, not bundled |

### 3.2 URL rules (`config/urls.ts`)

- `apiBase()` returns the trimmed base; a relative `/…` is accepted; absolute must be `http(s)` without credentials, query or hash.
- `apiUrl(path)` = `${base}/${path without leading slash}`.
- `consoleUrl(location, base, configured)` → configured `VITE_WS_URL`, or the base with protocol `ws(s)` and `/api` replaced by `/ws/console`; validates scheme and forbids `ws:` from an HTTPS page.
- `socketUrl()` (`config.ts`) adds `?token=` — see `realtime-console` for the pending change.
- Covered by `tests/unit/deployment.test.ts` (8 tests): same-origin, cross-domain, prefix, dedicated WS URL, insecure WS rejection, credential rejection, base URL in requests, header merging.

### 3.3 Known deployment risks

1. **Missing `VITE_API_BASE_URL`** → default `/api` → on a static host the rewrite answers `index.html` with 200, so API calls "succeed" with HTML and `response.json()` fails (`request()` swallows to `null`). The app shows load errors, not a configuration error.
2. **Rebuild needed** to change URLs (values are inlined).
3. **Token in the WS query** is logged by the host/proxy until the `auth`-frame change lands.
4. **No security headers** in `render.yaml`.

### 3.4 Secrets

Only public values exist in this repo. `dist/` was not scanned in this session; the policy is enforced by convention
(and by `apiUrl`/`consoleUrl` rejecting `user:pass@` URLs), not by tooling.

## Design Decisions

1. **Static site, no Node server**: cheapest hosting; configuration is therefore build-time.
2. **Derive WS from the API URL** so one variable is enough for the common case.
3. **Fail on insecure schemes** (`ws:` from HTTPS, credentials in URL) at runtime with explicit messages.
4. **Keep `BACKEND_PROXY_TARGET` without `VITE_` prefix** so it never reaches the bundle.

## Open points / not verified

- The actual Render service (name, env values, auto-deploy branch) and the backend `CORS_ORIGINS`.
- Whether `origin/main` changes `render.yaml`/`urls.ts` (only the test additions were noticed in the diff stat; source files not compared line by line).
- Contents of the current `dist/` (a stale local build folder exists; it was not inspected).
