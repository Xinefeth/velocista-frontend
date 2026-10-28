# Implementation Plan — Frontend Architecture (Clean Architecture)

## Overview

Documentation of the architecture as built, plus pending hardening. `[x]` marks work already done
and verified in the code; `[ ]` marks pending work. Tasks marked `*` are optional. Verified on the
branch `feat/conectar-ingesta-simulador`: `npm run typecheck` (clean), `npm run lint` (clean),
`npx vitest run` (47 passed, 12 skipped).

## Tasks

- [x] 1. Layered structure and alias
  - [x] 1.1 Folders `domain/ application/ infrastructure/ ui/ app/ shared/` — `src/`
  - [x] 1.2 `@/` alias in TypeScript and Vite — `tsconfig.json`, `vite.config.ts`
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Dependency rule (partial)
  - [x] 2.1 No `application → ui`, `infrastructure → application/ui`, `shared → *` imports (grep verified) — `src/`
  - [ ] 2.2 Remove type imports `domain → infrastructure/contracts` (move envelope types into `domain/models/`) — `src/domain/{robotStatus,strip,simulatorStatus,rules}.ts`
  - [ ] 2.3 Route `AuthGate`, `Control`, `System` through `application/` instead of `@/infrastructure` — `src/ui/`
  - [ ]* 2.4 Add an import-boundary lint rule (`no-restricted-imports` per layer) — `eslint.config.js`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.6_

- [x] 3. I/O confined to infrastructure
  - [x] 3.1 `no-restricted-globals` for `fetch`/`WebSocket`, disabled only in `http/` and `realtime/` — `eslint.config.js`
  - [x] 3.2 Single `request<T>()` with Bearer, JSON header and `ErrorApi` — `src/infrastructure/http/api.ts`
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Anti-corruption layer
  - [x] 4.1 `RobotApi/ComponenteApi/CorridaApi` → domain models — `src/infrastructure/http/api.ts`, `src/infrastructure/http/runs.ts`
  - [x] 4.2 Bidirectional `SPEC_KEYS` translation (verified: `tests/unit/auth-integration.test.tsx`, `tests/unit/frontend-refactor.test.ts`)
  - [x] 4.3 Error normalisation `toApiError` (verified: `tests/unit/frontend-refactor.test.ts` "preserves business error reasons")
  - [ ] 4.4 Rename Spanish contract types (`MensajeConsola`, `EstadoRobot`, `Corrida`, `Salud`…) in lockstep with the backend — `src/infrastructure/contracts/`
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Outbound adapters
  - [x] 5.1 REST — `src/infrastructure/http/{api,robot,runs}.ts`
  - [x] 5.2 WebSocket listener — `src/infrastructure/realtime/ws.ts`
  - [x] 5.3 Contracts — `src/infrastructure/contracts/{api,contract,messages}.ts`
  - [x] 5.4 Config/URLs — `src/infrastructure/config.ts`, `src/infrastructure/config/urls.ts`
  - [x] 5.5 localStorage persistence for fixtures — `src/infrastructure/persistence/persistence.ts` (verified: `tests/unit/frontend-refactor.test.ts` storage migration)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Application layer
  - [x] 6.1 Providers order `AuthGate → ConnectionProvider → ConsoleProvider` — `src/main.tsx`
  - [x] 6.2 Hooks and contexts — `src/application/hooks/`, `src/application/state/`
  - [ ]* 6.3 Split `ConsoleContext.tsx` (≈1500 lines) by use case — `src/application/state/ConsoleContext.tsx`
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Static deployment
  - [x] 7.1 Render static site, `dist`, SPA rewrite — `render.yaml`
  - [x] 7.2 `npm run build` = `tsc -b && vite build` — `package.json`
  - [ ]* 7.3 Verify the live Render service matches `render.yaml` (not verifiable from the repo)
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 8. Documentation sync
  - [ ] 8.1 Update `docs/ARCHITECTURE.md` testing section (tests exist; MSW/Playwright not installed) — `docs/ARCHITECTURE.md`
  - [ ] 8.2 Update `tests/README.md` ("carpetas vacías a propósito" is false) — `tests/README.md`
  - _Requirements: 8.1_
