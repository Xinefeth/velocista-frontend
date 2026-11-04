# HU-10 · Bloquear en la consola lo que prohíbe el reglamento (0,5 SP)

*Requirements Document*

## Introduction

**User story (backlog):** *Bloquear en la consola lo que prohíbe el reglamento.* La consola desactiva lo que el perfil de reglamento no permite.

**Acceptance criteria of the backlog item:**
1. La barra superior muestra el perfil activo.
2. Las opciones prohibidas se ven desactivadas con el motivo.
3. Cambiar de perfil actualiza los bloqueos sin recargar.

Scope: frontend of the console (`velocista-frontend`). The backend already serves the rules as data (`GET /api/profiles`, read-only). No backend change is required for the three criteria.

## State today (verified on `main`, frontend `abfbc37`, backend `4d3fffb`, 2026-11-04)

| Criterion | State | Evidence |
|---|---|---|
| 1. Top bar shows the active profile | **Met** (needs a test) | `src/ui/components/Strip.tsx` chip `regchip`: `<b>{profile.tag}</b> · {profile.cat}`, green or red depending on whether the current robot complies; click opens the *Perfiles de reglamento* view |
| 2. Forbidden options appear disabled with the reason | **Partly** | Only one option is gated: the speed-map function in `src/ui/pages/Control.tsx` (`why`: "Bloqueado por {competición} · {categoría}: …"). In the Builder (`src/ui/pages/Builder.tsx`) every catalogue item is selectable for every slot; a forbidden part is only reported **afterwards** by the compliance panel (`checks()` in `src/domain/rules.ts`, severity `bad`) |
| 3. Changing profile updates the blocks without reloading | **Mostly** | `setProfile` in `ConsoleContext` is plain React state (persisted in the store under `profile`); the chip and the compliance panel recompute. The new blocks of criterion 2 will derive from the same state |

Profile data: the console reads four **static** profiles from `src/shared/data/rulebook.ts` (`PERFILES`: `mr4a`, `mr4s`, `mr4m`, `club`). The backend seeds the same four profiles with their rules as data (migration `0003_reference_data.json`, keys such as `turbine`, `encoders`, `imu`, `commercial_pcb`, `motor_families`, `allowed_mcus`, `chassis_materials`, `dimensions_mm`, `max_sensors`, `motors`, `speed_map`, `wireless_start`, `mr4`). The track tracer already reads `/api/profiles`. Parity between the static data and the API seed has **not** been verified.

## Glossary

- **Profile** — a competition and category with its rules (for example Muchik Rumble 4 · Amateur).
- **Rule** — one field of the profile (for example `turbine = false`).
- **Blocked option** — an option of the console that the active profile forbids.
- **Reason** — the visible text that says which profile and which rule block the option.
- **Builder** — the *Armador* view where parts are chosen for each slot (`RANURAS`).

## Requirements

### Requirement 1: Perfil activo en la barra superior (criterion 1)

**User Story:** As a pilot, I want to see which profile is active at all times, so that I know which rules apply.

#### Acceptance Criteria
1. THE top bar SHALL show the tag and the category of the active profile on every view.
2. THE chip SHALL show whether the current robot complies (green) or not (red) and SHALL not rely on colour alone (icon or text).
3. WHEN the active profile changes, THE chip SHALL update without reloading the page.
4. THE chip SHALL be reachable by keyboard and SHALL open the *Perfiles de reglamento* view.

### Requirement 2: Opciones prohibidas desactivadas en el Armador (criterion 2)

**User Story:** As a builder of robots, I want the parts that the profile forbids to be disabled with the reason, so that I do not assemble an illegal robot by mistake.

#### Acceptance Criteria
1. WHEN a rule of the active profile forbids a whole slot or a single catalogue item, THE Builder SHALL show that option disabled.
2. THE Builder SHALL show the reason of every disabled option as visible text (profile and rule), not only as a tooltip.
3. THE disabled option SHALL keep its place in the list so that the pilot sees what exists and why it cannot be used.
4. THE rule-to-option mapping SHALL be the one in the table below (to be validated by the PO).
5. WHERE a catalogue item lacks the data needed to evaluate a rule, THE Builder SHALL leave it enabled and the compliance panel SHALL remain the check.

