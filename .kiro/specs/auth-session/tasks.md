# Implementation Plan — Authentication and Session

## Overview

`[x]` marks work already done and verified in the code and tests; `[ ]` marks pending work. Tasks marked
`*` are optional. Evidence: `tests/unit/auth.test.tsx` (4) and `tests/unit/auth-integration.test.tsx` (5) pass.

## Tasks

- [x] 1. Login
  - [x] 1.1 `api.login` → `POST /auth/login` — `src/infrastructure/http/api.ts`
  - [x] 1.2 Login form with busy state, fixed error message, password cleared — `src/ui/components/AuthGate.tsx` (verified: `tests/unit/auth.test.tsx` "returns to the console after successful login")
  - [x] 1.3 No 401 loop on `/auth/login` — `src/infrastructure/http/api.ts`
  - [ ]* 1.4 Distinguish bad credentials from network failure in the message — `src/ui/components/AuthGate.tsx`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Token storage and use
  - [x] 2.1 `sessionStorage` token store — `src/infrastructure/config.ts`
  - [x] 2.2 Bearer header on REST (verified: `tests/unit/auth.test.tsx` "adds the session token…", `tests/unit/auth-integration.test.tsx`)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.3_

- [x] 3. 401 handling
  - [x] 3.1 Clear token + `AUTH_EVENT` on 401 — `src/infrastructure/http/api.ts` (verified: `tests/unit/auth.test.tsx`, `tests/unit/auth-integration.test.tsx` "expires rejected sessions…")
  - [x] 3.2 `AuthGate` swaps the console for the form — `src/ui/components/AuthGate.tsx` (verified: `tests/unit/auth-integration.test.tsx` "shows the login form…")
  - [x] 3.3 `/health` polling detects expiry within ~5 s — `src/application/hooks/useHealth.ts` (by code reading; no dedicated test)
  - [x] 3.4 Remount after login reloads data — `src/main.tsx`, `src/ui/components/AuthGate.tsx` (by code reading)
  - [ ] 3.5 "Session expired" notice (event `detail`) — `src/infrastructure/http/api.ts`, `src/ui/components/AuthGate.tsx`
  - [ ] 3.6 Let the pilot repeat the failed action after re-login — `src/application/state/ConsoleContext.tsx`
  - [ ] 3.7 Treat WebSocket rejection as expiry (needs the 1008 work in `realtime-console` task 7) — `src/infrastructure/realtime/ws.ts`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 4. Initial state
  - [x] 4.1 Console renders first; form appears after the first 401 — `src/ui/components/AuthGate.tsx`
  - [ ] 4.2 Show the form up front when there is no token and the backend requires auth — `src/ui/components/AuthGate.tsx`
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 5. Logout and proactive expiry (PENDING)
  - [ ] 5.1 "Cerrar sesión" control — `src/ui/components/Rail.tsx` or `src/ui/pages/System.tsx`
  - [ ]* 5.2 Decode JWT `exp`; warn before it ends — `src/infrastructure/config.ts`
  - [ ] 5.3 Tests for 3.5–5.2 — `tests/unit/`
  - _Requirements: 5.1, 5.2, 5.3_
