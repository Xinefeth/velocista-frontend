# HU-30 · Construir el mapa desde la primera vuelta (1 SP)

*Requirements Document*

## Introduction

**User story (backlog):** *Dibujar el mapa del recorrido medido con la odometría (carro con el celular encima; si no hay carro, una persona con el celular), solo para análisis.*

**Acceptance criteria of the backlog item:**
1. Dibuja el trazo con datos reales del carro con el celular encima (o de una persona con el celular si no hay carro); el simulador solo sirve para desarrollar.
2. Muestra perímetro estimado, error de cierre y giro sobrante (debe acercarse a 360°).
3. Muestra el error del perímetro frente a la pista diseñada.
4. En modo competencia el robot no usa el mapa.
5. Se prueba con una pista dibujada en el piso o diseñada en el trazador: el carro da una vuelta con el celular encima y el mapa se compara con el diseño. Si no hay carro, una persona la recorre con el celular.
6. En este sprint es la parte de mapa del caso CU-2; la optimización del carro pasa al siguiente sprint.

Scope: frontend (*Mapa de pista* view and its comparison card) and, for one optional field, the measurements API. Most of the item was delivered in Sprint 2 (frontend `feat/mapa-pista`, backend EN-33). This spec records what is met, the gaps and how to close them.

## State today (verified on `main`: frontend `abfbc37`, backend `4d3fffb`; 2026-11-04)

| # | Criterion | State | Evidence |
|---|---|---|---|
| 1 | Trace with real data of the car with the phone, or a person with the phone | **Person: met. Car: not available** | `src/ui/components/measurement/TrackComparison.tsx` draws the measured path (`corrected_path`) of a finished phone measurement (`laps()` keeps odometry measurements: steps or car, not GPS) over the tracer design. The *car* method is disabled in the phone page ("próximamente"): the car has no electronics and there is no speed model without PWM. The simulator-based map (`DesdeVuelta` in `src/ui/pages/MapView.tsx`) is kept for development |
| 2 | Estimated perimeter, closure error and leftover turn (should approach 360°) | **Met, with a doubt about the wording** | `compareTrack()` in `src/domain/measurement/trackCompare.ts` shows 4 rows: *Largo de la vuelta*, *Área encerrada*, *Error de cierre* and *Giro sobrante* (`heading_drift_deg`, "giro sobrante frente a ±360°"). The **total turn** (≈ 360° when the lap closes) is computed in the backend (`odo.total_turn` in `compute.py`) but **not exposed** |
| 3 | Perimeter error against the designed track | **Met** | Row *Largo de la vuelta*: design vs measured and `diffPct`; backend `perimeter_error_pct` when the measurement carries a `reference` |
| 4 | In competition mode the robot does not use the map | **Met by design; needs an explicit test** | The map views are marked "solo análisis" (`MapView.tsx`, `TrackComparison.tsx` header); the speed-by-map switch in `Control.tsx` is always disabled (HU-33 is outside this course) and, after HU-10, blocked with its reason for restricted profiles. The black-box test "explains the competition mode lock" exists; none checks that the map has no control over the run |
| 5 | Tested with a floor track or a tracer design; car or person | **Partly** | End-to-end case CU-2 with simulated phone data passes (`tests/e2e/flows/casos-de-uso.e2e.ts`, evidence `docs/evidencias/e2e-sprint2/CU-2.png`). No real-field test with a physical track |
| 6 | Part of CU-2; car optimisation is next sprint | **Met** (scope) | |

## Glossary
- **Lap (vuelta)** — a finished phone measurement by odometry (`method` `steps`, later `car`).
- **Designed track** — a track saved in the Tracer (`/api/tracks`), with perimeter and area (`perimeter_cm`, `area_cm2`).
- **Leftover turn** — `heading_drift_deg`: how far the measured turn is from ±360°; ideally close to 0.
- **Total turn** — the measured turn of the whole lap in degrees; ideally ±360° for a closed lap.

## Requirements

### Requirement 1: Giro total y giro sobrante (criterion 2)
**User Story:** As an analyst, I want to see the total turn and the leftover, so that I can tell whether the lap closed properly.

#### Acceptance Criteria
1. THE comparison table SHALL show the **total turn** (expected ±360°) next to the **leftover turn** (expected near 0°), with the unit.
2. WHEN the leftover is above a tolerance (default 15°), THE row SHALL be marked as a warning with a word and an icon, not only a colour.
3. THE backend SHALL expose the total turn of an odometry measurement as an additive, optional field of the result (`turn_total_deg`), `null` for GPS measurements.
4. THE new field SHALL be documented in `docs/CONTRACT.md` and in Swagger, with its unit and meaning, and SHALL not change any existing field.

### Requirement 2: Mapa solo para análisis (criterion 4)
**User Story:** As a pilot, I want to be sure that the robot does not use the map in competition.

#### Acceptance Criteria
1. THE *Mapa de pista* view and the comparison card SHALL state that the map is for analysis only.
2. THE console SHALL offer no control that sends the map or its derived data to the robot, in any mode.
3. A black-box test SHALL check that the speed-by-map control is disabled in test and in competition mode and that the map views contain no start/stop or send controls.

### Requirement 3: Datos reales y simulador (criterion 1)
#### Acceptance Criteria
1. THE comparison SHALL list only measurements from real phones (`source` `phone`) by default; simulator measurements SHALL appear only when the user turns on a "mostrar simulador (desarrollo)" option.
2. THE car case SHALL be listed as "no disponible" with the reason (no speed model without PWM) until the PO decides how to measure speed (open question 1).

### Requirement 4: Prueba con una pista real (criterion 5)
#### Acceptance Criteria
1. A real-field test SHALL be run: a track designed in the Tracer and drawn on the floor with tape, walked by a person with the phone (steps method, closed, `reference` linked to the saved track).
2. THE result SHALL show length error, area error, closure error and turn, and a screenshot SHALL be saved as evidence.
3. THE test SHALL record the measured values against the designed ones and whether the length error is within the PO's tolerance (open question 3).

### Requirement 5: No regression
#### Acceptance Criteria
1. THE existing comparison rows, the track selector, the alignment and the legend SHALL keep working.
2. THE full suites of both repositories SHALL stay green.

## Out of scope
- Car optimisation and the car method (next sprint).
- Using the map during a run (HU-33).
- Changing the odometry algorithms.

## Open questions (PO)
1. The car "with the phone on top" has no electronics: how is its speed measured? Options: average speed from the known track length and the lap time (shape and angles only; scale from the plan), or GPS speed outdoors. Until decided, the person case is the supported one.
2. Is the leftover turn (`heading_drift_deg`) what the item calls "giro sobrante (debe acercarse a 360°)", or does it want the total turn shown? Recommended: show both (Requirement 1).
3. Accepted length error for the real-field test (for example 5 %)?
4. Which tracer track will be used for the field test, and where will it be taped?
