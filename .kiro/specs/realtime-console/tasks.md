# Implementation Plan — Realtime Console

## Overview

`[x]` marks work already done and verified in the code; `[ ]` marks pending work. Tasks marked `*` are
optional. Test evidence: `npx vitest run` → 47 passed, 12 skipped (see `testing-strategy`).

## Tasks

- [x] 1. WebSocket client
  - [x] 1.1 `listenConsole` with JSON parsing and silent drop of invalid frames — `src/infrastructure/realtime/ws.ts`
  - [x] 1.2 Fixed-interval reconnection `RETRY_MS = 3000`; clean `close()` — `src/infrastructure/realtime/ws.ts`
  - [x] 1.3 URL derivation (`ws`/`wss`, dedicated `VITE_WS_URL`, rejects insecure WS from HTTPS) — `src/infrastructure/config/urls.ts` (verified: `tests/unit/deployment.test.ts`)
  - [ ]* 1.4 Exponential backoff with jitter — `src/infrastructure/realtime/ws.ts`
  - [ ] 1.5 Unit test for reconnection and `close()` — `tests/unit/`
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3_

- [x] 2. Hooks and context
  - [x] 2.1 `useRealtime` (50-message buffer, `connected: null|boolean`) — `src/application/hooks/useRealtime.ts`
  - [x] 2.2 `useHealth` (5 s polling) — `src/application/hooks/useHealth.ts`
  - [x] 2.3 `ConnectionContext` / `useConnection` / `useOptionalConnection` — `src/application/state/ConnectionContext.tsx`
  - _Requirements: 1.4, 2.4, 3.1, 3.2, 3.3_

- [x] 3. Robot status (HU-14)
  - [x] 3.1 `robotStatusFromMessages` — `src/domain/robotStatus.ts`
  - [x] 3.2 `useRobotConnection` keeps manifest/status snapshots; clears on link drop — `src/application/hooks/useRobotConnection.ts` (verified: `tests/integration/real-robot.test.tsx` "keeps the manifest…", `tests/integration/robot-command-errors.test.tsx` "clears real connection after a gateway disconnect")
  - [x] 3.3 Commands blocked when robot is not linked or ID differs — `src/application/state/ConsoleContext.tsx` (`sendRobotCommand`) (verified: `tests/integration/real-robot.test.tsx`)
  - [x] 3.4 `Strip` header uses real battery/link/loop — `src/ui/components/Strip.tsx`
  - [ ] 3.5 Unit tests for `robotStatusFromMessages` — `tests/unit/`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 4. Simulator status
  - [x] 4.1 `simulatorFromMessages` — `src/domain/simulatorStatus.ts`
  - [x] 4.2 Simulator line in `App` and start/stop gating — `src/app/App.tsx`, `src/ui/pages/Control.tsx`
  - [ ] 4.3 Unit tests for `simulatorFromMessages` (connection freshness, run events) — `tests/unit/`
  - [ ]* 4.4 Format `simulatorStatus.ts` (fails `prettier --check`) — `src/domain/simulatorStatus.ts`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 5. Sensor strip (HU-15)
  - [x] 5.1 `stripFromSignals` / `stripFromMessages` with thresholds — `src/domain/strip.ts`
  - [x] 5.2 Regleta card in Control with "Sin datos" waiting state — `src/ui/pages/Control.tsx`
  - [ ] 5.3 Remove duplicated strip maths for simulator telemetry (reuse `strip.ts`) — `src/ui/pages/Control.tsx`
  - [ ] 5.4 Unit tests for `strip.ts` — `tests/unit/`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 6. Authenticate the socket with a first message (PENDING, backend proposal)
  - [ ] 6.1 Send `{"type":"auth","token":<JWT>}` in `onopen`; stop adding `?token=` — `src/infrastructure/realtime/ws.ts`, `src/infrastructure/config.ts` (`socketUrl`)
  - [ ] 6.2 Mark `connected` only after the server accepts — `src/infrastructure/realtime/ws.ts`
  - [ ] 6.3 Update URL/token tests to assert no query token and an `auth` first frame — `tests/unit/auth.test.tsx`, `tests/unit/auth-integration.test.tsx`
  - [ ]* 6.4 Confirm with the backend repo that `auth` is accepted before removing `?token=`
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 7. Reconnect after close 1008 (PENDING)
  - [ ] 7.1 On `onclose` with `code === 1008`: dispatch `AUTH_EVENT`, stop retrying with the old token — `src/infrastructure/realtime/ws.ts`
  - [ ] 7.2 Reconnect with the new token after login (today by remount under `AuthGate`; add a test) — `src/ui/components/AuthGate.tsx`
  - [ ] 7.3 Test with a fake `WebSocket` closing with 1008 — `tests/unit/`
  - _Requirements: 8.1, 8.2, 8.3_
