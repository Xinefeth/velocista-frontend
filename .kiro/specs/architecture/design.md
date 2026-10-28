# Design Document — Frontend Architecture (Clean Architecture)

## Introduction

The Consola is a Clean-Architecture SPA. Views (`ui`) read state and call use cases (`application`);
pure logic lives in `domain`; every contact with the outside world (REST, WebSocket, localStorage,
build-time env) is an adapter in `infrastructure`. The API is the single integration point of the
system: neither the robot, the simulator nor the Consola touches the database directly (see the
linked component description). This design records the structure as it is in the code today,
including deviations from the intended rule.

Linked references (not copied):
`C:\Users\Usuario\Desktop\diagramas_arquitectura\figura1_arquitectura_alto_nivel.svg` and
`C:\Users\Usuario\Desktop\diagramas_arquitectura\3.1_descripcion_componentes.md`.

## Goals & Non-Goals

**Goals**

- Document layers, the dependency rule and what is enforced vs. only agreed.
- Document the outbound adapters and the REST anti-corruption layer.
- Document the static deployment on Render.

**Non-Goals**

- Changing any code or moving files (this spec is documentation only).
- The system-level architecture (robot/gateway/DB): owned by the backend repo and the linked diagrams.
- Renaming Spanish contract names to English (cross-cutting migration, tracked as pending).

## Architecture Overview

```
                    Browser (static SPA, dist/)
 ┌───────────────────────────────────────────────────────────────────┐
 │  app/ + main.tsx   AuthGate → ConnectionProvider → ConsoleProvider │
 │                                                                   │
 │  ui/  (pages, components, styles)                                 │
 │    │ useConsole() / useConnection()                               │
 │    ▼                                                              │
 │  application/  hooks (useHealth, useRealtime, useRobotConnection) │
 │                state (ConnectionContext, ConsoleContext)          │
 │    │ calls                                  │ uses                │
 │    ▼                                        ▼                     │
 │  infrastructure/                        domain/  ◄── shared/      │
 │   http/ api.ts robot.ts runs.ts  (ACL)   rules, simulator,        │
 │   realtime/ ws.ts                        strip, robotStatus,      │
 │   contracts/ api, contract, messages     simulatorStatus, models  │
 │   config.ts, config/urls.ts                                       │
 │   persistence/ (localStorage)                                     │
 └───────┬───────────────────────┬───────────────────────────────────┘
         │ REST  /api/*          │ WebSocket /ws/console
         ▼                       ▼
                 velocista-backend (API)  ──SQL──►  PostgreSQL
                 ▲ /ws/robot        ▲ /ws/sim (external simulator)
```

Intended dependency rule (from `docs/ARCHITECTURE.md`):

```
ui → application → domain ← infrastructure
                     ↑
                   shared
```

Verified state of the rule (grep over `src/`):

| Edge | Result |
|---|---|
| `application → ui` | none (OK) |
| `infrastructure → application/ui` | none (OK) |
| `shared → anything` | none (OK) |
| `domain → infrastructure` | type-only imports in `robotStatus.ts`, `strip.ts`, `simulatorStatus.ts` (`MensajeConsola`, `EstadoRobot`, `Senales`) and `rules.ts` (`RobotApi`). Deviation: domain depends on wire types. |
| `ui → infrastructure` | `AuthGate.tsx`, `Control.tsx`, `System.tsx` call `api`/config directly. Deviation. |

## Component Design

### 3.1 Layers

| Layer | Contents (real files) |
|---|---|
| `domain/` | `rules.ts`, `simulator.ts`, `engineer.ts`, `canvas.ts`, `format.ts`, `strip.ts`, `robotStatus.ts`, `simulatorStatus.ts`; `models/domain.ts`, `models/runs.ts` |
| `application/` | `hooks/` (`useHealth`, `useRealtime`, `useRobotConnection`, `useCanvas`), `state/` (`ConnectionContext`, `ConsoleContext`) |
| `infrastructure/` | `http/` (`api`, `robot`, `runs`), `realtime/ws.ts`, `contracts/` (`api`, `contract`, `messages`), `config.ts`, `config/urls.ts`, `persistence/persistence.ts` |
| `ui/` | `pages/` (Control, Telemetry, Runs, MapView, Catalog, Builder, Rules, System), `components/` (+ `management/`), `styles/` |
| `app/`, `shared/` | `App.tsx` (shell and tab router); `shared/data/` (catalog, controllers, robots, rulebook fixtures) |

### 3.2 Outbound adapters

- **REST (`http/api.ts`)**: `request<T>(path, options)` → `fetch(apiUrl(path))`; adds Bearer token;
  on 401 (except `/auth/login`) clears the token and dispatches `AUTH_EVENT`; maps errors to `ErrorApi`.
  Exposes `api.{login, command, health, robots, catalog, runs}`.
- **`http/robot.ts`**: `storeSetup`, `applyStoredSetup`, `changeModeLine` (per-robot endpoints).
- **`http/runs.ts`**: `loadRunHistory` (paginates, de-duplicates by id, sorts by `number`), `toRun`, `annotateRun`.
- **Real time (`realtime/ws.ts`)**: `listenConsole(onMessage, onStatusChange)`; retries every `RETRY_MS` = 3000.
- **Persistence**: `localStorage` keys `apaec.v2.*`, used only for fixtures (`initialRobots`) and a
  few UI preferences; never in production API mode for robots/components.

### 3.3 Anti-corruption layer

The wire contract is English (`docs/CONTRACT.md` in the backend) while the domain models use
camelCase names. `api.ts` converts in both directions: `RobotApi` → `RobotDef` (`short_code`→`short`,
`current_version_id`→`currentVersionId`, parts `component_id/quantity`→`id/qty`), `ComponenteApi` →
`Component` (`mass_g`→`mass`, `type_id`→`typeId`, spec keys through `SPEC_KEYS`), `CorridaApi` → `Corrida`
(`toRun`). Views never see `*Api` types.

### 3.4 Tooling that enforces the architecture

- `eslint.config.js`: `no-restricted-globals` forbids `fetch`/`WebSocket` outside `infrastructure/http`
  and `infrastructure/realtime`.
- `tsconfig.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, alias `@/*`.
- There is NO import-boundary lint rule for the layer dependency rule (not verified in tests either).

### 3.5 Deployment as a static site

`render.yaml`: `runtime: static`, `buildCommand: npm ci && npm run build`, `staticPublishPath: ./dist`,
env `VITE_API_BASE_URL` (`sync: false`), SPA rewrite `/*`→`/index.html`. Vite inlines `VITE_*` at
build time, so changing the API URL requires a rebuild. See the `deployment-config` spec.

## Design Decisions

1. **Clean Architecture over MVC**: keeps domain testable without React; consistent with the backend.
2. **ACL in `http/`**: the REST contract may change names (Spanish→English) without touching views.
3. **Single place for I/O, enforced by ESLint**: the only architectural rule with automatic enforcement today.
4. **Type-only imports of contracts in domain**: pragmatic shortcut; a cleaner fix is to move the
   message envelope types into `domain/models/` and let `infrastructure/contracts` import them.
5. **One large `ConsoleContext`** (≈1500 lines) concentrates use cases; splitting is deferred.

## Open points / not verified

- Whether the Render service currently deployed matches `render.yaml` (not verifiable from the repo).
- `docs/ARCHITECTURE.md` still says tests are empty and suggests MSW/Playwright; neither is installed.
