# Requirements Document — Testing Strategy

## Introduction

This spec records how `velocista-frontend` is tested today, the quality gates (typecheck, lint,
format) and the coverage gaps. Numbers come from running the commands on the branch
`feat/conectar-ingesta-simulador`:

| Command | Result |
|---|---|
| `npx vitest run` | 9 files passed, 1 skipped · **47 passed, 0 failed, 12 skipped** (59 tests) |
| `npm run typecheck` (`tsc -b`) | clean |
| `npm run lint` (`eslint .`) | clean |
| `npm run format:check` | **3 files fail**: `src/domain/simulatorStatus.ts`, `src/ui/components/Strip.tsx`, `src/ui/pages/Control.tsx` |
| Coverage | **not measured**: `@vitest/coverage-v8` is not installed and nothing was installed for this spec |

**Scope note:** these numbers are for the checked-out branch. `origin/main` is ahead and adds about
29 files / 1,876 lines (including new `tests/unit/infrastructure/*.test.ts`, e.g. `persistence.test.ts`,
`urls.test.ts`) that are NOT in this branch and were NOT run here; re-run this inventory after merging
`origin/main`. The README claims "59 tests passed with `RUN_LIVE_QA=1`" and Prettier passing; today
Prettier reports 3 files, so that README statement is out of date.

The 12 skipped tests are all in `tests/integration/qa-live-stack.test.tsx`, which only runs when
`RUN_LIVE_QA=1` and needs the real backend + PostgreSQL behind the Vite proxy (not verified here).

## Glossary

- **Vitest**: Test runner (`vitest@2.1.8`, environment `jsdom`, `globals: false`).
- **Testing Library**: `@testing-library/react@16.1.0`; the only UI test library installed.
- **Prueba unitaria (unit)**: Test of a pure function or adapter with `fetch` stubbed.
- **Prueba de integración**: Test that mounts providers/pages with simulated messages or API.
- **Live QA**: `qa-live-stack.test.tsx`, opt-in against a running stack.
- **Quality gate**: `typecheck`, `lint`, `format:check`, `test`, `build`.

## Requirements

### Requirement 1: Test tooling

**User Story:** As a developer, I want a single, fast test runner, so that I can verify changes locally.

#### Acceptance Criteria

1. THE project SHALL run tests with `npm test` (`vitest run`) using the `jsdom` environment
   configured in `vite.config.ts` (`test: { environment: "jsdom", globals: false }`).
2. THE project SHALL use `@testing-library/react` for component/page tests.
3. WHERE `docs/ARCHITECTURE.md` suggests MSW (API mocking) and Playwright (e2e), THE project SHALL
   treat them as NOT installed (verified: absent from `package.json`); tests stub `fetch` and
   `WebSocket` manually.

### Requirement 2: Test layout

**User Story:** As a developer, I want tests separated by type.

#### Acceptance Criteria

1. THE project SHALL keep tests under `tests/` outside `src/`: `unit/`, `integration/`,
   `black-box/` (empty, `.gitkeep`), `e2e/` (empty, `.gitkeep`).
2. WHEN a test imports app code, THE test SHALL use the `@/` alias.
3. THE `tests/README.md` SHOULD describe the real content; today it claims the folders are empty.

### Requirement 3: What the suite covers

**User Story:** As a maintainer, I want to know which behaviour is protected.

#### Acceptance Criteria

1. THE suite SHALL cover the REST boundary: URL building, headers, error normalisation, paginated
   loading, spec-key translation, `base_version_id` body, setup/mode/line endpoints
   (`deployment.test.ts` 8, `frontend-refactor.test.ts` 14, `robot-http.test.ts` 2, `auth-integration.test.tsx` 5).
2. THE suite SHALL cover authentication: Bearer header, 401 clears the token and shows login, login
   returns to the console, WebSocket URL carries the session token (`auth.test.tsx` 4, `auth-integration.test.tsx`).
3. THE suite SHALL cover the real-robot flow with simulated messages: real status instead of local
   simulator, manifest kept after leaving the buffer, no control of a different robot ID, gateway
   rejection and disconnect (`real-robot.test.tsx` 3, `robot-command-errors.test.tsx` 3).
4. THE suite SHALL cover run history: mapping of DB ids, pagination and ordering, loading on mount,
   retry after failure, note persistence, no simulated run generated (`run-history.test.tsx` 6).
5. THE suite SHALL cover the context API and builder labels (`frontend-context.test.tsx` 2) and
   storage-schema migration plus domain rules (`frontend-refactor.test.ts`).

### Requirement 4: Known coverage gaps

**User Story:** As a maintainer, I want the gaps listed so that they can be prioritised.

#### Acceptance Criteria

1. THE suite SHALL (target) include unit tests for `domain/strip.ts`, `domain/robotStatus.ts`,
   `domain/simulatorStatus.ts`; today there is NO test file referencing them directly (verified by file names; behaviour only indirectly via `real-robot.test.tsx`).
2. THE suite SHALL (target) test `ws.ts` reconnection (`RETRY_MS`) and `useHealth` polling; today only the WebSocket URL is tested.
3. THE suite SHALL (target) test the Control page with the external simulator (`prepareExternalRun`, start/stop with `setup_id`); not covered today.
4. THE suite SHALL (target) test Catalog/Builder create flows (`createRobot`, `createComponent`, `saveVersion`); only `qa-live-stack` (skipped) touches them.
5. THE suite SHALL (target) have no e2e tests; `tests/e2e/` is empty.

### Requirement 5: Quality gates

**User Story:** As a maintainer, I want code checks that fail early.

#### Acceptance Criteria

1. THE project SHALL expose `typecheck`, `lint`, `format`, `format:check`, `test` and `build` scripts in `package.json`.
2. WHEN `npm run format:check` runs, THE project SHALL report no files; today 3 files fail (Requirement 5 is NOT met).
3. WHEN a pull request is opened, THE project SHOULD run the gates in CI; no CI workflow exists in the repo (no `.github/` directory; not verified in GitHub settings).
4. WHERE coverage is required, THE project SHALL add `@vitest/coverage-v8` and a threshold; not done.

### Requirement 6: Live-stack tests

**User Story:** As a developer, I want an opt-in test against the real backend.

#### Acceptance Criteria

1. WHEN `RUN_LIVE_QA=1` is set, THE live test file SHALL run 12 tests against the Vite proxy; otherwise it SHALL be skipped.
2. IF the backend is not running, THEN the live tests SHALL stay skipped by default so `npm test` is green offline.
