# Requirements Document — Frontend Architecture (Clean Architecture)

## Introduction

`velocista-frontend` is the pilot's console: a React 18 + TypeScript + Vite single-page app, kept in
a repository separate from the backend (`velocista-backend`). This spec documents the layered
architecture the code actually follows (`ui` / `application` / `domain` / `infrastructure`, plus the
cross-cutting `app` and `shared`), the dependency rule, the outbound adapters (REST, WebSocket,
contracts, persistence), the anti-corruption translation of the REST contract, and how the app is
built as a static site. Facts were verified by reading `src/`, `eslint.config.js`, `tsconfig.json`,
`vite.config.ts` and `render.yaml`, and by running `typecheck`, `lint` and `vitest`.

Reference diagrams (linked, not copied):

- System high-level diagram: `C:\Users\Usuario\Desktop\diagramas_arquitectura\figura1_arquitectura_alto_nivel.svg`
- Component descriptions: `C:\Users\Usuario\Desktop\diagramas_arquitectura\3.1_descripcion_componentes.md`
- In-repo summary: `docs/ARCHITECTURE.md` (partly outdated, see Requirement 8).

## Glossary

- **Consola**: Interfaz web (SPA) del piloto; este repositorio.
- **API**: Backend (`velocista-backend`); único punto de integración con robot, simulador y base de datos.
- **Capa (layer)**: Carpeta de `src/` con una responsabilidad y reglas de importación (`domain`,
  `application`, `infrastructure`, `ui`, más `app` y `shared`).
- **Regla de dependencia**: Las dependencias apuntan hacia el dominio; `domain/` no depende de la UI.
- **Adaptador de salida (outbound adapter)**: Código de `infrastructure/` que habla con el exterior
  (REST, WebSocket, localStorage).
- **Contrato (contract)**: Tipos del cable (REST y WebSocket) en `infrastructure/contracts/`.
- **Anti-corruption layer (ACL)**: Traducción entre el contrato REST (inglés) y el modelo de dominio
  de la consola, hecha en `infrastructure/http/`.
- **Sitio estático**: Build de Vite (`dist/`) servido sin servidor propio (Render static site).

## Requirements

### Requirement 1: Layered source structure

**User Story:** As a developer, I want the source split by responsibility, so that I can find and
change code without side effects across layers.

#### Acceptance Criteria

1. THE Consola SHALL organise `src/` into `domain/` (pure business logic and `models/`),
   `application/` (`hooks/` and `state/`), `infrastructure/` (`http/`, `realtime/`, `contracts/`,
   `config/`, `persistence/`), `ui/` (`components/`, `pages/`, `styles/`), `app/` and `shared/`.
2. THE Consola SHALL import across layers using the `@/` alias mapped to `src/` in both
   `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`).
3. THE Consola SHALL keep code identifiers in English and leave Spanish for comments and
   user-visible text.

### Requirement 2: Dependency rule

**User Story:** As a developer, I want dependencies to point toward the domain, so that business logic
can be tested without React or I/O.

#### Acceptance Criteria

1. THE `application/` layer SHALL NOT import from `ui/` (verified: no `@/ui` import under `src/application`).
2. THE `infrastructure/` layer SHALL NOT import from `application/` or `ui/` (verified by grep: none).
3. THE `domain/` layer SHOULD NOT import from `application/`, `ui/` or `infrastructure/`. IF a
   `domain/` file imports a wire type from `infrastructure/contracts/`, THEN it SHALL be a type-only
   import and be tracked as a known deviation (Requirement 8).
4. THE `shared/` layer SHALL NOT import from `ui/`, `application/` or `infrastructure/` (verified).
5. WHEN a dependency-rule violation is introduced, THE build tooling SHALL fail (automated check —
   NOT implemented today; only the `fetch`/`WebSocket` rule of Requirement 3 is enforced).

### Requirement 3: I/O confined to infrastructure

**User Story:** As a developer, I want all network access in one layer, so that endpoints and
transports can change without touching views.

#### Acceptance Criteria

1. THE Consola SHALL call `fetch` only from `src/infrastructure/http/**` and open `WebSocket` only
   from `src/infrastructure/realtime/**`.
