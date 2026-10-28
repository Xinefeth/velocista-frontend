# Requirements Document — Run Control and History

## Introduction

This spec covers the Control page (start/stop, setup, calibration, mode/line) and the run history
(`Runs` page, `infrastructure/http/runs.ts`), plus how robots, versions and the component catalog
(Builder/Catalog) are consumed from the REST API. The Consola has three command targets:

1. **Real robot** (`source === "robot"`): commands go to the backend, which relays them to the device.
2. **External simulator** (`source === "sim"` in API mode): start/stop with a stored `setup_id` and a PID-only setup; run results are *ingested by the backend* and the Consola only reads the history.
3. **Local simulation** (fixtures via `initialRobots`, not used in production): in-browser simulator.

Facts verified in `src/application/state/ConsoleContext.tsx`, `src/ui/pages/Control.tsx`,
`src/ui/pages/Runs.tsx`, `src/infrastructure/http/{api,robot,runs}.ts` and the tests named in `tasks.md`.
Backend semantics of each endpoint are NOT verified from this repo.

## Glossary

- **Corrida (run)**: Intento del velocista persistido por el backend (`CorridaApi`, tabla de BD): número, tiempo, error acumulado `iae`, batería, sectores, controlador, parámetros, nota, índice `J`.
- **Vuelta (lap)**: Vuelta dentro de una corrida; solo existe en la simulación local (`Vuelta`). No hay consumo REST de vueltas en este repo.
- **Setup**: Controlador + parámetros (`Setup`), guardado en BD (`POST /robots/{id}/setups`) y aplicado con su id.
- **Versión**: Configuración de piezas de un robot (`RobotVersionApi`); la corrida se asocia a la versión actual.
- **Robot / Catálogo / Armador (Builder)**: Robots (`/robots`), componentes (`/components`) y la página que arma versiones.
- **apiMode**: `true` cuando no se inyectan `initialRobots` (producción).
- **Simulador externo**: Servicio que ejecuta corridas y las ingesta en el backend.

## Requirements

### Requirement 1: Start and stop a run

**User Story:** As a pilot, I want to start and stop a run on the selected target.

#### Acceptance Criteria

1. WHEN the source is the real robot and the pilot presses start/stop, THE Consola SHALL send `start` or `stop` via `POST /devices/robot/commands`.
2. WHEN the source is the external simulator and the pilot starts a run, THE Consola SHALL first ensure a stored setup (`prepareExternalRun`), then send `start` with `{setup_id}` and `robot_id` through the same command endpoint.
3. WHEN the pilot stops an external-simulator run, THE Consola SHALL send `stop` without a setup id.
4. IF the simulator is not ready (`simulator.connected` and `tiempoReal` ok), THEN THE Consola SHALL show "El simulador externo no está listo." and send nothing.
5. IF the robot is not linked or its manifest id differs from the selected robot, THEN THE Consola SHALL show "El robot seleccionado no está conectado a la API." and send nothing.
6. IF the backend rejects a command, THEN THE Consola SHALL show the backend message in a toast, keep the previous real state and not claim success.
7. WHILE a simulator command is pending, THE Control page SHALL block repeated submissions (`commandPending`).
8. THE Consola SHALL NOT generate simulated runs for the external simulator; the backend ingests them (verified: `tests/integration/run-history.test.tsx` "does not ask the backend to generate a simulated run").

### Requirement 2: Calibration, mode and line

**User Story:** As a pilot, I want to calibrate and choose test/competition mode and line colour on the real robot.

#### Acceptance Criteria

1. WHEN the pilot changes mode or line on a real robot, THE Consola SHALL call `POST /robots/{id}/mode-line/{mode|line}`.
2. WHEN the pilot calibrates a real robot, THE Consola SHALL send the `calibrate` command through the command endpoint.
3. WHILE the source is the external simulator, THE Control page SHALL show calibration as "No requerido" and mode/line as unavailable.
4. IF the robot is not calibrated and the source is the local simulation, THEN THE Consola SHALL refuse to start with "Calibra los sensores antes de arrancar.".

