# Implementation Plan — EN-28 · Track Tracer in the Consola (frontend)

## Overview

Nothing is implemented: every box is `[ ]`. This plan follows the slices of `design.md` (S0–S6); each
slice ends shippable and tested. Tasks marked `*` are optional (they depend on a pending PO decision or are
quality extras). Do not start S1 integration work against the real API before the backend contract is
published; S0 can start now. No new dependencies, no code changes outside the files named below.

## Tasks

- [x] 1. Preparation
  - [x] 1.1 Store a copy of the unversioned prototype for reference — `docs/prototipos/trazador-de-pistas.html` (copy only; do not edit the original) — verificado: `cmp` byte a byte con el original, que no se tocó (`docs/prototipos/trazador-de-pistas.html`)
  - [x] 1.2 Add `tracer` entry points: `"tracer"` in `type Tab` and `GROUP` — `src/application/state/ConsoleContext.tsx` — hecho: `src/application/state/ConsoleContext.tsx` (`Tab`, `GROUP`)
  - [x] 1.3 Register the page — `src/app/App.tsx` (`PAGINAS`), placeholder `src/ui/pages/TrackTracer.tsx` — hecho: `src/app/App.tsx` (`PAGINAS`), `src/ui/pages/TrackTracer.tsx` (página real de solo lectura)
  - [x] 1.4 Rail and BottomNav entries and icon — `src/ui/components/Rail.tsx`, `src/ui/components/BottomNav.tsx`, `src/ui/components/Icons.tsx` — hecho y probado: `tests/black-box/components/track-navigation.test.tsx` (Rail, BottomNav «Pistas», icono `tracer`)
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. S0 — Domain port with golden tests
  - [x] 2.1 Types, limits (all backend limits incl. coordinates ±10000, zone size, zone name, start ranges) and `validateTrack` — `src/domain/track/types.ts`, `src/domain/track/limits.ts` — `src/domain/track/types.ts`, `src/domain/track/limits.ts` (verificado: `tests/unit/track/limits-svg-import.test.ts`)
  - [x] 2.1b `normalizeTrack`: `closed = false` when n < 3, `start` clamped to the valid range — `src/domain/track/limits.ts` — `src/domain/track/limits.ts` (verificado: mismas pruebas)
  - [x] 2.2 Geometry: `edgesOf`, `build` (fillets, `fit`, sampling 0.5 cm, `s`, `L`), `crossings`, `straightRuns` — `src/domain/track/geometry.ts` — `src/domain/track/geometry.ts` (verificado: valores de referencia en `tests/unit/track/geometry.test.ts`)
  - [x] 2.3 Rule catalog (13 rules, contract names) and `analyze` (stats, issues, order, `fix`) — `src/domain/track/rules.ts` — `src/domain/track/rules.ts` (verificado: `tests/unit/track/rules.test.ts`; longitudes en cm, mensajes en metros)
  - [x] 2.4 Templates (7) and `insertTemplate` — `src/domain/track/templates.ts` — `src/domain/track/templates.ts` (verificado: `tests/unit/track/edit.test.ts`)
  - [x] 2.5 `toSVG` (1:1, zones variant, gap splitting, XML escaping) — `src/domain/track/svg.ts` — `src/domain/track/svg.ts` (verificado: `tests/unit/track/limits-svg-import.test.ts`)
  - [x] 2.6 Pure edit commands (insert/delete point, radius, edge length, reverse, `fixRadii`, zones, start) — `src/domain/track/commands.ts` — `src/domain/track/commands.ts` (verificado: `tests/unit/track/edit.test.ts`)
  - [x] 2.7 Transforms (rotate, scale, mirror, move) — `src/domain/track/transforms.ts` — `src/domain/track/transforms.ts` (verificado: `tests/unit/track/edit.test.ts`)
  - [x] 2.8 Pure history (cap 200, no-op detection) — `src/domain/track/history.ts` — `src/domain/track/history.ts` (verificado: tope de 200 y comandos sin efecto en `tests/unit/track/edit.test.ts`)
  - [x] 2.9 Simulation pose maths (`simStartS`, `simPose`) — `src/domain/track/simulation.ts` — `src/domain/track/simulation.ts` (verificado: `tests/unit/track/edit.test.ts`)
  - [x] 2.10 Prototype v2 mapper `fromPrototypeV2` — `src/domain/track/prototypeV2.ts` — `src/domain/track/prototypeV2.ts` (verificado: `tests/unit/track/limits-svg-import.test.ts`)
  - [x] 2.11 Two prototype examples as fixtures (rule values already in cm) — `src/domain/track/examples.ts` — `src/domain/track/examples.ts`; reglas de prueba en `tests/unit/track/fixtures.ts` (no son perfiles de producción)
  - [x] 2.12 Golden tests: «Técnica 3 × 2,5» L = 833.448 cm (12 pts, 8 arcs, 4 corners, 0 issues, `sepMin` 30, `edgeMin` 45, `radiusMin` 15, straight 130) and «Ocho libre» L = 715.617 cm (5 arcs, 1 corner, 1 gap, 1 crossing, 0 issues; under LGR → `cruce` + `corte`), tolerance ±0.001 — `tests/unit/track/geometry.test.ts`, `tests/unit/track/rules.test.ts` — verificado: «Técnica» 833,448 cm / 12 pts / 8 arcos / 4 esquinas / 0 incidencias; «Ocho libre» 715,617 cm / 5 arcos / 1 esquina / 1 corte / 1 cruce / 0 incidencias; «Ocho» bajo Let's Go → `cruce` + `corte`
  - [x] 2.13 Tests for each of the 13 rules (pass/fail), templates, transforms, history cap, limits (each boundary), `normalizeTrack` (closed with 2 points, start out of range), v2 mapper, SVG snapshot — `tests/unit/track/` — las 13 reglas (cumple y falla), ajuste de radio, plantillas, transformaciones, historial, límites, `normalizeTrack`, v2 y SVG: 71 pruebas en `tests/unit/track/`
  - [x] 2.14 Check that `src/domain/track/**` imports nothing outside itself (grep in the test or lint) — `tests/unit/track/layering.test.ts` — `tests/unit/track/layering.test.ts` (importaciones de `domain/track`, sin DOM ni red)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.1, 5.2, 8.2, 10.1, 13.2, 16.2, 17.1, 17.2_

