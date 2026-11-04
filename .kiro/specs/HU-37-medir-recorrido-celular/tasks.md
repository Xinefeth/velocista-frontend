# HU-37 · Medir un recorrido con el celular (0,75 SP)

*Implementation Plan*

## Status (2026-11-04)

- **Done and merged:** frontend points F1 (walking / still state) and F2 (small-field advice with the error measured in SP-06) — PR #18 of the frontend.
- **Pending:** real-device tests on Android and iPhone (3.1, 3.2) and their evidence (3.3); PO decision on the button wording (0.1, so 2.7 stays open); test devices (0.2); visual validation (4.2).

Order: decisions, frontend F1, F2, owner tests. No agent commits or pushes; the user commits one point at a time. No task touches Render or the production database.

- [ ] 0. Decisions (PO)
  - [ ] 0.1 Exact button wording ("Iniciar recorrido" / "Terminar recorrido")? _Requirement 4_
  - [ ] 0.2 Test devices: one Android and one iPhone? models? _Requirement 3_
- [x] 1. Frontend point F1 — walking / still state
  - [x] 1.1 `motionState()` in `src/domain/measurement/phone.ts` with unit tests _Requirement 1_
  - [x] 1.2 State chip in `src/celular/tabs/Measure.tsx`, driven by the existing 500 ms timer; text in `labels.ts` _Requirement 1.1 to 1.4_
  - [x] 1.3 Black-box tests (still, walking, no data) _Requirement 1_
- [ ] 2. Frontend point F2 — small-field advice with SP-06
  - [x] 2.1 Read `gpsTrials.summary(device)` once in *Medir*; keep `min_side_m` _Requirement 2_
  - [x] 2.2 Advice before starting (method GPS) _Requirement 2.1_
  - [x] 2.3 Warning after finishing with both numbers and the button "Medir por pasos" _Requirement 2.2, 2.4_
  - [x] 2.4 No-trials text with a link to the GPS-error tab; backend warning kept _Requirement 2.3_
  - [x] 2.5 Move `gpsFits` to `src/domain/measurement/` and reuse it in `GpsTrials.tsx` _design 4_
  - [x] 2.6 Unit and black-box tests _Requirement 2_
  - [ ] 2.7 Only if the PO decides 0.1: rename the buttons
- [ ] 3. Real-device test (owner)
  - [ ] 3.1 Android checklist (design 5) with screenshot _Requirement 3_
  - [ ] 3.2 iPhone checklist with screenshot _Requirement 3_
  - [ ] 3.3 Save evidence in `docs/evidencias/hu-37/` (frontend) and record results in this spec
- [ ] 4. Validation
  - [x] 4.1 Frontend full suite, typecheck, lint and build in a clean copy
  - [ ] 4.2 Visual validation by the PO (desktop and 360 px)
  - [ ] 4.3 Palette and contrast check (no `--dim` text)
- [ ] 5. Pre-deployment (owner decides)

## Proposed commits
- F1: `feat(celular): muestra si la persona camina o está quieta durante el recorrido [HU-37]`
- F2: `feat(celular): avisa si el terreno es chico para el GPS según el error medido y recomienda pasos [HU-37]`
