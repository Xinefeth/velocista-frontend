# HU-30 · Construir el mapa desde la primera vuelta (1 SP)

*Design Document*

## 1. Decision
The map already exists as a comparison of a phone-measured lap against a tracer design. Four small changes close the gaps:
1. Expose and show the **total turn** next to the leftover turn.
2. Make "map for analysis only" explicit and tested.
3. Separate real phone data from simulator data in the lap list.
4. Run and record a real-field test.
The car case waits for a PO decision (no speed model without PWM).

## 2. Existing pieces (do not rewrite)
| Piece | File |
|---|---|
| Comparison card and view | `src/ui/components/measurement/TrackComparison.tsx`, `src/ui/pages/MapView.tsx` |
| Rows and design path | `src/domain/measurement/trackCompare.ts` (`compareTrack`, `designPath`, `alignTo`, `laps`) |
| Result (backend) | `velocista-backend/src/velocista/domain/measurements/compute.py`, `entities.py` (`Result`), `interface/rest/measurements/schemas.py` (`ResultOut`) |
| Odometry | `velocista-backend/src/velocista/domain/measurements/odometry.py` (`total_turn`, `correct_heading_drift`, `distribute_closure`) |
| Frontend contract | `src/infrastructure/contracts/measurements.ts` (`MeasurementApi.result`) |
| Tracks | `/api/tracks` (`perimeter_cm`, `area_cm2`), `src/infrastructure/http/tracks.ts` |
| E2E | `tests/e2e/flows/casos-de-uso.e2e.ts` (CU-2) |

## 3. Total turn (Requirement 1)
**Backend.** In `compute.py`, `odo.total_turn(motion, bias)` already returns the accumulated turn in degrees. Put it in `Result.turn_total_deg: float | None` (new, default `None`; `None` for GPS measurements), expose it in `ResultOut` and the OpenAPI schema with a description ("accumulated turn of the whole walk, degrees, positive to the left; ±360° for a closed lap") and an example. No migration: `result` is stored as JSON; old rows read as `null`. Tests: a known square (≈ −360° clockwise), a circle, GPS → null, old row without the field → null. Document in `docs/CONTRACT.md` together with `heading_drift_deg` and the result warnings (`gps_space_too_small`, `scale_needs_corner`, …).

**Frontend.** Add `turn_total_deg?: number | null` to the result type. In `compareTrack()` add the row *Giro total* (design ±360°, measured, unit °) before *Giro sobrante*; mark *Giro sobrante* above the tolerance (constant at the top of `trackCompare.ts`, 15°) as a warning with icon and word. Old measurements without the field show "—". Texts in `labels.ts`. Tests: rows for a finished measurement with and without the field; tolerance marking.

## 4. Analysis-only (Requirement 2)
- Add the sentence "Solo análisis: en competencia el robot no usa el mapa" as visible text under the title of `MapView` and `TrackComparison` (the code comments already say it; it is not on screen).
- Black-box test: render *Control* in test and competition mode and check that the speed-by-map control is disabled (`aria-disabled` or `disabled`) with its reason; render *Mapa de pista* and check that there are no start/stop/send controls.

## 5. Real data vs simulator (Requirement 3)
- `laps()` keeps `result` and `method !== "gps"`. Add the filter `source === "phone"` by default and a toggle "Mostrar simulador (desarrollo)" that also lists `source !== "phone"`. The toggle state is local (not persisted).
- Car: if the list has measurements with `method === "car"`, show them with the existing label; if none, the card shows a note "Con el carro: no disponible (sin modelo de velocidad)". Final wording depends on open question 1.

## 6. Real-field test (Requirement 4)
1. In the Tracer, design a small closed track (for example a 3 × 2 m rectangle), save it (`perimeter_cm` and `area_cm2` are stored).
2. Tape the same track on the floor.
3. With the phone (steps method, closed, `reference` = the saved track, first side measured with tape if possible), walk the lap, finish.
4. Open *Mapa de pista*, choose the track and the lap, and record: design vs measured length and area, closure error, total turn and leftover. Screenshot to `docs/evidencias/hu-30/` (frontend).
5. Run once more with the phone held differently (hand and chest height) to see the spread.
Success: length error within the PO's tolerance and total turn within ±15° of 360°.

## 7. Tests
- Backend: `turn_total_deg` (square, circle, GPS, legacy), OpenAPI contract test, full suite.
- Frontend unit: new row and tolerance in `compareTrack`; `laps()` filter by source.
- Frontend black-box: analysis-only text; no send controls; speed-by-map disabled in both modes; simulator toggle.
- E2E: CU-2 keeps passing; extend it with the *Giro total* row.
- Real field: Requirement 4.

## 8. Risks
| Risk | Mitigation |
|---|---|
| Old measurements lack `turn_total_deg` | optional field; "—" in the UI |
| Hand-held walking is noisy; closure error is large indoors | field test outdoors or in a large room; report the spread |
| The car case is not defined | explicit "no disponible" note until the PO decides |
| Sign convention of the turn (left positive) confuses | show the absolute value with the direction word |

## 9. Rollout
1. Backend point B1 (`turn_total_deg`, contract), one PR.
2. Frontend point F1 (row, tolerance, analysis-only text, source filter, tests), one PR; it reads the field when present, so the order of merges does not break anything.
3. Real-field test by the owner; evidence added.
4. Render deployment is the owner's decision.