- [x] 3. S1 — Contracts, HTTP, profiles
  - [x] 3.1 Wire types `TrackApi`, `TrackListApi`, `ProfileApi` (with optional `rules.track`) — `src/infrastructure/contracts/tracks.ts` — `src/infrastructure/contracts/tracks.ts`
  - [x] 3.2 ACL both ways (`toTrack`, `toTrackBody`, `toTrackProfile`) — `src/infrastructure/http/tracks.ts` — `src/infrastructure/http/tracks.ts`, `src/infrastructure/http/profiles.ts` (verificado: `tests/unit/http-tracks.test.ts`)
  - [x] 3.3 `api.tracks.{list,get,create,update,remove,export}` over `request()` (paged 200, `length_cm` rounded to 0.01) — `src/infrastructure/http/tracks.ts` — `src/infrastructure/http/tracks.ts` (`tracksApi`; `length_cm` redondeado a 0,01)
  - [x] 3.4 `api.profiles.list` keeping profiles with and without `rules.track` — `src/infrastructure/http/profiles.ts` — `src/infrastructure/http/profiles.ts` (`profilesApi`; perfiles sin `rules.track` o con bloque incompleto quedan con `rules: null`)
  - [x] 3.5 Extend `ErrorApi`/`toApiError` with optional `fields: {path, message}[]`: `Array.isArray(detail)` → shape A (`loc` without `"body"` → `points[3].radius`, Spanish message by `type`/`ctx`, raw `msg` fallback); object → shape B (`reason` → Spanish message and field); backward compatible — `src/infrastructure/http/api.ts`, `src/infrastructure/http/trackErrors.ts` — `src/infrastructure/http/api.ts` (`ErrorApi.fields?`), `src/infrastructure/http/trackErrors.ts`
  - [x] 3.5b Map the 14 reasons (`track_not_found`, `track_profile_unknown`, `track_name_invalid`, `track_points_count`, `track_zones_count`, `track_board_size`, `track_radius_range`, `track_coordinate_range`, `track_zone_size`, `track_zone_name`, `track_not_finite`, `track_length_invalid`, `track_start_invalid`, `track_closed_needs_three_points`) to messages and fields — `src/infrastructure/http/trackErrors.ts` — `src/infrastructure/http/trackErrors.ts` (`TRACK_REASONS`, las 14 razones)
  - [x] 3.6 Hooks `useTracks` (list/open/save/delete, validation, length) and `useTrackProfiles` (list, selection, retry) — `src/application/hooks/useTracks.ts`, `src/application/hooks/useTrackProfiles.ts` — `src/application/hooks/useTracks.ts`, `src/application/hooks/useTrackProfiles.ts` (cubiertos por `tests/black-box/pages/track-tracer.test.tsx`; no hay archivo aparte `track-hooks.test.tsx`)
  - [x] 3.7 Tests: mapping both ways, pagination, 401 behaviour, export, profiles without `rules.track`, unknown `profile_id` (422 on POST and PUT) — `tests/unit/http-tracks.test.ts`, `tests/integration/track-hooks.test.tsx` — `tests/unit/http-tracks.test.ts` (18 pruebas: mapeo, paginación, 401, export, 422 de `profile_id` en POST y PUT, perfiles sin reglas)
  - [x] 3.8 Tests for the parsing of BOTH 422 shapes: list with 3 entries (`less_than_equal` with an integer in `loc`, `missing`, `extra_forbidden`), object for each reason, unknown `type`, non-JSON body, and that existing callers still get the generic message — `tests/unit/api-errors.test.ts` — `tests/unit/track-api-errors.test.ts` (25 pruebas, ambas formas de 422; el nombre cambió para no chocar con `tests/unit/infrastructure/api-errors.test.ts`)
  - _Requirements: 6.1, 6.5, 6.6, 6.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 16.1, 16.2, 16.5, 17.3, 17.4, 19.1, 19.2, 19.3, 19.4, 19.5, 19.7_

