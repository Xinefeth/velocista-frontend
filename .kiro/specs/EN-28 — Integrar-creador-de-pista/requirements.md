# Requirements Document — EN-28 · Integrar el creador de pistas a la consola (frontend)

## Introduction

EN-28 brings the standalone prototype `trazador-de-pistas.html` ("Trazador de Pistas v2", 2,433 lines of
vanilla JS, kept in `C:\Users\Usuario\Desktop\Proyecto_Taller\`) into the Consola as a Gestión view
called **Trazador de pistas**, next to Catálogo, Armador and Perfiles de reglamento. The pilot draws a
line track as control points with a radius per point, edits it, verifies it against a rulebook profile,
transforms it, measures it, simulates a lap, and saves it **only through the API**. This spec covers the
**frontend** side. The backend side is `velocista-backend\.kiro\specs\en-28-tracks-api` and shares the
contract below. **Nothing in this spec is implemented**: every task is pending. This is documentation
only; no code, tests, commit or push were made.

Sources read: `ANALISIS_EN-28_trazador_de_pistas.md` (sections 1–10), the prototype (`Track2` core at
lines ~586–991; UI, state, canvas, export and storage layer at ~993–2433), and this repo
(`Rail.tsx`, `BottomNav.tsx`, `App.tsx`, `ConsoleContext.tsx`, `domain/canvas.ts`, `useCanvas.ts`,
`http/api.ts`, `rules.ts`/`rulebook.ts`, `MapView.tsx`, `prototype.css`).

### Verified state of this repo (working tree on branch `docs/kiro-specs`, created from `origin/main`)

| Item | Fact |
|---|---|
| Rail | `Rail.tsx`: group Robot (`control`, `telemetry`, `runs`, `map`) and group Gestión (`catalog`, `builder`, `rules`). `BottomNav.tsx` repeats the same 7 tabs. |
| Tabs | `type Tab` (`ConsoleContext.tsx`:46) has 7 values; `GROUP: Record<Tab,…>` and `PAGINAS: Record<Tab,…>` in `App.tsx` must list every tab (TypeScript will force the new entry). Icons live in `Icons.tsx` (`icons[tab]`). |
| Profiles | **The Consola does not call `/api/profiles` today.** `shared/data/rulebook.ts` holds a static `PERFILES` array and `ConsoleContext` keeps it in state. `Profile.rules` is typed as robot rules only (`dim`, `motors`, `turbine`, …). There is no `api.profiles` in `http/api.ts`. |
| Canvas | `domain/canvas.ts` has pure drawing helpers for the telemetry/map views (`fit`, `proj`, `drawMap`, `drawChart`…) and `themeColors()` (reads `--ink`, `--red`, … once, cached). `useCanvas(draw)` redraws after **every render** and on window resize; it has no pointer handling. |
| MapView / HU-30 | `MapView.tsx` is "Desde la primera vuelta (HU-30, solo análisis)": it reconstructs the path from lap 1 using `domain/simulator.ts`, whose track length `LEN` is a **hard-coded constant**. The Consola has **no concept of a saved track** and consumes no track length. |
| REST | `request()` already adds `Authorization: Bearer`, handles 401 (clears the token, dispatches `velocista:auth-required`) and maps errors to `ErrorApi`. Validation errors (array `detail`) collapse into "Hay datos inválidos en la solicitud" and lose field names. |
| Fonts/tokens | Geist Sans/Mono are self-hosted through `@fontsource` (`main.tsx`); tokens are `:root` CSS variables in `ui/styles/prototype.css` (`--bg`, `--panel*`, `--red #ff2d55`, `--purple`, `--green`, `--yellow`, `--blue`, `--sans`, `--mono`). The prototype uses IBM Plex from the Google CDN and a pink accent `#ff2d78`. |
| Layer debt (from the earlier spec `architecture`) | `domain/` imports types from `infrastructure/contracts` (4 files); `ui/` imports `@/infrastructure` in `AuthGate`, `Control`, `System`. The new code must not add to either (Requirement 16). |
| Dependencies | React 18.3.1, TypeScript 5.7.2, Vite 5.4.11, Vitest 2.1.8, Testing Library. No drawing, state or UI library, and none will be added. |

### Verified facts about the prototype (re-measured, not copied from the analysis)

`Track2` was extracted from the HTML into a scratch file and executed with Node (the prototype itself
was not modified). Results used as golden values in Requirement 17:

| Example (profile) | Length | Points | Arcs | Sharp corners | Gaps | Crossings | Issues | `sepMin` | `edgeMin` | `radiusMin` | Longest straight |
|---|---|---|---|---|---|---|---|---|---|---|---|
| «Técnica 3 × 2,5» (`lgr2026`) | **833.448 cm** | 12 | 8 | 4 | 0 | 0 | **0** | 30 | 45 | 15 | 130 cm |
| «Ocho libre» (`libre`) | **715.617 cm** | 6 | 5 | 1 | 1 | 1 | **0** | 12.5 | 40 | 30 | 160 cm |
| «Ocho libre» under `lgr2026` | 715.617 cm | — | — | — | — | — | **2** (`cruce`, `corte`) | — | — | — | — |
| «Técnica» under `libre` | 833.448 cm | — | — | — | — | — | **0** | — | — | — | — |

Units in the prototype: cm for geometry; rule values `lengthMin`/`lengthMax` are in **metres**;
`spec.lineW` is in mm (19) and `spec.gapLen` in cm (2); y axis points up with the origin at the
bottom-left corner of the board; 13 rules in 4 groups; 7 templates; history of 200 steps; sampling step 0.5 cm.

## Glossary

- **Consola**: SPA del piloto (este repositorio).
- **Trazador de pistas**: Vista de Gestión para crear, editar, verificar y guardar pistas.
- **Pista (track)**: Línea del circuito como poligonal de control: puntos, radio por punto, zonas, tablero y salida.
- **Tablero (board)**: Rectángulo de la pista, en cm (`width_cm`, `height_cm`).
- **Punto (point)**: Vértice de control `{x, y, radius, gap}`; `radius` 0 = esquina viva; `gap` marca un corte en el tramo que sale del punto.
- **Zona (zone)**: Rectángulo prohibido `{x, y, width, height, name}` (postes, logos, rampas).
- **Salida (start)**: Bandera a cuadros `{edge, t}`: tramo y posición relativa (0..1).
- **Perfil de reglamento**: Perfil de la API (`GET /api/profiles`) con reglas de pista en `profile.rules.track`.
- **Reglas de pista**: `line_width_mm`, `gap_length_cm` y 13 reglas `{enabled, value}`: `radius_min`, `angle_min`, `no_sharp`, `separation_min`, `margin`, `zone_distance`, `closed`, `length_min`, `length_max`, `straight_min`, `straight_max`, `cross_max`, `gap_max`.
- **Incidencia (issue)**: Resultado de verificar: severidad, tipo, mensaje, posición y referencia.
- **Cotas (dimensions)**: Medidas dibujadas sobre el lienzo (largos de tramo, radios, ángulos).
- **Largo (length_cm)**: Longitud total de la línea con arcos, en cm; la calcula el frontend.
- **Controlador de lienzo**: Clase TypeScript que maneja el puntero y el dibujo, envuelta por un componente React.
- **Borrador local**: Copia de trabajo no guardada en `localStorage`.
- **ACL**: Capa que traduce el contrato REST (snake_case) al modelo de dominio.
- **Contrato de EN-28**: Rutas y campos acordados con el backend (ver Requirement 9).

## Requirements

### Requirement 1: Navigation entry and view

**User Story:** As a pilot, I want a "Trazador de pistas" view in the Gestión group, so that I can reach
the track tool like the other management views.

#### Acceptance Criteria

1. THE Consola SHALL add the tab `"tracer"` to `type Tab`, to `GROUP` (as `"gestion"`) and to `PAGINAS` in `App.tsx`.
2. THE Rail SHALL list "Trazador de pistas" in the Gestión group after "Perfiles de reglamento", with its own icon in `icons`.
3. THE BottomNav SHALL list the same view with a short label (e.g. "Pistas") so that narrow screens reach it.
4. WHEN the pilot opens the view, THE Consola SHALL render `ui/pages/TrackTracer.tsx` using the same shell, `Card` and tag components as the other views.
5. THE view SHALL work at phone width without horizontal page scroll (the canvas scales; panels stack).

### Requirement 2: Domain port of `Track2`

**User Story:** As a developer, I want the pure track logic in `domain/track`, so that it is testable without React.

#### Acceptance Criteria

1. THE `domain/track` module SHALL provide the geometry (`build`: fillet arcs from per-point radius, edge/arc sampling at 0.5 cm, cumulative arc length `s`, total length `L`), crossings detection, the 13-rule verification (`analyze`), straight-run extraction, the 7 templates (`insertTemplate`), SVG generation (`toSVG`) and the two prototype examples.
2. THE port SHALL keep the prototype's behaviour: radius clamping when neighbours are too close (`fit`), reversal and duplicate-point detection, tolerance 0.3 cm, closed tracks needing ≥ 3 points, sampling and the separation zones near crossings and sharp corners.
3. THE `domain/track` module SHALL NOT import from `@/infrastructure`, `@/application`, `@/ui` or the DOM, and SHALL define its own types (`Track`, `TrackPoint`, `TrackZone`, `TrackRules`, `TrackIssue`, `TrackGeometry`).
4. THE port SHALL rename prototype fields to the contract vocabulary in English: `pts`→`points`, `r`→`radius`, `g`→`gap`, `w/h`→`width/height`, `e`→`edge`, `board.w/h`→`board.widthCm/heightCm`; and rule ids from camelCase to the contract names (`radiusMin`→`radius_min`, …).
5. THE port SHALL keep Spanish only in user-visible issue messages and comments.
6. WHEN the same document and rules are analysed, THE port SHALL produce the same total length (±0.001 cm), counts and issue kinds as the prototype for the two examples (Requirement 17).
7. THE port SHALL treat every length read from the API as **centimetres** (`length_min`/`length_max` included; the backend seed converts the prototype's metres ×100), `angle_min` as degrees and `line_width_mm` as millimetres; it SHALL compare `length_min`/`length_max` with `length_cm` directly and show metres only in the interface (the prototype mixes m and cm; no implicit unit mixing is allowed).

### Requirement 3: Drawing and editing by points

**User Story:** As a pilot, I want to draw and edit the line by points with a radius, so that I can shape the track.

#### Acceptance Criteria

1. WHEN the draw tool is active and the pilot clicks the board, THE editor SHALL append a point with the default radius (`rDef`, 15 cm), snapped to the grid step when snapping is on (default step 5 cm).
2. WHEN the pilot clicks the first point while drawing, THE editor SHALL close the circuit; WHEN the circuit is closed and the pilot clicks a segment, THE editor SHALL insert a point there.
3. WHEN the select tool is active, THE editor SHALL support selecting a point, a segment or a zone, multi-select (Shift+click, drag box, Ctrl+A), dragging single or group, deleting, setting a point's radius, setting a segment's length, toggling a gap on a segment, reversing the track and dragging the start flag.
4. THE editor SHALL offer angle snapping while drawing (default step 15°) and a per-selection inspector with numeric fields as the keyboard-accessible alternative to dragging.
5. THE editor SHALL support the keyboard shortcuts of the prototype (verified in its key handler): V select, P/D draw, Z zone, Enter leave draw, Esc cancel/clear, Delete/Backspace remove, R rotate and M mirror the selection, 0 fit view, N nodes, G guides, C dimensions, +/− zoom, arrows move the selection (Shift ×10), Ctrl+A select all, Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo, Ctrl+S save, Space to pan, wheel/pinch zoom. THE shortcuts SHALL be active only while the Trazador tab is mounted and the focus is not in an input, and SHALL NOT be bound to the whole document when the view is closed (the prototype binds them to `document`). The prototype also stores `rDef` 15, snap step 5 and angle step 15 as view options.
6. IF a radius does not fit between neighbours, THEN THE editor SHALL show an adjustment warning and offer the one-click fix (`fixRadii`).
7. WHILE a drag is in progress, THE editor SHALL keep the transient state outside React state and commit one history step on release.

### Requirement 4: Transformations and dimensions

**User Story:** As a pilot, I want to rotate, scale, mirror and move a selection and see dimensions, so that I can adjust the track precisely.

#### Acceptance Criteria

1. WHEN the pilot applies rotate, scale, mirror (horizontal/vertical) or move, THE editor SHALL transform the selected points and zones (or the whole track when fewer than two points are selected) around the selection centre and record one history step.
2. WHERE dimensions are enabled (default on), THE canvas SHALL draw segment lengths, radii and corner angles.
3. THE editor SHALL expose the transformations in the context menu and in the selection bar, with numeric inputs (degrees, factor, centimetres).

### Requirement 5: Undo and redo

**User Story:** As a pilot, I want unlimited-feeling undo, so that mistakes are cheap.

#### Acceptance Criteria

1. THE editor SHALL keep a history of at most 200 snapshots and clear the redo stack on every new change.
2. WHEN a command leaves the document unchanged, THE editor SHALL NOT add a history entry.
3. WHEN the pilot undoes or redoes, THE editor SHALL clear the selection, mark the document dirty and re-run verification.
4. THE history SHALL be in memory only (not persisted).

### Requirement 6: Verification against a rulebook profile

**User Story:** As a pilot, I want to check my track against a profile, so that I know whether it complies.

#### Acceptance Criteria

1. THE Trazador SHALL obtain profiles from `GET /api/profiles` and use `profile.rules.track` as the rule set; it SHALL NOT keep its own copy of rules or the prototype's built-in profiles in production code.
2. WHEN a profile is selected, THE Trazador SHALL verify the track with the 13 rules (enabled ones only) and `line_width_mm` / `gap_length_cm`, and list the issues sorted by severity then kind order (`forma, ajuste, cerrado, borde, zona, separacion, radio, angulo, esquina, cruce, corte, recta, largo`).
3. WHEN the pilot selects an issue, THE canvas SHALL highlight and centre its location; issues without a position (length) SHALL show only in the list.
4. THE Trazador SHALL show statistics (length, longest straight, minimum separation, minimum edge distance, crossings, corners, curves, minimum radius, points, gaps) and an overall "cumple / N problemas" state.
5. IF the API returns a profile without `rules.track` (the existing `club`, `mr4a`, `mr4s`, `mr4m` have none; only the new `lgr2026` and `libre` do), THEN THE Trazador SHALL show that profile as "Este perfil no tiene reglas de pista", disable verification against it and still allow drawing and saving with that `profile_id`.
6. IF `GET /api/profiles` fails, THEN THE Trazador SHALL still allow drawing and show a retry control; it SHALL NOT fall back to a built-in profile.
7. THE selected profile id SHALL be stored in the track as `profile_id` (string such as `"lgr2026"`, nullable).

### Requirement 7: Lap simulation

**User Story:** As a pilot, I want a test robot to run the track, so that I get a feel for time and shape.

#### Acceptance Criteria

1. WHEN the pilot starts the simulation, THE Trazador SHALL move a rectangle (default 15 × 20 cm) along the line at a configurable speed (default 1 m/s) starting from the start flag, with play/pause and a position slider.
2. WHILE the track is closed, THE simulation SHALL loop; WHILE open, it SHALL stop at the end.
3. IF the track has no length, THEN THE Trazador SHALL show "Dibuja una pista antes de simular." and not start.
4. THE simulation SHALL use the geometry arc length `s` of `domain/track` and SHALL NOT change the document.

### Requirement 8: Zones and templates

**User Story:** As a pilot, I want forbidden zones and ready-made figures, so that I can design faster.

#### Acceptance Criteria

1. WHEN the zone tool is active and the pilot drags, THE editor SHALL add a zone with an optional name of at most 80 characters (default empty) and a width and height in (0, 2000] cm, that the line must keep distance from per `zone_distance`.
2. WHEN a template tool is active and the pilot clicks a straight segment, THE editor SHALL insert the figure (Horquilla, Omega, Joroba, Ondas S, Diente 135°, Muesca 90°, Zigzag) centred on the projection and toward the clicked side, adjusting the start index when needed.
3. THE editor SHALL limit zones to 0..100 and points to 2..500 when saving (Requirement 10); IF a command would exceed 500 points or 100 zones, THEN THE editor SHALL refuse it with a message.

### Requirement 9: Persistence only through the API

**User Story:** As a pilot, I want my tracks stored in the database, so that I can open them anywhere.

#### Acceptance Criteria

1. THE Trazador SHALL use exactly this contract (JWT on every call): `GET /api/tracks` (paginated `{items,total,limit,offset}`), `GET /api/tracks/{id}`, `POST /api/tracks`, `PUT /api/tracks/{id}`, `DELETE /api/tracks/{id}`, `GET /api/tracks/{id}/export`, plus `GET /api/profiles`.
2. THE track resource SHALL have the fields `id` (integer, identity like `run.id`), `name`, `board{width_cm,height_cm}`, `closed`, `points[{x,y,radius,gap}]`, `zones[{x,y,width,height,name}]`, `start{edge (integer segment index), t (number 0..1)}`, `profile_id` (string, nullable), `length_cm`, `created_at`, `updated_at`, all JSON keys in English snake_case.
3. WHEN the pilot saves a new track, THE Trazador SHALL `POST /api/tracks` without `id`, `created_at` or `updated_at` (the backend ignores them if sent); WHEN saving an existing one, it SHALL `PUT /api/tracks/{id}` with the full body.
4. WHEN saving, THE Trazador SHALL compute `length_cm` with `domain/track` (arc-aware, rounded to 0.01 cm) and send it.
5. THE Trazador SHALL list saved tracks with pagination (pages of 200 like the other lists), open one, delete one after an in-page confirmation, and show loading, empty and error-with-retry states.
6. IF a request fails with 401, THEN THE Consola SHALL follow the existing behaviour (token cleared, login form) and the unsaved work SHALL survive through the local draft (Requirement 11).
7. IF a save fails, THEN THE Trazador SHALL keep the document dirty, show the parsed error (Requirement 19) next to the offending fields and not lose edits.
8. WHEN `profile_id` refers to a profile the API does not know, THE API answers 422 `track_profile_unknown` on both `POST` and `PUT` (a reference inside the body, not a 404); THE Trazador SHALL show it on the profile picker, keep the document dirty and let the pilot choose another profile.
9. THE `PUT` SHALL be last-write-wins in EN-28 (no `If-Match`, no 409 for concurrency): WHEN the same track is open in two tabs, THE later save SHALL overwrite the earlier one; THE Trazador SHALL NOT claim conflict detection, and the local draft SHALL be keyed by track id (or "new") so two tabs do not share one draft.
10. THE Trazador SHALL NOT store tracks in `localStorage` or anywhere other than the API and the draft of Requirement 11.
11. WHILE the document has unsaved changes, THE Trazador SHALL show a "sin guardar" indicator and warn before replacing the document with another track or leaving the tab.

### Requirement 10: Client-side validation before sending

**User Story:** As a pilot, I want clear errors before a request is rejected.

#### Acceptance Criteria

1. BEFORE sending, THE Trazador SHALL validate these limits (proposed by the backend, pending the PO): name 1..80 characters after trimming; points 2..500; zones 0..100; board 50..2000 cm per side; radius 0..200 cm; point and zone `x`/`y` finite with |value| ≤ 10000 cm (points MAY lie outside the board: the `margin` rule detects that); zone `width`/`height` in (0, 2000] cm; zone `name` ≤ 80 characters; `start.t` in [0, 1]; `start.edge` an integer in 0..(points−1) when closed and 0..(points−2) when open; every number finite; `length_cm` in (0, 100000].
2. IF validation fails, THEN THE Trazador SHALL not call the API and SHALL list each failed limit in Spanish next to the offending field.
3. THE limits SHALL be defined in one constants module (`domain/track/limits.ts`) so they can change when the PO confirms them (Open question 7); the API enforces the same limits and may answer 422 anyway (Requirement 19).
4. THE Trazador SHOULD allow drafting below the minimum (e.g. 0–1 points) and only block saving.
5. IF `closed` is true and the track has fewer than 3 points, THEN THE Trazador SHALL block the save with "Un circuito cerrado necesita al menos 3 puntos" (the API would answer 422 `track_closed_needs_three_points`). In the prototype this state is reachable only by importing a file: its UI sets `closed` only with ≥ 3 points (draw, context menu, inspector) and `deletePoints` resets `closed` when fewer than 3 remain; its `build()` silently ignores `closed` when n < 3 (verified). THE editor and the importer SHALL therefore normalise `closed = false` when n < 3 and warn the pilot, so the combination never reaches the API.
6. WHEN saving or importing, THE Trazador SHALL normalise `start` into the valid range (the prototype resets it to `{e:0, t:0.5}` when out of range after deleting points; other paths, such as opening a closed circuit, are not guarded) and SHALL block the save if it still cannot be valid.

### Requirement 11: Local working draft

**User Story:** As a pilot, I do not want to lose work when the session expires or I switch tabs.

#### Acceptance Criteria

1. WHILE the document is dirty, THE Trazador SHALL write a debounced draft (document + selected profile id + view options) to `localStorage` under a single key (`velocista.track-draft.v1`), wrapped in try/catch.
2. WHEN the view mounts and a draft exists, THE Trazador SHALL offer to restore or discard it.
3. WHEN a save succeeds, THE Trazador SHALL clear the draft.
4. THE draft SHALL NOT contain the JWT or any secret and SHALL NOT be treated as a store of saved tracks.
5. THE justification SHALL be: the 401 flow unmounts the whole console (`AuthGate`) and the tab can be switched, so unsaved work needs a local safety copy.

### Requirement 12: Exports

**User Story:** As a pilot, I want to download the track as vector or image files.

#### Acceptance Criteria

1. THE Trazador SHALL export **SVG 1:1** (`<width>cm × <height>cm`, viewBox in cm, line width from the profile `line_width_mm`, gaps cut, corner marks) via a `Blob` download.
2. THE Trazador SHALL export **SVG 1:1 with marked zones** (the prototype's "con zonas").
3. WHERE the PO confirms "SVG con cotas" as a new export (Open question 3), THE Trazador SHALL export an SVG that also draws the dimensions; until then this export SHALL NOT exist.
4. THE Trazador SHALL export **PNG** of the plan (scene + title + summary line) rendered on an offscreen canvas with `toBlob`.
5. THE Trazador SHALL export **JSON**: for a saved track from `GET /api/tracks/{id}/export`, which the backend returns as the plain track object (same shape as `GET /api/tracks/{id}`, with `Content-Disposition`); for an unsaved document from the same plain shape built locally. Wrapping it in `{format, version, track}` is an Open question for the PO (the backend produces one form only).
6. THE file names SHALL be derived from the track name (lowercase, no accents, hyphens) with suffixes (`-1a1`, `-1a1-zonas`, `-plano`).
7. THE downloads SHALL use `Blob` + object URL + temporary anchor; there SHALL be no dependency on `window.claude` and no fallback modal.
8. THE SVG output SHALL NOT include user text unescaped (zone names, if drawn, SHALL be XML-escaped).

### Requirement 13: JSON import

**User Story:** As a pilot, I want to import track files, including those exported by the prototype.

#### Acceptance Criteria

1. WHEN the pilot imports a JSON file, THE Trazador SHALL accept (a) the plain track object (same shape as `GET /api/tracks/{id}`), (b) an envelope `{format, version, track}` if the backend finally adopts one (Open question 10), and (c) the prototype v2 envelope `{app:"trazador-de-pistas", v:2, pista, perfil}`.
2. THE importer SHALL map the v2 envelope to the contract: `pista.pts[i]` `{x,y,r,g}` → `points` `{x,y,radius,gap}`; `pista.zones[i]` `{x,y,w,h,name}` → `{x,y,width,height,name}`; `pista.board{w,h}` → `{width_cm,height_cm}`; `pista.start{e,t}` → `{edge,t}`; `pista.closed`, `pista.name` unchanged.
3. THE importer SHALL ignore the embedded `perfil` rules (rules come from the API); IF `perfil.id` matches an API profile id, THEN it SHALL set `profile_id`, otherwise `null` with a notice.
4. THE importer SHALL validate the file with the limits of Requirement 10 (and a file size cap, e.g. 1 MB) and reject invalid files with a specific message; it SHALL NOT require `pts` and `board` only (the prototype's weak check).
5. WHEN the file is valid, THE Trazador SHALL load it as an unsaved document (no id); saving it SHALL `POST /api/tracks` (import = create).
6. THE importer SHALL not execute or render any file content as HTML.

### Requirement 14: Remove the prototype's profile editor

**User Story:** As a maintainer, I want one place for profiles, so that rules are not duplicated.

#### Acceptance Criteria

1. THE Trazador SHALL NOT include the prototype's "Reglas" tab, profile creation, duplication, editing or profile import/export.
2. THE Trazador SHALL include only a profile **selector** (and a read-only summary of the active rules) fed by the API.
3. WHERE the profile list is managed, THE existing "Perfiles de reglamento" view SHALL remain the place for it (Open question 4 confirms the removal).

### Requirement 15: Console look and feel

**User Story:** As a pilot, I want the tool to look like the rest of the Consola.

#### Acceptance Criteria

1. THE view SHALL use the tokens of `prototype.css` and the self-hosted Geist fonts; it SHALL NOT load fonts or scripts from a CDN.
2. THE canvas scene colours SHALL come from CSS variables of the console (existing tokens, plus the few `--track-*` tokens of Requirement 20.4), not from hard-coded hexadecimal or `rgba()` values copied from the prototype (pink accent `#ff2d78`, IBM Plex). The full rules are in **Requirement 20**.
3. THE PNG export MAY use a light "paper" background for printing; it SHALL be defined in the export module, not in the live scene.
4. THE visual validation SHALL be done by the PO (acceptance criterion of EN-28).

### Requirement 16: Architecture constraints (do not deepen existing debt)

**User Story:** As a maintainer, I want the new code to respect the layers.

#### Acceptance Criteria

1. THE code SHALL be organised as `domain/track/`, `infrastructure/contracts/tracks.ts`, `infrastructure/http/tracks.ts` (+ `profiles.ts`), `infrastructure/download/`, `infrastructure/persistence/trackDraft.ts`, `application/hooks/` + `application/state/` for the editor, and `ui/pages/TrackTracer.tsx` + `ui/components/track/`.
2. THE `domain/track` module SHALL NOT import any `@/infrastructure` type (unlike the 4 existing domain files); wire types SHALL be translated in `http/tracks.ts` (ACL) to domain types.
3. THE new `ui/` files SHALL NOT import from `@/infrastructure`; they SHALL use application hooks (unlike `AuthGate`, `Control`, `System`).
4. WHERE feasible, THE project SHOULD enforce 2 and 3 with `no-restricted-imports` scoped to the new folders (optional task).
5. THE code SHALL call `fetch` only through `request()` and SHALL NOT add dependencies to `package.json`.
6. THE track editor state SHALL NOT be added to the 1,500-line `ConsoleContext`; it SHALL live in its own hooks/provider.
7. THE changes to existing files SHALL be limited to: `Tab`/`GROUP` (`ConsoleContext.tsx`), `PAGINAS` (`App.tsx`), `Rail.tsx`, `BottomNav.tsx`, `Icons.tsx`, `contracts` (new file), and styles.

### Requirement 17: Tests

**User Story:** As a maintainer, I want automated proof that the port is faithful.

#### Acceptance Criteria

1. THE domain tests SHALL verify, for the two prototype examples, total length (833.448 cm for «Técnica 3 × 2,5»; 715.617 cm for «Ocho libre»), the counts and statistics in the table of the Introduction, and the issue kinds (0 issues each under their own profile; «Ocho libre» under the Let's Go profile → `cruce` and `corte`).
2. THE domain tests SHALL cover each of the 13 rules (pass and fail), crossings, radius fit, templates and `toSVG` (golden snapshot of a small track).
3. THE HTTP tests SHALL cover the ACL mapping both ways, pagination, validation errors, 401 and the export call, with `fetch` stubbed.
4. THE hook tests SHALL cover history (200 cap, no-op commands), dirty state, save/update/delete, draft restore and profile selection.
5. THE export tests SHALL cover SVG variants, PNG blob creation (jsdom canvas stub), JSON and file names.
6. THE view tests SHALL cover the Rail entry, list/open/save flow, verification panel, import of the v2 envelope and error states.
7. THE project SHALL provide an opt-in live test (`RUN_LIVE_QA=1`) against the deployed API: create, list, read, update, export and delete one track, then clean up.
8. THE tests SHALL live under `tests/unit/` and `tests/integration/` and keep `npm test` green offline.

### Requirement 18: Incremental delivery of the canvas interaction

**User Story:** As a maintainer, I do not want a single 1,400-line rewrite.

#### Acceptance Criteria

1. THE interaction SHALL be ported as a typed `TrackCanvasController` class wrapped by `TrackCanvas.tsx`, in slices (view/pan/zoom → draw → select/move → insert/delete/radius → zones/templates → transformations/menu → history → simulation).
2. WHEN a slice is merged, THE view SHALL remain usable and tested; slices not yet ported SHALL be hidden, not half-working.
3. THE controller SHALL expose a host interface (read document/selection/options, request commands) so it can be tested with a fake host and no React.

### Requirement 19: Parsing of API errors

**User Story:** As a pilot, I want to see which field the API rejected and why.

#### Acceptance Criteria

1. THE HTTP adapter for tracks SHALL tell the two 422 shapes apart with `Array.isArray(body.detail)`.
2. WHEN `detail` is a list (**shape A**, Pydantic/FastAPI parsing: `[{type, loc, msg, input, ctx?}, …]`, every failing field included, `loc[0]` = `"body"`, `msg` in English), THE adapter SHALL convert each entry into `{path, message}` where `path` is `loc` without the leading `"body"`, joined like `points[3].radius`, and SHALL keep all entries.
3. WHEN `detail` is an object (**shape B**, domain rule or reference: `{reason, detail}`), THE adapter SHALL keep `reason` and map it to a Spanish message and, when possible, a field: `track_not_found` (404), `track_profile_unknown` (422, profile picker), `track_name_invalid` (name), `track_points_count`, `track_zones_count`, `track_board_size`, `track_radius_range`, `track_coordinate_range`, `track_zone_size`, `track_zone_name`, `track_not_finite`, `track_length_invalid`, `track_start_invalid`, `track_closed_needs_three_points`.
4. THE adapter SHALL extend the existing `ErrorApi`/`toApiError` with an optional `fields: {path, message}[]` (backward compatible: current callers keep working) instead of changing the backend format (decision taken with the backend).
5. THE `msg` texts depend on the installed Pydantic version, so THE Trazador SHALL show its own Spanish message based on `type` (e.g. `less_than_equal`, `greater_than_equal`, `missing`, `extra_forbidden`, `string_too_long`) and fall back to the raw `msg` for unknown types; THE raw `input` SHALL NOT be rendered as HTML.
6. WHEN `fields` exist, THE Trazador SHALL mark the matching inputs or list items; paths that cannot be mapped to a control SHALL be listed in an error summary.
7. WHEN the response is 404 `track_not_found` (deleted elsewhere), THE Trazador SHALL show "La pista ya no existe", keep the local document as an unsaved copy and refresh the list.
8. WHEN the response is 401, THE existing behaviour SHALL apply (Requirement 9.6).

### Requirement 20: Visual identity — console palette

**User Story:** As a pilot and as the Product Owner, I want the Trazador to look exactly like the rest of the Consola, so that it feels like one product and the PO can validate it side by side.

#### Acceptance Criteria

1. THE view SHALL NOT copy any CSS from the prototype. THE view SHALL NOT use the prototype's variable names, because several share a name with a **different** console value: `--purple` (prototype: pink `#ff2d78`; console: violet `#b48cff`), `--bg` (`#08080a` vs `#050609`), `--line` (opaque `#222228` vs translucent `rgba(255,255,255,.065)`), `--ink` (`#ededf0` vs `#eceef4`) and `--r` (10 px vs 16 px). THE view SHALL NOT define `--purple`, `--bg`, `--line`, `--ink` or `--r` locally.
2. THE view SHALL prefix every new class with `trk-` (e.g. `.trk-board`, `.trk-toolbar`) and SHALL reuse the existing classes and components of `ui/styles/prototype.css` for everything that already exists: `Card`/`.card`, `.tag` (`.red`, `.good`, `.warn`, `.purple`), `.badge` (`.good`, `.warn`, `.bad`), `.sb` (`.red`, `.ghost`) for buttons, `.seg` for segmented controls, `.chips`, `.tabs`, `.inp`, `.kv`, `.table`, `.modal` (`.on`), `.hint`, `.note`, `.segs` (stat list) and `.m` (mono numbers). THE view SHALL NOT introduce the prototype's `.btn`, `.pill`, `.pitem` or similar equivalents.
3. THE view SHALL map every prototype colour to a console token according to the table in `design.md` §3.11; IF no equivalent exists, THEN it SHALL be declared once as a `--track-*` token (item 4) and nowhere else.
4. THE view SHALL declare at most these new tokens in `ui/styles/track.css`: `--track-paper` (white sheet that simulates the board vinyl), `--track-line` (printed black line) and `--track-ink-on-paper` (dark text/dimension tone for use on the sheet, ≥ 4.5:1 against `--track-paper`). Any further token SHALL be justified in the spec before it is added.
5. THE canvas SHALL read all of its colours through the console's `themeColors()` helper (extended with the missing keys) instead of a parallel `trackColors()` helper, and SHALL obtain translucency with `globalAlpha`, not with literal `rgba()` strings.
6. THE view SHALL use `--sans` and `--mono` (Geist, self-hosted) for every text, including text drawn on the canvas, and SHALL NOT reference IBM Plex or any font CDN.
7. THE view SHALL have no light theme and no theme toggle: the console is dark by design (the prototype's light/dark switch and its `matchMedia` listener are removed).
8. WHEN the board is shown as a white sheet (optional "hoja" surface, Open question 16), THE sheet and printed line SHALL use `--track-paper` and `--track-line`, and any accent drawn over the sheet SHALL meet 3:1 against it (see the contrast table in `design.md` §3.11).
9. THE severity of an issue SHALL NOT be conveyed by colour alone: in the console the accent colour is also the error colour, so errors SHALL use `.tag.red` plus an "error" glyph/label, and warnings SHALL use `.tag.warn` plus a "warning" glyph/label, in the list and on the canvas markers.
10. THE SVG 1:1 export for printing SHALL stay black on white and is not part of the interface palette; THE PNG plan palette follows Open question 15.
11. THE secondary text of the view SHALL use `--mid`; `--dim` SHALL NOT be used for text or for meaningful graphics (it measures 3.39:1 on `--bg`, 3.25:1 on `--panel`, 3.08:1 on `--panel2` and 2.88:1 on `--panel3`).
12. THE automated tests SHALL fail IF a file in `src/ui/components/track/**`, `src/ui/pages/TrackTracer.tsx` or `src/ui/styles/track.css` contains a hexadecimal colour, `rgb()/rgba()/hsl()/hsla()` literal or a prototype-only variable name, outside an explicit whitelist (item 13).
13. THE whitelist SHALL be explicit and minimal: (a) the three `--track-*` declarations in `track.css`; (b) the PNG export constants block, only if the PO chooses a paper PNG (Open question 15); the SVG print palette lives in `domain/track/svg.ts`, outside the scanned folders. Every other literal colour SHALL be a failure.
14. THE CSS of the view SHALL only reference custom properties that exist in `prototype.css` or `track.css`; a test SHALL fail on an unknown `var(--x)`.
15. WHEN the PO validates the view, THE view SHALL pass this visual checklist in the dark theme: (a) side-by-side comparison with Catálogo and Armador shows the same panels, borders, radius, typography, tags and buttons; (b) text has at least 4.5:1 contrast and lines/graphics at least 3:1 against their background; (c) keyboard focus shows the console's `:focus-visible` outline (2 px `--red`, offset 2 px) on every control, including the focusable canvas; (d) hover, pressed and disabled states match the existing `.sb`, `.seg button`, `.chips button` and `.tabs button` states; (e) no horizontal scroll at 360 px width.
16. THE PR SHALL attach screenshots for (a) and (e) (desktop and phone) so the PO can review without running the app.

## Open questions (Product Owner / backend — recommendations, not decisions)

1. **Competition and track rules** (LGR 2026, MR4 or other). The backend adds two profiles, `lgr2026` and `libre`, with `rules.track`; the existing `club`, `mr4a`, `mr4s`, `mr4m` have none. The prototype ships "Let's Go Robot 2026" (`radiusMin 15`, `angleMin 90`, `sepMin 30`, `margin 30`, `zoneDist 30`, `crossMax 0`, `gapMax 0`, closed, line 19 mm, gap 2 cm) and "Entrenamiento libre"; the API profiles are `club`, `mr4a`, `mr4s`, `mr4m`. *Recommendation:* seed Let's Go Robot 2026 and a free-training profile in the backend with `rules.track`; MR4 profiles get track rules only if the PO provides them. Until answered, verification is disabled for profiles without `rules.track` (Requirement 6.5).
2. **Length unit.** Recommendation: **cm** for stored `length_cm` (matches the geometry and the contract field name); HU-30 and HU-35 convert to metres in the UI when needed.
3. **"SVG con cotas".** Is it a new export or the prototype's "SVG 1:1 con zonas marcadas"? *Recommendation:* ask; plan it as a separate optional task and keep the zones variant as the safe default.
4. **Remove the profile editor from the tracer.** *Recommendation:* yes (assumed; Requirement 14), because the API has no profile write endpoint and the Consola already has the Perfiles view.
5. **Split EN-28?** *Recommendation:* yes — at least backend vs frontend, and the frontend into (a) domain port, (b) editor, (c) persistence/import/export, (d) profiles + live test. See `design.md` for the sizing.
6. **Draft in `localStorage`.** The brief allows a local working draft; *recommendation:* keep it (Requirement 11) because a 401 unmounts the console; confirm with the PO.
7. **Limits are assumptions** (backend values, pending the PO): name 1..80; points 2..500; zones 0..100; board 50..2000 cm; radius 0..200 cm; point/zone coordinates finite with |value| ≤ 10000 cm (points may be outside the board); zone `width`/`height` in (0, 2000] cm; zone name ≤ 80; `start.edge` 0..(points−1) closed / 0..(points−2) open; `start.t` 0..1; `length_cm` in (0, 100000]. *Recommendation:* confirm; the frontend keeps them in one constants module.

Frontend-found questions for the backend (the contract is NOT changed here):

8. **Units** (RESOLVED as an assumption, pending PO confirmation): everything in centimetres — `length_cm`, board, points, zones and `length_min`/`length_max` of `profile.rules.track` (the backend seed converts the prototype's metres ×100); `angle_min` in degrees; `line_width_mm` in millimetres. The UI may show metres. *Recommendation:* keep.
9. **Allowed ranges** (RESOLVED as assumptions; see 7). Still open: whether `closed` with fewer than 3 points should be rejected (backend: yes, 422 `track_closed_needs_three_points`; the prototype treats it as open). *Recommendation:* keep the rejection and let the frontend normalise before sending (Requirement 10.5).
10. **JSON export shape (PENDING, PO).** The backend produces ONE form: the plain track object (same as `GET /{id}`) with `Content-Disposition`. Wrapping it in `{format, version, track}` is undecided. *Recommendation:* add the envelope when a second format appears; until then plain. The frontend import accepts plain, envelope and prototype v2 (Requirement 13); the API does not import v2.
11. **Concurrency** (RESOLVED for EN-28): `PUT` is last-write-wins; `If-Match` is an optional future change. Consequence for the frontend: two tabs overwrite each other (Requirement 9.9). *Recommendation:* accept for EN-28.
12. **Field-level validation errors** (RESOLVED): the backend keeps both 422 shapes (list from Pydantic, object `{reason, detail}`); the frontend parses them (Requirement 19). No backend change.
13. **Profile identity.** `profile_id` is a string id returned by `GET /api/profiles` (`lgr2026`, `libre`, …); an unknown id answers 422 `track_profile_unknown` on POST and PUT. The profile API is read-only in this story, so deleting a profile with tracks is not applicable (a future delete would answer 409 `profile_in_use`).
14. **Consola profiles are static today.** The Perfiles view reads `shared/data/rulebook.ts`, not the API. The tracer will read the API (Requirement 6), so the two views may show different profile lists until the Perfiles view also moves to the API. *Recommendation:* track as a separate story.

Visual identity questions (added with Requirement 20):

15. **PNG plan palette (PO).** Today the prototype's PNG has a dark background `#15141a` with a gold accent (and the SVG print is black on white). Should the PNG follow the console's dark palette (`--bg`, `--red`, `--yellow`) or use a light paper background for printing? *Recommendation:* console dark palette for the PNG (consistent with what the pilot sees) and keep the SVG 1:1 as the printing format; if paper is chosen, the PNG constants go in the explicit whitelist (Requirement 20.13).
16. **Board surface of the live canvas (PO).** The prototype has two board palettes: a dark one (`boardPal(true)`: board `#0d0d10`, pink glowing line) and a white sheet (`PAPER #fdfdfb`, black line). The dark one maps almost entirely to existing console tokens and needs no new colour; the white sheet needs `--track-paper`/`--track-line` and most accent colours fail 3:1 on it (only `--red` reaches 3.58:1). *Recommendation:* dark board by default; offer the white sheet only as an optional "hoja" view if the PO wants to see it as printed. This question was raised by the frontend; it changes only the default of Requirement 20.8.
