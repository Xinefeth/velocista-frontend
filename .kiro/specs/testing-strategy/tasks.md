# Implementation Plan — Testing Strategy

## Overview

`[x]` marks work already done and verified by running it; `[ ]` marks pending work. Tasks marked `*`
are optional. Verified numbers: `vitest run` → 47 passed, 0 failed, 12 skipped; typecheck and lint
clean; `format:check` fails in 3 files.

## Tasks

- [x] 1. Tooling
  - [x] 1.1 Vitest 2.1.8 + jsdom, `npm test` — `package.json`, `vite.config.ts`
  - [x] 1.2 Testing Library for React — `package.json` (`@testing-library/react`)
  - [ ]* 1.3 Decide on MSW / Playwright (documented as "suggested" in `docs/ARCHITECTURE.md`, not installed)
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Layout
  - [x] 2.1 `tests/unit` and `tests/integration` populated — `tests/`
  - [ ] 2.2 `tests/black-box` and `tests/e2e` are empty — `tests/black-box/.gitkeep`, `tests/e2e/.gitkeep`
  - [ ] 2.3 Fix `tests/README.md` ("carpetas vacías a propósito") — `tests/README.md`
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Existing coverage
  - [x] 3.1 REST boundary and URLs — `tests/unit/deployment.test.ts`, `tests/unit/frontend-refactor.test.ts`, `tests/unit/robot-http.test.ts`
  - [x] 3.2 Authentication — `tests/unit/auth.test.tsx`, `tests/unit/auth-integration.test.tsx`
  - [x] 3.3 Real-robot flow and command errors — `tests/integration/real-robot.test.tsx`, `tests/integration/robot-command-errors.test.tsx`
  - [x] 3.4 Run history — `tests/integration/run-history.test.tsx`
  - [x] 3.5 Context and builder labels — `tests/integration/frontend-context.test.tsx`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Close coverage gaps
  - [ ] 4.1 Unit tests for `strip`, `robotStatus`, `simulatorStatus` — `tests/unit/`
  - [ ] 4.2 `ws.ts` reconnection and `useHealth`/`useRealtime` — `tests/unit/`
  - [ ] 4.3 Control page with external simulator (`prepareExternalRun`, start/stop with `setup_id`) — `tests/integration/`
  - [ ] 4.4 Catalog/Builder create flows without the live stack — `tests/integration/`
  - [ ]* 4.5 e2e with Playwright against a running backend — `tests/e2e/`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 5. Quality gates
  - [x] 5.1 Scripts `typecheck`, `lint`, `format`, `format:check`, `test`, `build` — `package.json`
  - [ ] 5.2 Format the 3 failing files (`npm run format`) — `src/domain/simulatorStatus.ts`, `src/ui/components/Strip.tsx`, `src/ui/pages/Control.tsx`
  - [ ] 5.3 CI workflow running the gates — `.github/workflows/` (does not exist)
  - [ ]* 5.4 Add `@vitest/coverage-v8` and a threshold (requires approval to install)
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Live-stack tests
  - [x] 6.1 12 opt-in tests gated by `RUN_LIVE_QA=1`, skipped by default — `tests/integration/qa-live-stack.test.tsx`
  - [ ]* 6.2 Run them against the real backend and record the result (not verified in this session)
  - _Requirements: 6.1, 6.2_