### Requirement 3: Setup storage and application

**User Story:** As a pilot, I want my controller setup saved and associated with the run.

#### Acceptance Criteria

1. WHEN the pilot saves a setup in API mode, THE Consola SHALL `POST /robots/{id}/setups` with `version_id`, name "Setup de consola", `controller_id` and `parameters`.
2. IF the selected robot has no current version, THEN THE Consola SHALL show "Guarda una versión del robot antes de guardar el setup." and not call the API.
3. WHEN the source is the real robot and the setup was stored, THE Consola SHALL apply it with `POST /robots/{id}/setups/{setup_id}/apply`; IF delivery fails, THEN it SHALL report that the setup was saved but not sent and not mark it applied (verified: `tests/integration/robot-command-errors.test.tsx`).
4. WHILE the source is the external simulator, THE Control page SHALL accept only the `pid` controller and send `{controller:"pid", parameters:{kp,ki,kd,base_speed}}` with the `setup` command.
5. WHEN a run starts and no stored setup id exists, THE Consola SHALL store the applied setup first and reuse its id (`prepareExternalRun`).

### Requirement 4: Run history

**User Story:** As a pilot, I want to see every persisted run, also after reloading.

#### Acceptance Criteria

1. WHEN the production console mounts, THE Consola SHALL load the run history with `GET /runs` in pages of 200 until `total` is reached, and refresh it every 5 s.
2. THE Consola SHALL de-duplicate runs by database `id`, sort by `number` and map them with `toRun` (source label "Meta" for `time_source = finish`, otherwise "Telemetría"; version label from the robot's current version or `#<version_id>`).
3. IF loading fails, THEN THE `Runs` page SHALL show "No se pudo cargar el historial: …" with a retry button (`refreshRuns`).
4. WHEN the pilot adds a note, THE Consola SHALL `PATCH /runs/{id}` with the concatenated note and report success only after the API accepts it; IF the run has no database id, THEN it SHALL fail with "La corrida aún no está guardada".
5. THE Consola SHALL NOT edit any other run field (time, iae, sectors) from the UI.
6. THE history SHOULD include per-lap data from the backend — NOT consumed today (only `sectors_s` per run).

### Requirement 5: Robots and catalog (Builder)

**User Story:** As a pilot, I want robots and components to come from the database.

#### Acceptance Criteria

1. WHEN the production console mounts, THE Consola SHALL load robots with `GET /robots` (paged, 200) and each current version with `GET /robots/{id}/versions/{version_id}`, without local fallback; WHILE loading it SHALL show a loading state and, on failure, "No se pudieron cargar los robots: …" with retry.
2. WHEN the list loads, THE Consola SHALL keep the selected robot if it still exists, otherwise select the first.
3. WHEN the production console mounts, THE Consola SHALL load components with `GET /components` (paged, 200); IF it fails, THEN the catalog stays empty with no error shown (the robots error already reports a backend outage).
4. WHEN the pilot creates a robot, component or version, THE Consola SHALL `POST /robots`, `POST /components`, `POST /robots/{id}/versions` (status `current`, parts as `{component_id, quantity}`) and refresh the lists; backend failures SHALL appear as toasts.
5. IF there are no robots, THEN THE Builder SHALL offer to register the first one.
6. THE Consola SHALL use `localStorage` (`apaec.v2.*`) for robots/components only in fixture mode (`initialRobots`), never in production.

### Requirement 6 (PENDING): Gaps

**User Story:** As a maintainer, I want the missing behaviours listed.

#### Acceptance Criteria

1. THE Control page SHALL have automated tests for the external-simulator start/stop flow — NOT present.
2. THE catalog load failure SHOULD be shown to the user — NOT implemented (silent catch).
3. THE history polling (5 s) SHOULD pause when the tab is hidden or the window unmounts on auth loss — not implemented (stops only on unmount).
4. THE Consola SHOULD consume per-lap data and run detail endpoints if the backend exposes them — unknown.
