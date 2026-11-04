# HU-10 · Bloquear en la consola lo que prohíbe el reglamento (0,5 SP)

*Design Document*

## 1. Decision
Keep the rules where they are (console profile data) and add **one pure domain function** that answers "is this option blocked by this profile, and why?". The Builder and the Control view call it. Nothing in the backend changes. The compliance panel (`checks()`) stays as the after-the-fact audit; the new function is the preventive layer.

## 2. Existing pieces (do not rewrite)
| Piece | File | Use |
|---|---|---|
| Profile data | `src/shared/data/rulebook.ts` (`PERFILES`) | source of the rules |
| Profile state | `src/application/state/ConsoleContext.tsx` (`profile`, `setProfile`, store key `profile`) | active profile; changes re-render the tree |
| Compliance audit | `src/domain/rules.ts` (`checks`, `complies`, `facts`) | after-the-fact report; keep unchanged |
| Top-bar chip | `src/ui/components/Strip.tsx` (`regchip`) | criterion 1 |
| Builder | `src/ui/pages/Builder.tsx` (`RANURAS` from `src/shared/data/catalog.ts`) | where parts are chosen |
| Speed-map block | `src/ui/pages/Control.tsx` (`why`) | already gated; reuse the same reason format |

## 3. New domain function
File: `src/domain/profileBlocks.ts` (pure, no React, no global state).

```ts
export interface Block {
  blocked: boolean;
  /** Frase en español: perfil y regla. Vacía si no está bloqueado. */
  reason: string;
}

/** ¿Este ítem del catálogo está prohibido para este perfil en esta ranura? */
export function itemBlock(profile: Profile, slot: Slot, item: Component): Block;

/** ¿Toda la ranura está prohibida (turbina, encoders, IMU)? */
export function slotBlock(profile: Profile, slot: Slot): Block;

/** Límite de cantidad permitido en la ranura (motores), o null. */
export function qtyLimit(profile: Profile, slot: Slot): { max: number; reason: string } | null;
```

Rules (table of Requirement 2.4):
- `slotBlock`: `turb` ← `!rules.turbine`; `enc` ← `!rules.enc`; `imu` ← `!rules.imu`.
- `itemBlock`: `exp` ← `rules.commercialPcb === false && specs.comercial === "Sí"`; `motor` ← `rules.motorFam` set and `specs.familia` not in it; `mcu` ← `rules.mcu` set and name not matching the allowed list (same matching as `checks()` to avoid two truths); `chasis` ← `rules.chasisMat` set and `specs.material` not matching, or `rules.dim` set and `specs.ancho`/`specs.largo` exceed it; `linea` ← `rules.maxSensors` set and `specs.canales` (× current quantity) exceeds it.
- `qtyLimit`: `motor` ← `rules.motors`.
- Missing data → `blocked: false` (Requirement 2.5).
- Reason format: `"{Opción} no permitida en {comp} · {cat}"` or with detail (`"Motores: solo TT amarillo en Muchik Rumble 4 · Amateur"`). One catalogue of messages in `src/domain/measurement`-style labels file (`src/domain/profileBlocks.ts` constants), Spanish.

**Consistency rule:** the evaluation reuses the same predicates as `checks()` where they exist (extract shared helpers) so a part that `itemBlock` allows can never make `checks()` fail for the same rule, and a blocked part always shows `bad` in `checks()` if selected.