- [x] 4. S2 — Read-only page: list, open, scene, verification, export
  - [x] 4.1 Editor state provider and hook (document, selection, tool, options, issue selection) — `src/application/state/TrackEditorProvider.tsx`, `src/application/hooks/useTrackEditor.ts` — `src/application/state/TrackEditorProvider.tsx` (`useTrackEditor` va en el mismo archivo)
  - [x] 4.2 Viewport maths (fit, W2S/S2W, zoom at point) and `drawScene` (board, grid, line, arcs, zones, start flag, issue markers) — `src/ui/components/track/viewport.ts`, `src/ui/components/track/drawScene.ts` — `src/ui/components/track/viewport.ts`, `src/ui/components/track/drawScene.ts`
  - [x] 4.3 Palette and styles by reuse: apply the prototype→console mapping of `design.md` §3.11; reuse `Card`, `.tag`, `.badge`, `.sb`, `.seg`, `.chips`, `.tabs`, `.inp`, `.kv`, `.table`, `.modal`, `.hint`, `.note`, `.segs`, `.m`; new classes only with the `trk-` prefix; declare only `--track-paper`, `--track-line`, `--track-ink-on-paper` (`#7a5500`, 6.59:1 on the sheet); no light theme, no CDN, Geist only; import `track.css` eagerly from `main.tsx` — `src/ui/styles/track.css`, `src/main.tsx` — `src/ui/styles/track.css` (3 tokens `--track-*`, clases `trk-`), `src/main.tsx` (import eager); mapeo aplicado
  - [x] 4.3b Extend `themeColors()` with `--panel2`, `--panel4`, `--line3`, `--red-soft`, `--yellow-soft`, `--green-soft` and the `--track-*` keys; add `resetThemeColors()` for tests/theme changes; translucency through `globalAlpha`, glow through `shadowBlur` — `src/domain/canvas.ts` — `src/domain/canvas.ts` (`THEME_KEYS` ampliado, `resetThemeColors()`; verificado: `tests/unit/track/viewport-controller.test.ts`)
  - [x] 4.3c Palette guard tests: fail on hex/`rgb(a)`/`hsl(a)` literals, prototype-only variables, `IBM Plex` or font CDNs in `src/ui/components/track/**`, `src/ui/pages/TrackTracer.tsx`, `src/ui/styles/track.css`, outside the explicit whitelist (the three `--track-*` declarations; the PNG constants block only if the PO picks paper); second test: every `var(--x)` exists in `prototype.css` or `track.css`; third: every `themeColors()` key is declared — `tests/unit/track/palette-guard.test.ts` — `tests/unit/track/palette-guard.test.ts` (13 pruebas: hex, rgb/hsl, variables del prototipo, `--dim`, fuentes externas, `.btn`/`.pill`, `var(--x)` inexistentes, 3 tokens exactos, contraste)
  - [x] 4.3d Severity not by colour alone: `.tag.red` + error glyph, `.tag.warn` + warning glyph in the issue list and canvas markers — `src/ui/components/track/IssuesPanel.tsx`, `src/ui/components/track/drawScene.ts` — `src/ui/components/track/glyphs.tsx`, `src/ui/components/track/IssuesPanel.tsx`, `src/ui/components/track/drawScene.ts` (círculo con «!» para errores, triángulo para avisos)
  - [x] 4.4 `TrackCanvas` + `TrackCanvasController` (pan/zoom/fit only) with host interface — `src/ui/components/track/TrackCanvas.tsx`, `src/ui/components/track/TrackCanvasController.ts` — `src/ui/components/track/TrackCanvas.tsx`, `src/ui/components/track/TrackCanvasController.ts` (verificado: `tests/unit/track/viewport-controller.test.ts`)
  - [x] 4.5 `TrackList` (loading/empty/error-retry, pagination), open, delete with in-page confirmation — `src/ui/components/track/TrackList.tsx` — `src/ui/components/track/TrackList.tsx` (verificado: `tests/black-box/pages/track-tracer.test.tsx`)
  - [x] 4.6 `ProfilePicker` and read-only rule summary; "Este perfil no tiene reglas de pista" state — `src/ui/components/track/ProfilePicker.tsx` — `src/ui/components/track/ProfilePicker.tsx`
  - [x] 4.7 `IssuesPanel` with statistics, severity ordering, click-to-locate — `src/ui/components/track/IssuesPanel.tsx` — `src/ui/components/track/IssuesPanel.tsx`
  - [x] 4.8 Download adapter (`Blob` + object URL, revoke) and `useTrackExport` for SVG 1:1, SVG with zones and JSON — `src/infrastructure/download/saveBlob.ts`, `src/application/hooks/useTrackExport.ts`, `src/ui/components/track/ExportMenu.tsx` — `src/infrastructure/download/saveBlob.ts`, `src/application/hooks/useTrackExport.ts`, `src/ui/components/track/ExportMenu.tsx`
  - [x] 4.9 Tests: list/open flow, issues panel, profile without track rules, exports and file names — `tests/integration/track-tracer.test.tsx`, `tests/unit/track-export.test.ts` — `tests/black-box/pages/track-tracer.test.tsx` (15 pruebas), `tests/black-box/components/track-navigation.test.tsx` (3), `tests/unit/track/viewport-controller.test.ts` (11); la prueba de la página está en `black-box`, como las demás páginas del repo
  - _Requirements: 1.4, 1.5, 6.2, 6.3, 6.4, 6.5, 6.6, 9.5, 12.1, 12.2, 12.5, 12.6, 12.7, 12.8, 15.1, 15.2, 16.3, 17.5, 17.6, 18.1, 18.2, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.9, 20.11, 20.12, 20.13, 20.14_

