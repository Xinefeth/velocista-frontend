# HU-10 · Bloquear en la consola lo que prohíbe el reglamento (0,5 SP)

*Implementation Plan*

## Status (2026-11-04)

- **Done and merged:** frontend points F1, F2 and F3 (PR #17 of the frontend). Domain function `profileBlocks`, Builder blocks with reason, top-bar chip with accessible label and speed-map block with the common reason format.
- **Pending:** backend point B1 (document the keys of `rules`; optional); decisions of the PO (section 0); visual validation with screenshots of the four profiles (5.2); coordination with the automated-test owner (5.3); pre-deployment.
- Task 3.3 (warning or block on ARRANCAR) stays open until the PO decides 0.1.

Order: decisions, frontend F1, F2, F3, optional backend B1, validation. No agent commits or pushes; the user commits one point at a time. No task touches Render or the production database.

- [ ] 0. Decisions (PO) _Requirements: open questions_
  - [ ] 0.1 Block ARRANCAR when the robot does not comply? (recommended: no, warn only)
  - [ ] 0.2 Source of the profile data: static now, API later (recommended)
  - [ ] 0.3 Validate the mapping table of Requirement 2.4 (wheels, drivers, start mode?)
  - [ ] 0.4 Profile switch in the top bar? (recommended: no)
- [x] 1. Frontend point F1 — domain function
  - [x] 1.1 `src/domain/profileBlocks.ts`: `slotBlock`, `itemBlock`, `qtyLimit`, reason catalogue in Spanish _Requirements: 2, 3, 6_
  - [x] 1.2 Extract the predicates shared with `checks()` in `src/domain/rules.ts` without changing its behaviour _Requirements: 6.1_
  - [x] 1.3 Unit tests: each rule × four profiles × allowed/forbidden, missing data, consistency with `checks()` _Requirements: 7.1_
  - [x] 1.4 Parity test against the API seed for the keys of the mapping table; report differences _Requirements: 6.3_
- [x] 2. Frontend point F2 — Builder
  - [x] 2.1 Disable whole slots (turbine, encoders, IMU) with a visible reason and lock icon _Requirements: 2.1, 2.2, 3_
  - [x] 2.2 Disable blocked items (`<option disabled>`) and list the reasons under the select with `aria-describedby` _Requirements: 2.2, 2.3, 3.2_
  - [x] 2.3 Quantity limit for motors with visible reason _Requirements: 2.4_
  - [x] 2.4 Keep a selected part that became forbidden and mark the slot "no permitido" _Requirements: 5_
  - [x] 2.5 Styles with existing tokens only; no `--dim` text; 360 px layout _Requirements: 3.3 to 3.5_
  - [x] 2.6 Black-box tests: per-profile blocks, quantity, kept part, live switch without reload _Requirements: 4, 7.2 to 7.4_
- [ ] 3. Frontend point F3 — Control view and top bar
  - [x] 3.1 Align the speed-map reason with the common format _Requirements: 2.4_
  - [x] 3.2 `aria-label` of the chip (profile and compliance) and non-colour cue; test _Requirements: 1, 7.5_
  - [ ] 3.3 Only if the PO decides 0.1: warning (or block) on ARRANCAR for a non-compliant robot
- [ ]* 4. Backend point B1 (optional, small)
  - [ ]* 4.1 Document the 17 keys of `rules` of `GET /api/profiles` in `docs/CONTRACT.md` _Requirements: 6_
  - [ ]* 4.2 Test that the four seeded profiles (`mr4a`, `mr4s`, `mr4m`, `club`) return those keys
- [ ] 5. Validation
  - [x] 5.1 Full frontend suite, typecheck, lint and build in a clean copy
  - [ ] 5.2 Visual validation by the PO (desktop and 360 px) with screenshots of the four profiles
  - [ ] 5.3 Coordinate automated tests with the testing teammate (EN-37 to EN-41)
- [ ] 6. Pre-deployment (owner decides)

## Proposed commits (one per point)
- F1: `feat(consola): evalúa qué opciones prohíbe cada perfil de reglamento [HU-10]`
- F2: `feat(consola): el armador desactiva las piezas prohibidas con su motivo [HU-10]`
- F3: `feat(consola): barra superior accesible y bloqueo de la función de velocidad con motivo común [HU-10]`
- B1: `docs(rules): documenta las reglas de los perfiles y prueba su contrato [HU-10]`