## 4. Builder
In the slot row (`src/ui/pages/Builder.tsx`, the `<select className="inp">` over `c.catalog.filter(typeId)`):
1. Compute `slotBlock` and, for each item, `itemBlock` from `c.profile`.
2. Whole slot blocked → the `<select>` is `disabled`; a visible note under the slot name shows the reason and a lock icon (`ICO.lock` already exists in `Rules.tsx`). If a part is already selected, it stays visible and the slot shows the mark "no permitido" (Requirement 5).
3. Item blocked → `<option disabled>` with the text `"{name} · {price} — no permitido"`; the specific reason for the highlighted items goes in a visible list under the select ("No permitidos aquí: X (motivo)") and is linked with `aria-describedby`.
4. Quantity buttons: "Más" disabled at `qtyLimit.max`, with the reason as `title` and as visible small text.
5. Selected part that is blocked (profile changed): keep `value`, add class `blocked` to the slot, keep the compliance panel in `bad`.
6. Styles in the existing stylesheet of the Builder (`src/ui/styles/`): use only existing tokens (`--bad`/`--red`, `--mid` for text, never `--dim` for text). No new colours.

## 5. Control view
Keep the existing speed-map gate. Align its message with the common format (profile + rule). No other change unless the PO decides on open question 1.

## 6. Top bar
Keep `regchip`. Add an `aria-label` with the profile and the compliance state, and make sure the colour change has a non-colour cue (the shield icon plus the word "cumple" / "no cumple" in the accessible name). A test per Requirement 7.5.

## 7. Live update
No new mechanism: `c.profile` changes → `useMemo` in the Builder recomputes `slotBlock`/`itemBlock`/`qtyLimit`. No request, no reload. Test: render Builder with `mr4a`, call `setProfile("club")`, assert the options become enabled; and the reverse.

## 8. Data source and parity
Phase 1 (this item): static `PERFILES`. Add a **parity test**: a script or test that loads the API seed (`0003_reference_data.json` in the backend; copied as a fixture into the frontend tests, or fetched from the local API) and compares the keys of the mapping table per profile (`turbine`↔`turbine`, `enc`↔`encoders`, `imu`↔`imu`, `commercialPcb`↔`commercial_pcb`, `motorFam`↔`motor_families`, `mcu`↔`allowed_mcus`, `chasisMat`↔`chassis_materials`, `dim`↔`dimensions_mm`, `maxSensors`↔`max_sensors`, `motors`↔`motors`, `speedMap`↔`speed_map`). A mismatch is reported to the PO; it does not block the delivery.
Phase 2 (later item): read `/api/profiles` through an adapter in `src/infrastructure/http/profiles.ts` and delete the static copy.

## 9. Backend
No change required. Optional, small: document in `docs/CONTRACT.md` the keys of `rules` of `GET /api/profiles` (the 17 keys above) so that the adapter of phase 2 has a contract, and add a test that all four seeded profiles return those keys.

## 10. Tests
- Unit (`tests/unit/domain/profileBlocks.test.ts`): each rule × the four profiles × allowed and forbidden items; missing data → not blocked; consistency with `checks()` (property: blocked item selected ⇒ some check is `bad`).
- Black-box (`tests/black-box/pages/builder-blocks.test.tsx`): disabled options and visible reasons per profile; quantity limit; selected part kept and marked after changing profile; no reload (no `location.reload`, no fetch).
- Chip test (`tests/black-box/components/`).
- Accessibility: `aria-describedby` present, reason text present, no `--dim` text.
- Visual validation by the PO at desktop and 360 px, with screenshots.

## 11. Risks
| Risk | Mitigation |
|---|---|
| Two truths: `itemBlock` and `checks()` disagree | shared predicates and the consistency test |
| Catalogue items without the needed `specs` | not blocked; audited by `checks()` |
| A long list of reasons makes the slot noisy | show only blocked items in the note; collapse above 3 |
| Static profile data differs from the API seed | parity test; PO decides which one wins |
| Contrast of the reason text | use `--mid`/`--ink`, check 4.5:1 |

## 12. Rollout
1. Frontend point F1: domain function and unit tests.
2. Frontend point F2: Builder gating and black-box tests.
3. Frontend point F3: Control message alignment, chip accessibility and tests.
4. Optional backend point B1: document the `rules` keys and test.
5. PO validation with screenshots. Render deployment is the owner's decision.