- [ ] 5. S3 — Core editing, history and saving
  - [ ] 5.1 Draw tool (append, close on first point, insert on segment, grid snap, angle snap) — `src/ui/components/track/TrackCanvasController.ts`
  - [ ] 5.2 Select tool (point/segment/zone, multi-select, drag box, move single and group, drag start flag) — `src/ui/components/track/TrackCanvasController.ts`
  - [ ] 5.3 Hit testing and snapping helpers — `src/ui/components/track/hitTest.ts`
  - [ ] 5.4 Inspector (name, board, point radius, segment length, gap, start) with numeric inputs — `src/ui/components/track/TrackInspector.tsx`
  - [ ] 5.5 Undo/redo wiring (200 steps, one step per gesture, selection cleared) and keyboard shortcuts scoped to the mounted view — `src/application/hooks/useTrackEditor.ts`, `src/ui/components/track/useTrackShortcuts.ts`
  - [ ] 5.6 Save/update, dirty indicator, warning before replacing or leaving — `src/application/hooks/useTracks.ts`, `src/ui/pages/TrackTracer.tsx`
  - [ ] 5.7 Pre-send validation with per-field messages and the same `FieldError` paths as the server; block a closed track with < 3 points; normalise `start` — `src/ui/components/track/TrackInspector.tsx`, `src/domain/track/limits.ts`
  - [ ] 5.7b Show server `fields` next to inputs, an error summary for unmapped paths, `track_not_found` handling (keep unsaved copy), profile error on the picker — `src/ui/components/track/TrackInspector.tsx`, `src/ui/components/track/ProfilePicker.tsx`
  - [ ] 5.8 Local draft (debounced, key per track id or "new" so two tabs do not share it, restore/discard prompt, cleared on save) — `src/infrastructure/persistence/trackDraft.ts`, `src/application/hooks/useTrackDraft.ts`
  - [ ] 5.8b Document last-write-wins in the UI help (no conflict detection) — `src/ui/pages/TrackTracer.tsx`
  - [ ] 5.9 Radius-fit warning and one-click fix — `src/ui/components/track/IssuesPanel.tsx`
  - [ ] 5.10 Controller tests with a fake host (draw, close, drag commits once, Esc, shortcuts inactive when unmounted) — `tests/unit/track/controller.test.ts`
  - [ ] 5.11 Hook tests (history cap and no-op commands, dirty state, save/update/delete, 401 keeps draft, draft restore) — `tests/integration/track-editor.test.tsx`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3, 5.4, 9.3, 9.6, 9.7, 9.8, 9.9, 9.11, 10.1, 10.2, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, 17.4, 18.1, 18.3, 19.6, 19.7_