2. WHEN code outside those folders references the global `fetch` or `WebSocket`, THE linter SHALL
   report an error (`no-restricted-globals` in `eslint.config.js`).
3. THE REST adapter SHALL expose a single `request<T>()` that builds the URL via `apiUrl()`, adds
   `Content-Type` for bodies and `Authorization: Bearer` when a token exists, and converts failures
   to `ErrorApi { status, reason, detail }`.

### Requirement 4: Anti-corruption translation of the REST contract

**User Story:** As a pilot, I want views to be independent of the REST format, so that backend field
changes do not break the screens.

#### Acceptance Criteria

1. WHEN the Consola loads robots, components or runs, THE REST adapter SHALL map the English wire
   types (`RobotApi`, `ComponenteApi`, `CorridaApi`, `RobotVersionApi`) into domain models
   (`RobotDef`, `Component`, `Corrida`) before views use them (`api.robots.selection`, `toComponent`, `toRun`).
2. WHEN specs cross the boundary, THE REST adapter SHALL translate the legacy Spanish spec keys to
   English names (e.g. `celdas` ↔ `cells`) in both directions (`SPEC_KEYS`).
3. WHEN the backend returns an error body, THE REST adapter SHALL normalise `{reason, detail}`,
   `{detail:{reason,detail}}` and validation arrays into one `ErrorApi`.
4. WHERE contract type names are still Spanish (`MensajeConsola`, `EstadoRobot`, `Corrida`), THE
   Consola SHALL keep them until the coordinated contract rename (pending, Requirement 8).

### Requirement 5: Outbound adapters

**User Story:** As a developer, I want each external dependency behind one adapter.

#### Acceptance Criteria

1. THE Consola SHALL talk REST through `infrastructure/http/{api,robot,runs}.ts`.
2. THE Consola SHALL listen to the backend in real time through `infrastructure/realtime/ws.ts`
   (`listenConsole`); the Consola SHALL only listen on `/ws/console`.
3. THE Consola SHALL define wire types in `infrastructure/contracts/{api,contract,messages}.ts`.
4. THE Consola SHALL read build-time configuration only through `infrastructure/config.ts` and
   `infrastructure/config/urls.ts`.
5. WHILE running without the API (fixtures injected via `initialRobots`), THE Consola SHALL persist
   registered robots/components in `localStorage` through `infrastructure/persistence/persistence.ts`.
6. THE `ui/` layer SHOULD reach infrastructure only through `application/`. Today three UI files
   import `@/infrastructure` directly (`AuthGate.tsx`, `Control.tsx`, `System.tsx`) — known deviation.

### Requirement 6: Application layer orchestration

**User Story:** As a developer, I want use cases and shared state in `application/`.

#### Acceptance Criteria

1. THE Consola SHALL mount providers in this order in `src/main.tsx`: `AuthGate` → `ConnectionProvider`
   → `ConsoleProvider` → `App`.
2. THE `application/hooks` SHALL provide `useHealth`, `useRealtime`, `useRobotConnection`, `useCanvas`.
3. THE `application/state` SHALL provide `ConnectionContext` (API health + real time) and
   `ConsoleContext` (navigation, robots, runs, setup, commands).
4. WHERE `ConsoleContext.tsx` has ~1500 lines, THE project SHOULD split it by use case (pending).

### Requirement 7: Static deployment

**User Story:** As an operator, I want the Consola deployed as a static site.

#### Acceptance Criteria

1. THE Consola SHALL build with `npm ci && npm run build` (`tsc -b && vite build`) into `dist/`.
2. THE `render.yaml` SHALL declare a `runtime: static` service `velocista-frontend` publishing
   `./dist` with an SPA rewrite `/* → /index.html`.
3. THE Consola SHALL receive `VITE_API_BASE_URL` (and optionally `VITE_WS_URL`) at build time; they
   SHALL be public values. Details live in the `deployment-config` spec.

### Requirement 8: Documentation matches the code

**User Story:** As a new developer, I want architecture docs that match reality.

#### Acceptance Criteria

1. THE `docs/ARCHITECTURE.md` SHALL describe the tests that exist (currently it says the test folders
   are empty and suggests MSW/Playwright, which are not installed).
2. THE Consola SHALL track the translation of contract field/type names to English as a coordinated
   change with the backend (pending).
