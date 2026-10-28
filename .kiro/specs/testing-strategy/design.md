# Design Document — Testing Strategy

## Introduction

The frontend is tested with Vitest + jsdom + Testing Library, with the network replaced by manual
stubs (`vi.stubGlobal("fetch", …)`, a fake `WebSocket`, and injected `ConnectionContext` messages).
Tests live in `tests/` and are grouped by type, mirroring the layering described in the
`architecture` spec. This design documents what exists and the gaps; it does not add or change tests.

## Goals & Non-Goals

**Goals**

- Document tools, layout, real counts and what each file protects.
- List coverage gaps and the quality-gate status honestly.

**Non-Goals**

- Installing coverage, MSW or Playwright (needs explicit approval; nothing was installed).
- Writing new tests (documentation-only task).

## Architecture Overview

```
tests/
├─ unit/          (adapters + pure logic, fetch stubbed)          5 files · 33 tests
│    auth, auth-integration, deployment, frontend-refactor, robot-http
├─ integration/   (providers + pages with simulated WS messages)  5 files · 14 run + 12 skipped
│    frontend-context, real-robot, robot-command-errors, run-history,
│    qa-live-stack (12, skipped unless RUN_LIVE_QA=1)
├─ black-box/     empty (.gitkeep)
└─ e2e/           empty (.gitkeep)

Gates:  tsc -b  ·  eslint .  ·  prettier --check "src/**/*.{ts,tsx,css}"  ·  vitest run  ·  vite build
```

Per-file counts (from `vitest run`): robot-http 2, deployment 8, frontend-refactor 14,
auth-integration 5, auth 4 (unit = 33); real-robot 3, robot-command-errors 3, run-history 6,
frontend-context 2 (run = 14) and qa-live-stack 12 skipped. Total 47 passed + 12 skipped = 59.

## Component Design

### 3.1 Test files and what they protect

| File | Layer under test | Protects |
|---|---|---|
| `unit/deployment.test.ts` | `infrastructure/config/urls.ts`, `request` | Same-origin and cross-domain URLs, proxy prefix, dedicated WS URL, `wss` required from HTTPS, rejects credentials in `VITE_*` |
| `unit/frontend-refactor.test.ts` | `api.ts`, `persistence.ts`, `domain` | Robot/version/component mapping, pagination, error reasons, 204 handling, localStorage migration and malformed data, cost/mass maths, form validation |
| `unit/auth*.test.tsx` | `request`, `AuthGate`, `socketUrl` | Bearer header, 401 → clear token + `AUTH_EVENT` → login form, WS URL with session token, spec-key translation |
| `unit/robot-http.test.ts` | `http/robot.ts` | `storeSetup` + `applyStoredSetup`, mode/line endpoints |
| `integration/real-robot.test.tsx` | `ConsoleContext`, `useRobotConnection` | Real status instead of local simulator, commands via backend, robot-ID check, manifest kept |
| `integration/robot-command-errors.test.tsx` | idem | Backend rejection leaves real state intact; setup not marked applied; disconnect clears connection |
| `integration/run-history.test.tsx` | `runs.ts`, `ConsoleContext` | DB ids, pagination/order, load on mount, retry, note persistence, no simulated run |
| `integration/frontend-context.test.tsx` | `ConsoleContext`, Builder | Renamed actions/values, Spanish version labels |
| `integration/qa-live-stack.test.tsx` | whole stack | Health/DB via proxy, lists, empty-DB screen, version body, runs endpoint (opt-in) |

### 3.2 Gaps (no test found by file name or direct import)

- `domain/strip.ts`, `domain/robotStatus.ts`, `domain/simulatorStatus.ts`, `domain/simulator.ts`, `domain/canvas.ts`, `domain/engineer.ts`: no dedicated unit tests (`rules` partly via `frontend-refactor`).
- `infrastructure/realtime/ws.ts` reconnect/close behaviour; `useHealth` polling; `useRealtime` buffer (`MAX_MESSAGES`).
- `Control` page with the external simulator; `Strip` header; `System`, `Telemetry`, `MapView`, `Rules` pages.
- Create flows (`createRobot`, `createComponent`, `saveVersion`) outside the skipped live test.
- No e2e, no black-box tests, no coverage report, no CI.

### 3.3 Quality gates status

`typecheck` ✔ · `lint` ✔ · `test` ✔ (47/0/12 skipped) · `format:check` ✘ (3 files) · `build` not run for this spec.

## Design Decisions

1. **Manual stubs instead of MSW**: keeps dependencies minimal; the cost is repeated stub code. Adding MSW
   would require approval and a dependency change.
2. **Opt-in live QA**: the default `npm test` must be green offline, so stack-dependent tests are gated by `RUN_LIVE_QA`.
3. **Tests outside `src/`**: matches the backend layout and keeps the production bundle clean.
4. **Coverage unmeasured**: `@vitest/coverage-v8` is absent; proposing it as a pending task instead of installing it.

## Open points / not verified

- Real coverage percentage (no tool).
- The 12 live tests were not run (no backend in this session).
- `npm run build` was not executed for this spec.
