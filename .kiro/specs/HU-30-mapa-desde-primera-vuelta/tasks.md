# HU-30 · Construir el mapa desde la primera vuelta (1 SP)

*Implementation Plan*

## Status (2026-11-04)

- **Done and merged:** backend point B1 `turn_total_deg` (PR #18 of the backend); frontend point F1 — *Giro total* row, tolerance marking, "Solo análisis" text and real-phone filter (PR #19 of the frontend).
- **Pending:** real-field test with a physical track (3.x); E2E case CU-2 was extended but **not run** (Playwright is not installed in the working copy), see 4.4; the car case (0.1); the other decisions of the PO (0.2 to 0.4); visual validation (4.2).

Order: decisions, backend B1, frontend F1, owner field test. No agent commits or pushes; the user commits one point at a time. No task touches Render or the production database.

- [ ] 0. Decisions (PO)
  - [ ] 0.1 How is the car's speed measured without PWM? (average speed from track length and lap time, or GPS) _Requirement 3.2_
  - [ ] 0.2 Show the total turn as well as the leftover? (recommended: yes) _Requirement 1_
  - [ ] 0.3 Accepted length error for the field test _Requirement 4_
  - [ ] 0.4 Which tracer track and where is it taped _Requirement 4_
- [x] 1. Backend point B1 — total turn (done and merged, PR #18 of the backend)
  - [x] 1.1 `Result.turn_total_deg` from `odo.total_turn`; `None` for GPS and for old rows _Requirement 1.3_
  - [x] 1.2 `ResultOut` and OpenAPI: description, unit, example; no existing field changes _Requirement 1.3, 1.4_
  - [x] 1.3 `docs/CONTRACT.md`: `turn_total_deg`, `heading_drift_deg`, `min_gps_size_m` and the result warnings _Requirement 1.4_
  - [x] 1.4 Tests: square, circle, GPS → null, legacy → null, OpenAPI contract; full suite, ruff _Requirement 5.2_
- [x] 2. Frontend point F1 — comparison and analysis-only
  - [x] 2.1 Result type with `turn_total_deg`; row *Giro total* and tolerance marking in `trackCompare.ts` _Requirement 1.1, 1.2_
  - [x] 2.2 Visible "Solo análisis" text in `MapView.tsx` and `TrackComparison.tsx` _Requirement 2.1_
  - [x] 2.3 `laps()` filter by `source === "phone"` and the simulator toggle _Requirement 3.1_
  - [x] 2.4 Note for the car case _Requirement 3.2_
  - [x] 2.5 Tests: unit (rows, tolerance, filter), black-box (analysis-only, no send controls, speed-by-map disabled in both modes, toggle), E2E CU-2 with the new row _Requirement 2.3, 5_ (E2E CU-2 written but not run: see 4.4)
- [ ] 3. Real-field test (owner) _Requirement 4_
  - [ ] 3.1 Design and save the track in the Tracer; tape it on the floor
  - [ ] 3.2 Walk it with the phone (steps, closed, linked to the track); finish
  - [ ] 3.3 Record design vs measured, closure error, total and leftover turn; screenshot in `docs/evidencias/hu-30/`
  - [ ] 3.4 Repeat with the phone held differently
- [ ] 4. Validation
  - [ ] 4.1 Both full suites, typecheck, lint, build in clean copies
  - [ ] 4.2 Visual validation by the PO (desktop and 360 px)
  - [ ] 4.3 Palette and contrast check
  - [ ] 4.4 Run the E2E case CU-2 (extended with the *Giro total* row) in an environment with Playwright installed
- [ ] 5. Pre-deployment (owner decides)

## Proposed commits
- B1: `feat(measurements): el resultado incluye el giro total de la vuelta [HU-30]`
- F1: `feat(consola): el mapa muestra giro total y giro sobrante, solo análisis y datos reales del celular [HU-30]`