- [ ] 6. S4 — Zones, templates, group editing, transformations
  - [ ] 6.1 Zone tool (drag to create, name, delete, resize) with the 100-zone / 500-point guards — `src/ui/components/track/TrackCanvasController.ts`
  - [ ] 6.2 Template picker and insertion on a straight segment (side, centring, start index fix) — `src/ui/components/track/TemplatePicker.tsx`
  - [ ] 6.3 Selection bar and transformations (rotate by step, scale, mirror H/V, move, numeric inputs) — `src/ui/components/track/SelectionBar.tsx`
  - [ ] 6.4 Context menu (point, segment, zone, empty) — `src/ui/components/track/ContextMenu.tsx`
  - [ ] 6.5 Reverse track, edge length, gap toggle commands wired to UI — `src/ui/components/track/TrackInspector.tsx`
  - [ ] 6.6 Tests: transformations on selection and on the whole track, templates, limits guards — `tests/unit/track/`, `tests/integration/track-tracer.test.tsx`
  - _Requirements: 3.3, 4.1, 4.3, 8.1, 8.2, 8.3, 17.2, 17.6_

- [ ] 7. S5 — Dimensions, simulation, PNG, import
  - [ ] 7.1 Dimensions on the canvas (segment lengths, radii, angles; toggle) — `src/ui/components/track/drawScene.ts`
  - [ ] 7.2 Simulation bar (rectangle size, speed, play/pause, slider, loop/stop) — `src/ui/components/track/SimulationBar.tsx`, `src/application/hooks/useTrackSimulation.ts`
  - [ ] 7.3 PNG export on an offscreen canvas with `toBlob` (await Geist font) — `src/ui/components/track/exportPng.ts`
  - [ ] 7.4 JSON import: plain object (the only form the backend exports), `{format, version, track}` envelope and prototype v2; size cap; validation; `normalizeTrack`; load as unsaved — `src/application/hooks/useTrackImport.ts`, `src/ui/components/track/ImportButton.tsx`
  - [ ] 7.5 Tests: v2 import with the two prototype examples (converted), invalid files, simulation looping, PNG blob (canvas stub) — `tests/integration/track-tracer.test.tsx`, `tests/unit/track-export.test.ts`
  - [ ]* 7.6 "SVG con cotas" export (only if the PO confirms it is new) — `src/domain/track/svg.ts`, `src/ui/components/track/ExportMenu.tsx`
  - _Requirements: 4.2, 7.1, 7.2, 7.3, 7.4, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 17.5, 17.6_

