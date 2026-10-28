# Implementation Plan — Run Control and History

## Overview

`[x]` marks work already done and verified in the code (and tests where noted); `[ ]` marks pending work.
Tasks marked `*` are optional. Evidence: `npx vitest run` → 47 passed, 12 skipped.

## Tasks

- [x] 1. Start/stop routing
  - [x] 1.1 Real robot start/stop via command endpoint, guarded by link and manifest id — `src/application/state/ConsoleContext.tsx` (`sendRobotCommand`, `toggleRunning`) (verified: `tests/integration/real-robot.test.tsx`)
  - [x] 1.2 External simulator start with `setup_id`, stop without — `src/ui/pages/Control.tsx` (`toggleRun`), `src/application/state/ConsoleContext.tsx` (`prepareExternalRun`)
  - [x] 1.3 Backend rejection shown, state preserved — `src/application/state/ConsoleContext.tsx` (verified: `tests/integration/robot-command-errors.test.tsx`)
  - [x] 1.4 No simulated run created by the client (verified: `tests/integration/run-history.test.tsx`)
  - [ ] 1.5 Tests for the Control page external-simulator start/stop — `tests/integration/`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 6.1_

- [x] 2. Calibration, mode and line
  - [x] 2.1 Mode/line endpoints — `src/infrastructure/http/robot.ts` (verified: `tests/unit/robot-http.test.ts`)
  - [x] 2.2 `calibrate` command and local calibration gate — `src/application/state/ConsoleContext.tsx`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Setup persistence
  - [x] 3.1 `storeSetup` / `applyStoredSetup` (verified: `tests/unit/robot-http.test.ts`) — `src/infrastructure/http/robot.ts`
  - [x] 3.2 Not marked applied when delivery fails (verified: `tests/integration/robot-command-errors.test.tsx`) — `src/application/state/ConsoleContext.tsx` (`saveSetup`)
  - [x] 3.3 PID-only guard for the external simulator — `src/ui/pages/Control.tsx`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Run history
  - [x] 4.1 Paged load, de-dup, sort, map — `src/infrastructure/http/runs.ts` (verified: `tests/integration/run-history.test.tsx`)
  - [x] 4.2 5 s refresh and error + retry — `src/application/state/ConsoleContext.tsx`, `src/ui/pages/Runs.tsx` (verified: "exposes a failed history request and allows retry")
  - [x] 4.3 Notes via `PATCH /runs/{id}` (verified: "persists notes before reporting success") — `src/infrastructure/http/runs.ts`
  - [ ] 4.4 Consume per-lap data if the backend offers it (unknown) — `src/infrastructure/http/runs.ts`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 5. Robots, catalog and versions
  - [x] 5.1 `selection()` paged with current version, no fallback — `src/infrastructure/http/api.ts` (verified: `tests/unit/frontend-refactor.test.ts` "loads current version quantities and statuses…")
  - [x] 5.2 Components load, create — `src/infrastructure/http/api.ts` (verified: `tests/unit/frontend-refactor.test.ts`)
  - [x] 5.3 `createRobot`, `createComponent`, `saveVersion` — `src/application/state/ConsoleContext.tsx` (live checks only in the skipped `tests/integration/qa-live-stack.test.tsx`)
  - [x] 5.4 Empty-state to register the first robot — `src/application/state/ConsoleContext.tsx`, `src/ui/pages/Builder.tsx` (live test, skipped)
  - [ ] 5.5 Show catalog load failure to the user — `src/application/state/ConsoleContext.tsx`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.2_

- [ ] 6. Robustness (PENDING, optional)
  - [ ]* 6.1 Pause history polling when the tab is hidden — `src/application/state/ConsoleContext.tsx`
  - [ ]* 6.2 Split `ConsoleContext` into run/robot/setup hooks — `src/application/`
  - _Requirements: 6.3_