| Rule (console field) | Option blocked | Where | Data used |
|---|---|---|---|
| `turbine = false` | whole slot *Turbina* | Builder | profile |
| `enc = false` | whole slot *Encoders* | Builder | profile |
| `imu = false` | whole slot *IMU* | Builder | profile |
| `commercialPcb = false` | expansion boards that are commercial | Builder, slot *Placa de expansión* | `specs.comercial` |
| `motorFam` | motors whose family is not allowed | Builder, slot *Motores* | `specs.familia` |
| `mcu` | microcontrollers not in the allowed list | Builder, slot *Microcontrolador* | item name |
| `chasisMat` | chassis whose material is not allowed | Builder, slot *Chasis* | `specs.material` |
| `dim` | chassis larger than the allowed size | Builder, slot *Chasis* | `specs.ancho`, `specs.largo` |
| `maxSensors` | line-sensor options that exceed the maximum of channels | Builder, slot *Sensores de línea* | `specs.canales` × quantity |
| `motors` | the "more" quantity button at the maximum | Builder, slot *Motores* | profile |
| `speedMap = false` | the speed-map function | Control | profile (already done) |

### Requirement 3: Motivo claro y accesible

**User Story:** As a pilot, I want an understandable reason, so that I know what to change.

#### Acceptance Criteria
1. THE reason SHALL name the profile and the rule, in plain Spanish (for example: "Turbina no permitida en Muchik Rumble 4 · Amateur").
2. THE reason SHALL be associated with the disabled control (`aria-describedby`) so that assistive technology reads it.
3. THE reason text SHALL meet a contrast of at least 4.5:1 against its background and SHALL use only the colour tokens of the console (no new colours, no `--dim` for text).
4. THE blocked state SHALL be recognisable without colour (lock icon or the word "no permitido").
5. THE layout SHALL work at 360 px width without horizontal scroll.

### Requirement 4: Cambio de perfil sin recargar (criterion 3)

**User Story:** As a pilot, I want the blocks to follow the profile, so that I can compare competitions quickly.

#### Acceptance Criteria
1. WHEN the active profile changes, THE Builder and the Control view SHALL recompute every block in the same render, without reloading the page and without a request to the server.
2. THE selected profile SHALL persist as it does today (store key `profile`).
3. WHEN the profile changes, THE console SHALL keep showing the compliance panel and the top-bar chip consistent with the new blocks.

### Requirement 5: Piezas ya elegidas que el nuevo perfil prohíbe

**User Story:** As a pilot, I want to see which parts of my robot break the new profile, without the console deleting them.

#### Acceptance Criteria
1. WHEN a part already selected becomes forbidden by a profile change, THE Builder SHALL keep it selected, SHALL mark its slot as "no permitido" with the reason and SHALL keep the compliance panel in `bad`.
2. THE Builder SHALL NOT remove or replace parts by itself.
3. THE other items of that slot that are forbidden SHALL stay disabled; the pilot can still switch to a permitted item or to "— Ninguno —".
4. WHEN the part is replaced by a permitted one, THE mark SHALL disappear without reloading.

### Requirement 6: Fuente de los datos del perfil

**User Story:** As the owner, I want one source of truth for the rules.

#### Acceptance Criteria
1. THE rule evaluation SHALL be a pure function of `(profile, slot, item)` that does not read global state.
2. THE first delivery SHALL keep using the existing profile data of the console and SHALL NOT change the backend.
3. A test SHALL compare the rules the console uses with the profiles the API seed defines, for the keys of the mapping table, and SHALL fail if they differ (see open question 2).

### Requirement 7: Pruebas

#### Acceptance Criteria
1. Unit tests SHALL cover the evaluation function for each rule of the table, for the four profiles, with allowed and forbidden items.
2. Black-box tests SHALL render the Builder with each profile and check the disabled options and their reasons.
3. A black-box test SHALL change the profile and check that the blocks update without reloading.
4. A test SHALL check that a part already selected is kept and marked when the new profile forbids it (Requirement 5).
5. THE chip of the top bar SHALL have a test (Requirement 1).

## Out of scope
- Editing profiles (the API is read-only and the *Perfiles de reglamento* view is informative).
- Changing the backend or the database.
- Blocking the run itself when the robot does not comply (open question 1).
- Track rules of the tracer (EN-28 already handles `rules.track`).

## Open questions (PO)
1. Should **ARRANCAR** be blocked in competition mode when the robot does not comply with the profile? Today it only turns the chip red. Recommended: no, show a warning.
2. Which source of truth for the profile data: keep the static `PERFILES` now (recommended) and move to `/api/profiles` in a later item, or move now. The tracer policy says "no fallback profiles".
3. Is the mapping table complete? In particular: should the number of wheels, drivers and the start mode (`wireless`) also block options?
4. Should the top bar let the pilot switch the profile directly (today the chip opens the profiles view)? Recommended: no, keep it as is.