- [ ] 8. S6 — Polish, accessibility, live test, closure
  - [ ] 8.1 Visual checklist for the PO, with screenshots attached to the PR (desktop and 360 px phone): (a) side-by-side with Catálogo and Armador in the dark theme; (b) text ≥ 4.5:1 and lines/graphics ≥ 3:1 (use the contrast table of `design.md` §3.11); (c) `:focus-visible` outline (2 px `--red`, offset 2 px) on every control and on the focusable canvas; (d) hover/pressed/disabled states equal to `.sb`, `.seg button`, `.chips button`, `.tabs button`; (e) no horizontal scroll at 360 px; panels stack on phone — `src/ui/styles/track.css`, PR description
  - [ ] 8.1b Optional "hoja" (white sheet) surface using `--track-paper`/`--track-line`/`--track-ink-on-paper`, only if the PO asks (Open question 16); over the sheet use only `--red`, `--track-line`, `--track-ink-on-paper` for meaningful graphics — `src/ui/components/track/drawScene.ts`
  - [ ] 8.2 Accessibility: toolbar ARIA, focus order, numeric fields as keyboard alternative, live region for issue count — `src/ui/components/track/`
  - [x] 8.3 Opt-in live test: create, list, read, update, export, delete one track (`RUN_LIVE_QA=1`) — `tests/integration/qa-live-tracks.test.tsx` — hecho antes de tiempo para la integración de FE-1: `tests/integration/qa-live-tracks.test.ts` (6 pruebas, se saltan sin `RUN_LIVE_QA=1`); pasaron contra la API local (perfiles, crear/listar/leer/actualizar/exportar/borrar, 422 forma A y B, 404)
  - [ ] 8.4 PO visual validation (acceptance criterion) — manual, record the result in this spec
  - [ ] 8.5 Update docs (`docs/ARCHITECTURE.md` tests/section, `README.md`) — `docs/`
  - _Requirements: 1.5, 15.1, 15.4, 17.7, 17.8, 20.8, 20.15, 20.16_

- [ ] 9. Architecture guardrails
  - [ ]* 9.1 `no-restricted-imports` overrides for `src/domain/track/**` (no `@/infrastructure`, `@/application`, `@/ui`) and `src/ui/components/track/**` + `src/ui/pages/TrackTracer.tsx` (no `@/infrastructure`) — `eslint.config.js`
  - [x] 9.2 Confirm no dependency was added — `package.json`, `package-lock.json` — `git diff -- package.json package-lock.json` vacío; `@playwright/test` ya estaba en `origin/main`
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [x] 10. Removed from the prototype (confirm nothing is ported)
  - [x] 10.1 Review that no profile editor, built-in profiles, `window.claude`, CDN fonts or `localStorage` track store exist in the new code — `src/` — búsqueda en el código nuevo: sin `window.claude` (solo un comentario que lo menciona), `localStorage`, IBM Plex, CDN, `matchMedia` ni perfiles propios
  - _Requirements: 6.1, 9.10, 12.7, 14.1, 14.2, 14.3, 15.1_

- [ ] 11. Pending decisions (do not implement before the PO answers)
  - [ ] 11.1 Competition / profiles (Open question 1) — PO
  - [ ] 11.2 Length unit confirmation (Open question 2; assumed cm) — PO
  - [ ]* 11.3 "SVG con cotas" scope (Open question 3) — PO
  - [ ] 11.4 Remove profile editing from the tracer (Open question 4) — PO
  - [ ] 11.5 Split EN-28 into stories (Open question 5; recommendation in `design.md`) — PO
  - [ ] 11.6 Confirm the proposed limits and the export shape (Open questions 7, 10) — PO / backend
  - [ ] 11.7 Confirm that `closed` with fewer than 3 points stays rejected (Open question 9) — PO / backend
  - [ ] 11.8 PNG palette: console dark or light paper (Open question 15) — PO
  - [ ] 11.9 Default board surface of the live canvas: dark or white sheet (Open question 16) — PO
  - _Requirements: 6.5, 10.3, 12.3, 14.3, 20.8, 20.10, 20.13_
