# Implementation Plan — Deployment and Configuration

## Overview

`[x]` marks work already done and verified in the code/tests; `[ ]` marks pending work. Tasks marked `*`
are optional. Evidence: `tests/unit/deployment.test.ts` (8 tests) passes.

## Tasks

- [x] 1. Static build and publish
  - [x] 1.1 Render static service, build and publish path — `render.yaml`
  - [x] 1.2 SPA rewrite `/*` → `/index.html` — `render.yaml`
  - [x] 1.3 Build script `tsc -b && vite build` — `package.json`
  - [x] 1.4 Git-ignore `dist`, `.env*`, `*.tsbuildinfo` — `.gitignore`
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 2. Public variables
  - [x] 2.1 `VITE_API_BASE_URL` with `sync: false` — `render.yaml`
  - [x] 2.2 `.env.example` with dev proxy, API base and WS URL — `.env.example`
  - [x] 2.3 Legacy `VITE_API_URL` fallback — `src/infrastructure/config.ts`, `src/infrastructure/config/urls.ts`
  - [ ]* 2.4 Declare `VITE_WS_URL` in `render.yaml` and document `VITE_API_URL` or remove it — `render.yaml`, `.env.example`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.2_

- [x] 3. URL derivation and validation
  - [x] 3.1 `apiUrl`, `consoleUrl` with scheme/credential checks — `src/infrastructure/config/urls.ts` (verified: `tests/unit/deployment.test.ts`)
  - [x] 3.2 `socketUrl` with token — `src/infrastructure/config.ts` (verified: `tests/unit/auth.test.tsx`)
  - [x] 3.3 HTTP requests honour the configured backend (verified: `tests/unit/deployment.test.ts` "uses the configured backend…")
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Secrets policy
  - [x] 4.1 No secrets in `.env.example`, `render.yaml`, `src/` (grep for `VITE_` and credential patterns: only public config) — repo
  - [x] 4.2 Credentials rejected in public URLs (verified: `tests/unit/deployment.test.ts` "rejects accidental credentials…")
  - [ ]* 4.3 Scan `dist/` for secret patterns in CI — no CI (see `testing-strategy`)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Cross-origin contract
  - [x] 5.1 No unnecessary preflight headers on public GET (verified: `tests/unit/auth-integration.test.tsx`)
  - [ ] 5.2 Confirm `CORS_ORIGINS` includes the published origin and that `/ws/console` accepts it (backend/Render, not verifiable here)
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Local development
  - [x] 6.1 Vite proxy for `/api` and `/ws` (with WS upgrade), port 5173 — `vite.config.ts`
  - [ ] 6.2 Update the README verification paragraph ("59 pruebas … Prettier pasaron") — `README.md`
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 7. Hardening (PENDING)
  - [ ] 7.1 Fail loudly if `VITE_API_BASE_URL` is unset in a production build — `vite.config.ts` or `src/infrastructure/config/urls.ts`
  - [ ]* 7.2 Security headers (CSP, nosniff) in `render.yaml`
  - [ ] 7.3 Test for the missing-variable guard — `tests/unit/deployment.test.ts`
  - _Requirements: 7.1, 7.2, 7.3, 1.4_
