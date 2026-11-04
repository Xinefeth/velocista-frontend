# HU-37 · Medir un recorrido con el celular (0,75 SP)

*Requirements Document*

## Introduction

**User story (backlog):** *Como usuario, quiero recorrer el borde de un terreno con el celular para obtener su perímetro y área sin el robot.*

**Acceptance criteria of the backlog item:**
1. Página web en el celular, abierta desde el navegador con HTTPS.
2. Lee GPS (posición), giroscopio (giro) y acelerómetro (detecta si la persona camina o está quieta).
3. Pide permiso de ubicación y sensores; funciona con HTTPS.
4. Botones Iniciar y Terminar recorrido.
5. Muestra el trazo en vivo y al terminar el perímetro y el área.
6. Probado en Android y iPhone.
7. Si el lugar es chico para el GPS (según el error medido en SP-06), la página lo avisa y recomienda pasos.

Scope: the phone page (`velocista-frontend`, route `/celular`) and, for the result, the measurements API (`velocista-backend`). Most of the item was delivered in Sprint 2 (frontend PRs #9 and #16, backend EN-33 and EN-32). This spec records what is met, the gaps and how to close them.

## State today (verified on `main`: frontend `abfbc37`, backend `4d3fffb`; 2026-11-04)

| # | Criterion | State | Evidence |
|---|---|---|---|
| 1 | Web page over HTTPS | **Met** | `https://<frontend>/celular` and `/celular/` show the page (checked from outside on 2026-11-04); `celular.html` + `src/celular/` |
| 2 | Reads GPS, gyroscope, accelerometer; detects walking or still | **Partly** | `src/celular/sensors.ts` reads the three sensors (on the deployed page: gyroscope 0.0 °/s and accelerometer 9.30 m/s² at rest). The step detector exists (`stepCounter` in `src/domain/measurement/phone.ts`) and counts steps in the steps method. There is **no visible "caminando / quieto" state** in the *Medir* tab |
| 3 | Asks for location and sensor permissions over HTTPS | **Met on Android, not tested on iPhone** | `requestPermission` for motion after a tap, then `watchPosition` and Wake Lock (`sensors.ts`). Android: location was denied on the first test and had to be allowed in Chrome |
| 4 | Buttons *Iniciar* and *Terminar recorrido* | **Met** (wording differs) | `Measure.tsx`: "Iniciar medición" and "Terminar y calcular" |
| 5 | Live trace; perimeter and area at the end | **Met** | `Measure.tsx`: canvas "Mapa en vivo"; the result shows perimeter, area, closure error and quality (`result.perimeter_m`, `area_m2`) |
| 6 | Tested on Android and iPhone | **Not done** | Real-device check on Android started (sensors active, location permission pending); nothing on iPhone; no evidence recorded |
| 7 | Small place for the GPS: warn and recommend steps | **Partly** | The backend adds the warning `gps_space_too_small` after finishing ("El lugar es chico para el GPS: usa la medición por pasos.") using the typical accuracy of the readings (`compute.py`, `min_gps_size_m`). The *Medir* tab does **not** use the error measured in SP-06 (`GET /api/gps-trials/summary` → `min_side_m`), which the GPS-error tab already shows |

## Glossary
- **Recorrido** — the walk around the edge of a field, stored as a *measurement* (`method` `gps` or `steps`, `source` `phone`, `mount` `hand`).
- **SP-06 error** — the GPS error measured against a tape distance (GPS trials); the summary gives `min_side_m`, the smallest side for which the error stays under 10 %.
- **Small place** — a closed field whose side (perimeter / 4) is below `min_side_m`.

## Requirements

### Requirement 1: Estado «caminando / quieto» (criterion 2)
**User Story:** As a user, I want to see whether the phone detects that I walk or stand still, so that I know the sensors work and when to turn.

#### Acceptance Criteria
1. WHILE a measurement is running, THE *Medir* tab SHALL show the state "Caminando" or "Quieto", updated at least twice per second.
2. THE state SHALL come from the accelerometer (the same step detector as the steps method), without a request to the server.
3. IF no motion data arrives for 3 s, THEN THE tab SHALL say that the accelerometer does not respond, with the reason.
4. THE state SHALL not rely on colour alone (word plus icon) and SHALL use only the console colour tokens (no `--dim` for text).

### Requirement 2: Aviso de lugar chico con el error medido en SP-06 (criterion 7)
**User Story:** As a user, I want the page to warn me when the field is too small for my GPS, so that I use steps instead.

#### Acceptance Criteria
1. WHEN the method is GPS and the SP-06 summary of this phone has `min_side_m`, THE *Medir* tab SHALL show that minimum side before starting, with the text "Con el error de tu GPS, el lado mínimo es X m: si tu terreno es más chico, mide por pasos".
2. WHEN a closed GPS measurement finishes and its side (perimeter / 4) is below `min_side_m`, THE result SHALL show the warning and a button "Medir por pasos" that switches the method.
3. WHERE there are no SP-06 trials for the phone, THE tab SHALL say so and keep the backend warning `gps_space_too_small` as the fallback.
4. THE warning SHALL name the numbers (side measured, minimum side) and SHALL be readable by assistive technology (`role="status"`).

### Requirement 3: Pruebas en Android y iPhone (criterion 6)
**User Story:** As the owner, I want evidence that the page works on both platforms.

#### Acceptance Criteria
1. A checklist SHALL be run on one Android phone and one iPhone: HTTPS, permissions (location, motion), sensors, Wake Lock, start, live trace, finish, perimeter and area.
2. THE result of each step SHALL be recorded (date, model, system, browser) with a screenshot of the result screen.
3. WHERE a step fails on a platform, THE failure SHALL be recorded and a ticket opened; the item is not closed until it passes or the PO accepts the limitation.

### Requirement 4: Textos de los botones (criterion 4)
#### Acceptance Criteria
1. THE buttons SHALL read "Iniciar recorrido" and "Terminar recorrido" **if the PO asks for the exact wording**; otherwise the current "Iniciar medición" and "Terminar y calcular" stay (open question 1).

### Requirement 5: No regression
#### Acceptance Criteria
1. THE batches, the resend by `seq`, the 401 handling and the 409 cap handling SHALL keep working unchanged.
2. THE full suites of both repositories SHALL stay green.

## Out of scope
- The car method (PWM) and the speed model without PWM (see HU-30).
- Retention of readings and the live relay to the console.
- Changing the GPS algorithms.

## Open questions (PO)
1. Exact wording of the two buttons ("Iniciar recorrido" / "Terminar recorrido").
2. Is one Android and one iPhone enough for the test? Which models are available?
3. Show the SP-06 minimum side also in the GPS-error tab summary (already shown) or only in *Medir*? Recommended: both, same text.
