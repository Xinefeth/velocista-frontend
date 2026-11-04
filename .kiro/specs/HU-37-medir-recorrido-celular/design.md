# HU-37 · Medir un recorrido con el celular (0,75 SP)

*Design Document*

## 1. Decision
No new page and no new endpoint. Two small additions to the *Medir* tab and a real-device test:
1. A walking/still state derived from the existing step detector.
2. An SP-06-based small-field warning, using the endpoint that already exists (`GET /api/gps-trials/summary`).
The backend keeps its own post-measurement warning; the frontend adds the earlier, SP-06-based advice.

## 2. Existing pieces (do not rewrite)
| Piece | File |
|---|---|
| Sensors and permissions | `src/celular/sensors.ts` |
| Step detector (3-sample moving average of |a| − g, threshold 1.2 m/s², 300 ms minimum interval) | `src/domain/measurement/phone.ts` (`stepCounter`, `STEP_THRESHOLD`, `STEP_MIN_INTERVAL_MS`) |
| *Medir* tab, live canvas, start and finish | `src/celular/tabs/Measure.tsx` |
| SP-06 summary client | `measurementsApi` in `src/infrastructure/http/measurements.ts` (`gpsTrials.summary(device)`) |
| Reasons and warnings text | `src/domain/measurement/labels.ts` (`gps_space_too_small`) |
| GPS fit verdict | `gpsFits(side, min_side_m)` in `src/ui/components/measurement/GpsTrials.tsx` (reuse, do not duplicate) |
| Backend warning | `velocista-backend/src/velocista/domain/measurements/compute.py` (`min_gps_size_m`, `gps_space_too_small`) |

## 3. Walking / still state (Requirement 1)
- Pure function in `src/domain/measurement/phone.ts`: `motionState(samples, now)` → `"walking" | "still" | "no_data"`. `walking` if a step was detected in the last 1.5 s or the |a| − g deviation over the last 1 s exceeds the still threshold; `still` otherwise; `no_data` if no sample for 3 s.
- `Measure.tsx` calls it from the existing 500 ms timer (the one that draws the canvas), so there is no new timer.
- UI: a chip next to the live counters: icon + word ("Caminando" / "Quieto" / "Sin datos del acelerómetro"). Existing tokens only; text in `--mid` or `--ink`; `role="status"`, `aria-live="polite"`.
- Unit tests with known samples (still on a table, steady walk, shake, gap).

## 4. SP-06 small-field warning (Requirement 2)
- On entering *Medir* (and when the device code changes), call `gpsTrials.summary(device)` once; keep `min_side_m` in component state. No polling.
- Method GPS and `min_side_m != null`: show the advice before starting (text of Requirement 2.1).
- On finish (`result` present, `closed`): `side = result.perimeter_m / 4`; if `gpsFits(side, min_side_m)` says it does not fit, show the warning with both numbers and the button "Medir por pasos" that switches the method and returns to the form with the same place name.
- No trials: the tab says "Aún no hay pruebas de error del GPS (pestaña 4)" and links to that tab; the backend warning remains.
- Reuse `gpsFits`; if it lives in a UI component file, move it to `src/domain/measurement/` and import from both places.
- All texts in `labels.ts`.

## 5. Real-device test (Requirement 3)
Checklist, run on one Android and one iPhone over `https://<frontend>/celular`:

| Step | Android | iPhone |
|---|---|---|
| Opens over HTTPS, no certificate warning | | |
| Login | | |
| Motion permission (iPhone: after the tap) | not asked | asked |
| Location permission granted | | |
| Gyroscope and accelerometer show values | | |
| GPS accuracy shown (outdoors) | | |
| Wake Lock "Sí" | | |
| *Iniciar medición* starts; counters rise | | |
| Walking / still state changes (after F1) | | |
| Live trace draws | | |
| *Terminar y calcular* shows perimeter and area | | |
| Small-field advice appears for a small yard (after F2) | | |
Evidence: one screenshot of the result per platform, saved under `docs/evidencias/hu-37/` of the frontend (no coordinates visible; blur the map or use a neutral place name).
The existing phone-test guide of EN-32 (project documentation) covers permissions and the data checks; this checklist adds the walk-around and the result screen.

## 6. Backend
No change required for the criteria. Optional: document in `docs/CONTRACT.md` the result warnings (`gps_space_too_small`, `scale_needs_corner`, …) and `min_gps_size_m`. This is part of the HU-30 backend point (same file).

## 7. Tests
- Unit: `motionState` (still, walking, shake, no data), `gpsFits` moved to the domain, small-field decision.
- Black-box: *Medir* tab shows the state chip; advice before start with a mocked summary; warning and "Medir por pasos" button after a finished short measurement; no-trials text; no request loop.
- Palette: no `--dim` text, no new colours; 360 px layout.
- Manual: the checklist above.

## 8. Risks
| Risk | Mitigation |
|---|---|
| iOS Safari differences (motion permission, Wake Lock support) | test on a real iPhone; document unsupported features |
| Step detector false positives when the phone shakes | the state uses both steps and variance; threshold constants at the top of `phone.ts` |
| SP-06 summary absent for a new device code | the page says so and keeps the backend warning |
| Free Render database size | short tests, delete test measurements |

## 9. Rollout
1. Frontend F1 (state chip) and F2 (SP-06 advice), one PR.
2. Real-device checklist by the owner; evidence added.
3. Render deployment is the owner's decision.
