# Design Document — EN-28 · Track Tracer in the Consola (frontend)

## Introduction

The prototype is two things glued together: a **pure core** (`Track2`, ~405 lines, already testable with
`module.exports`) and an **imperative UI** (~1,440 lines of canvas interaction, state, panels, storage
and downloads bound to `document`). The design ports them separately:

1. `Track2` becomes `domain/track/` in TypeScript, with golden tests against the prototype.
2. The imperative canvas interaction becomes a typed **controller class** that talks to React through a
   small host interface, ported in slices rather than all at once.
3. The prototype's storage layer (`initStore`/`dbSet`, `window.claude`, `localStorage`) and download layer
   are replaced by `request()`-based HTTP adapters and `Blob` downloads.

Nothing here is implemented yet. The embedded iframe option was rejected in the analysis (it breaks the
style and persistence criteria).

## Goals & Non-Goals

**Goals**

- Full HU-32 functionality inside the Consola, in the console's style, persisted only through the API.
- A faithful, tested port of the geometry and the 13 rules.
- Layer-clean new code: no new `domain → infrastructure` or `ui → infrastructure` imports.
- No new dependencies; Geist self-hosted; no CDN.
- Incremental, always-shippable delivery.

**Non-Goals**

- The backend (table, endpoints, profile seeds): `velocista-backend\.kiro\specs\en-28-tracks-api`.
- Editing rulebook profiles (stays in "Perfiles de reglamento"); the prototype's "Reglas" tab is dropped.
- Using the saved track in HU-30 (Mapa) or HU-35: only the stored `length_cm` is prepared for them.
- Rewriting `ConsoleContext` or fixing the existing layer debt.
- Backend-side recomputation of the length (the frontend sends it).

## Architecture Overview

```
 ui/pages/TrackTracer.tsx
 ui/components/track/  TrackToolbar · TrackCanvas · TrackInspector · IssuesPanel · TrackList
                       ProfilePicker · SimulationBar · ExportMenu · ImportButton · ContextMenu
        │  (hooks only; no @/infrastructure import)
        ▼
 application/hooks/    useTrackEditor   (document, selection, tool, view options, history ≤200, dirty)
                       useTracks        (list/open/save/delete, validation, length_cm)
                       useTrackProfiles (GET /profiles → TrackProfile[], selection)
                       useTrackExport   (build files → download adapter)
                       useTrackSimulation, useTrackDraft
 application/state/    TrackEditorProvider (own provider; NOT inside ConsoleContext)
        │ uses                                   │ calls
        ▼                                        ▼
 domain/track/                           infrastructure/
   types.ts      Track, TrackPoint,        contracts/tracks.ts   TrackApi, ProfileApi (wire, snake_case)
                 TrackZone, TrackRules,    http/tracks.ts        list/get/create/update/remove/export
                 TrackIssue, Geometry      http/profiles.ts      list → TrackProfile (ACL)
   geometry.ts   build, crossings,         download/saveBlob.ts  Blob + object URL + <a download>
                 straightRuns              persistence/trackDraft.ts  localStorage draft (try/catch)
   rules.ts      RULES catalog, analyze    (all via request(); 401 handled there)
   templates.ts  TEMPLATES, insert
   svg.ts        toSVG (1:1, zones, dims)
   transforms.ts rotate/scale/mirror/move
   history.ts    pure undo/redo stack
   limits.ts     TRACK_LIMITS, validateTrack
   prototypeV2.ts fromPrototypeV2()
   examples.ts   2 prototype examples (tests only)
 ── domain/track imports NOTHING outside domain/track ──
```

Rail/BottomNav/App/`Tab` get one new entry (`"tracer"`); styles live in `ui/styles/track.css` using
`prototype.css` tokens.

## Component Design

### 3.1 Domain model (English, camelCase inside, snake_case only on the wire)

```ts
interface TrackPoint { x: number; y: number; radius: number; gap: boolean }
interface TrackZone  { x: number; y: number; width: number; height: number; name: string }
interface Track {
  id: number | null;                // integer identity (backend assumption), null while unsaved
  name: string;
  board: { widthCm: number; heightCm: number };
  closed: boolean;
  points: TrackPoint[];
  zones: TrackZone[];
  start: { edge: number; t: number };
  profileId: string | null;
  lengthCm?: number;                // derived; sent on save
}
interface RuleSetting { enabled: boolean; value: number | boolean }
interface TrackRules { lineWidthMm: number; gapLengthCm: number; rules: Record<TrackRuleId, RuleSetting> }
type TrackRuleId = "radius_min" | "angle_min" | "no_sharp" | "separation_min" | "margin" | "zone_distance"
  | "closed" | "length_min" | "length_max" | "straight_min" | "straight_max" | "cross_max" | "gap_max";
```

The ACL (`http/tracks.ts`, `http/profiles.ts`) maps `width_cm`↔`widthCm`, `profile_id`↔`profileId`,
`rules.track.line_width_mm`↔`lineWidthMm`, `length_min/max` (cm on the wire and in the domain) etc. Domain code never sees `*Api` types — the opposite of the
current `domain/rules.ts`, which imports `RobotApi`.

### 3.2 Prototype → module map

| Prototype (lines) | Content | Target module |
|---|---|---|
| `Track2` 586–991: `CATALOG`, `RULE` (≈600–625) | 13 rules in 4 groups, labels, hints | `domain/track/rules.ts` (catalog keyed by contract names) |
| `BUILTIN`, `normProfile` (≈627–655) | 2 built-in profiles | **dropped** in production (profiles from API); kept only as test fixtures in `tests/` |
| `edgesOf`, `build` (≈657–745) | fillets, sampling, length `L` | `domain/track/geometry.ts` |
| `crossings` (≈747–783) | spatial-hash crossings | `domain/track/geometry.ts` |
| `analyze`, `srcRef`, `straightRuns` (≈785–880) | verification, stats | `domain/track/rules.ts` |
| `TEMPLATES`, `templateLocal`, `insertTemplate` (≈885–925) | 7 figures | `domain/track/templates.ts` |
| `splitGaps`, `toSVG` (≈930–957) | SVG 1:1 (+zones) | `domain/track/svg.ts` |
| `EXAMPLES` (≈960–980) | 2 examples | `domain/track/examples.ts` (tests/demo) |
| State `S`, `hist`, `commit/undo/redo` (1009–1111) | document, selection, history | `application/state/TrackEditorProvider` + `domain/track/history.ts` |
| Draft `saveDraft/loadDraft` (1100–1103) | localStorage draft | `infrastructure/persistence/trackDraft.ts` + `useTrackDraft` |
| Storage `initStore/dbSet/dbDel` (1035–1090) | `window.claude` db / `localStorage` | **replaced** by `infrastructure/http/tracks.ts` + `useTracks` |
| View/canvas `resize…zoomAt`, `drawScene`, `draw` (1131–1420) | view maths, scene drawing | `ui/components/track/viewport.ts`, `drawScene.ts` (UI-side, pure functions over a 2D context) |
| `hitTest`, `snapW`, `pointerInfo`, drag handlers (1420–1660) | pointer interaction | `ui/components/track/TrackCanvasController.ts` |
| Edit ops `insertPointAt…fixRadii` (1663–1745) | commands | `domain/track/commands.ts` (pure: `(track, selection, args) → track`) |
| Transforms `rotateIdx…moveIdx` (1694–1720) | transformations | `domain/track/transforms.ts` |
| Context menu `openMenu`, `contextFor` (1746–1830) | right-click menu | `ui/components/track/ContextMenu.tsx` |
| Tools/templates UI (1829–1870), inspector (1945–2067), selection bar (2068–2106) | panels | `TrackToolbar`, `TrackInspector`, `SelectionBar` |
| Track list/open/save (1871–1925) | local list | `TrackList` + `useTracks` |
| Simulation (2135–2197) | rectangle on the line | `domain/track/simulation.ts` (pose maths) + `SimulationBar.tsx` |
| Export `saveFile`, `planPNG`, `doExport` (2198–2235) | files | `domain/track/svg.ts`, `ui/components/track/exportPng.ts`, `infrastructure/download/saveBlob.ts`, `useTrackExport` |
| Import `readJSON` (2236–2246, importTrack handler) | v2 import | `domain/track/prototypeV2.ts`, `ImportButton.tsx` |
| Rules page `refreshProfilesUI…importProfiles` (2247–2360) | profile editor | **removed** (Requirement 14) |
| Keyboard handler (2376–2410) | shortcuts on `document` | `TrackCanvasController` / `useTrackShortcuts` scoped to the mounted view |
| Theme `matchMedia` dark toggle | prototype dark/light | **removed**: scene follows console tokens |

### 3.3 Canvas controller (how to port the imperative interaction)

```
TrackCanvas.tsx  (React, ~100 lines)
  ├─ ref = useCanvas(draw)            existing hook: redraw after each render and on resize
  ├─ new TrackCanvasController(canvas, host)   created in useEffect, destroyed on unmount
  └─ renders <canvas> + overlays (selection bar, context menu) as React children

interface TrackCanvasHost {                    // implemented by useTrackEditor
  getTrack(): Track;  getSelection(): Selection;  getTool(): Tool;  getOptions(): ViewOptions;
  getAnalysis(): Analysis | null;
  apply(command: TrackCommand, meta?: { merge?: boolean }): void;   // one history step
  setSelection(s: Selection): void;  setTool(t: Tool): void;
}
```

- The controller owns **transient** state only (current drag, pan, hover, zoom/viewport). Everything that
  must survive or be undone goes through `host.apply(command)`; a drag produces **one** command on pointer-up
  (the prototype's `commit` semantics).
- The controller registers pointer/wheel listeners on the canvas element and keyboard listeners only while
  mounted; it does not touch `document` globally after unmount.
- `drawScene(ctx, viewport, scene, options)` is a pure function used by the live canvas **and** by the PNG
  export (as the prototype does), so both share one drawing path.
- `useCanvas` redraws after every React render; the controller additionally schedules `requestAnimationFrame`
  redraws for hover/drag (no React render per mouse move, so there is no re-render storm).
- Colours: see §3.11. The scene reads the console's `themeColors()` (extended with the missing keys) and the three `--track-*` tokens; there is no parallel `trackColors()` helper.

**Slices (each ends shippable and tested):**

| Slice | Content | Value |
|---|---|---|
| S0 | domain port + examples + golden tests | logic proven |
| S1 | contracts, `http/tracks.ts`, `http/profiles.ts`, hooks `useTracks`/`useTrackProfiles` | API round-trip |
| S2 | read-only page: list, open, scene drawing, issues panel, profile picker, pan/zoom, SVG/JSON export | view + verify + export |
| S3 | draw tool, select/move, insert/delete, radius, inspector, undo/redo, save/update, dirty + draft | real editing |
| S4 | zones, templates, snapping, group edit, transformations, context menu | full editing |
| S5 | dimensions, simulation, PNG export, import (v2 mapping) | HU-32 complete |
| S6 | styles polish, accessibility pass, live QA test, docs | closure; PO visual validation |

### 3.4 State and history

`TrackEditorProvider` holds `{track, selection, tool, options, issueSel, dirty, past[], future[]}` with a
reducer. `history.ts` is pure: `push(before)`, `undo`, `redo`, cap 200, no-op detection by structural
comparison (the prototype compares `JSON.stringify`; keep a cheap structural equality instead). Verification
(`analyze`) runs on `track` or `rules` change through `useMemo`; during drags it runs on the transient
document the controller reports (debounced to animation frames), as the prototype's `changed()` does.

### 3.5 Persistence flow

```
open view ─► GET /profiles  +  GET /tracks?limit=200&offset=0 (paged)
             └─ draft present? ─► offer restore / discard
select track ─► GET /tracks/{id} ─► toDomain ─► editor.load()
edit ─► dirty=true ─► draft (debounced)
save ─► validateTrack(limits) ─► build length_cm = round2(build(track).L)
        ├─ id null  ─► POST /tracks      └─ id set ─► PUT /tracks/{id}
        ok ─► load response (id, updated_at), dirty=false, clear draft
        fail ─► keep dirty, show message (Req 9.7)
delete ─► in-page confirm ─► DELETE /tracks/{id} ─► refresh list
401 anywhere ─► request() clears token + AUTH_EVENT ─► AuthGate login ─► remount ─► draft restore prompt
```

Mapping `Track` ↔ API body:

| Domain | Wire (`/api/tracks`) |
|---|---|
| `board.widthCm/heightCm` | `board.width_cm/height_cm` |
| `points[].{x,y,radius,gap}` | `points[].{x,y,radius,gap}` |
| `zones[].{x,y,width,height,name}` | same |
| `start.{edge,t}` | `start.{edge,t}` |
| `profileId` | `profile_id` |
| `lengthCm` | `length_cm` (sent; read back) |
| — | `id`, `created_at`, `updated_at` (read-only) |

### 3.6 Profiles

`http/profiles.ts` calls `GET /api/profiles` and keeps every profile; only `lgr2026` and `libre` carry `rules.track` (the backend adds them; `club`, `mr4a`, `mr4s`, `mr4m` do not). Each profile with track rules becomes `TrackProfile { id, name, rules: TrackRules }` (lengths in cm, `angle_min` in degrees, `line_width_mm` in mm); the others are listed as unavailable. An unknown `profile_id` on save answers 422 `track_profile_unknown` (POST and PUT).
`TrackProfile { id, name, rules: TrackRules }`. Profiles without `rules.track` are shown as unavailable.
No built-in fallback. This is a **new** API consumer: the Perfiles view still reads static `rulebook.ts` (Open
question 14), so adding `api.profiles` does not change that view.

### 3.7 Exports and import

- `saveBlob(filename, blob)` creates an object URL and clicks a temporary anchor, then revokes the URL.
- SVG: `toSVG(track, rules, {zones?, dimensions?})`; `dimensions` stays out until the PO confirms (Open question 3).
- PNG: offscreen `<canvas>` sized like the prototype (`k = clamp(2600/max(W,H), 2, 7)` plus margins), `drawScene`
  with export options, title and summary text in Geist (await `document.fonts.load` before drawing), `toBlob`.
- JSON: saved → `GET /api/tracks/{id}/export` (bytes saved as received, file name from `Content-Disposition` when present); unsaved → local serialisation of the plain track object. Whether the server wraps it in `{format, version, track}` is pending (Open question 10); the importer accepts both.
- Import: `parseTrackFile(text)` → detects `{app:"trazador-de-pistas", v:2}` → `fromPrototypeV2()`; else API
  format; then `validateTrack`. Mapping table is in Requirement 13.2. Size cap before `JSON.parse`.

### 3.7b Error parsing (Requirement 19)

```ts
interface FieldError { path: string; message: string }          // path like "points[3].radius"
class ErrorApi extends Error { status; reason; fields?: FieldError[] }   // fields is optional: existing callers unaffected
function toApiError(status, body):
  Array.isArray(body.detail)  → shape A: fields = detail.map(e => ({ path: pathOf(e.loc.slice(1)), message: messageFor(e.type, e.ctx, e.msg) })), reason = "validacion"
  detail is {reason, detail}  → shape B: reason kept, message = messageForReason(reason), field = FIELD_OF[reason]
```

| Shape | Example | Result in the UI |
|---|---|---|
| A (list) | `loc:["body","points",3,"radius"]`, `type:"less_than_equal"`, `ctx:{le:200}` | field `points[3].radius`: "El radio debe ser como máximo 200 cm" (Spanish text from `type` + `ctx`; raw `msg` only as fallback) |
| A | `loc:["body","board","width_cm"]`, `type:"missing"` | field `board.width_cm`: "Falta este dato" |
| A | `loc:["body","pts"]`, `type:"extra_forbidden"` | summary: "Campo no permitido: pts" (a mapper bug, not a user error) |
| B | `track_profile_unknown` (422) | profile picker error |
| B | `track_closed_needs_three_points` | "Un circuito cerrado necesita al menos 3 puntos" |
| B | `track_not_found` (404) | "La pista ya no existe"; keep the document as an unsaved copy |

The same-path logic maps both client-side `validateTrack` errors and server errors onto the same inputs. `toApiError` is extended in `http/api.ts` in a backward-compatible way (the array branch today returns the generic "Hay datos inválidos en la solicitud"; that text stays as the default `message`). The client limits should make shape A and most shape-B reasons unreachable; they remain as a safety net because limits are pending the PO.

### 3.8 Limits module

`domain/track/limits.ts` exports `TRACK_LIMITS = { name:[1,80], points:[2,500], zones:[0,100], boardCm:[50,2000], radiusCm:[0,200], coordAbsCm:10000, zoneSizeCm:[>0,2000], zoneName:80, startT:[0,1], lengthCm:(0,100000] }` and `validateTrack(track): LimitError[]` returning Spanish messages with a field path. It also checks the cross-field rules: `start.edge` integer in 0..(points−1) closed / 0..(points−2) open, and `closed` requires ≥ 3 points. One place to change when the PO answers. Points may lie outside the board (only |x|,|y| ≤ 10000 is enforced); the `margin` rule reports them.

`normalizeTrack(track)` runs before save/import: sets `closed = false` when n < 3 (the prototype's `build()` ignores `closed` there, and its UI never sets it with fewer than 3 points, so only imported files can reach this state) and clamps `start` into the valid range (the prototype resets an out-of-range start to `{e:0, t:0.5}` only inside `deletePoints`).

### 3.11 Visual identity: console palette (Requirement 20)

**Name trap.** The prototype and the console share variable names with different values. Copying the prototype's CSS would silently recolour the console view. Values verified in `src/ui/styles/prototype.css` (console) and in the prototype's `:root` (lines 11–32):

| Name | Prototype | Console | Effect if copied |
|---|---|---|---|
| `--purple` | `#ff2d78` (pink accent) | `#b48cff` (violet) | accent turns violet |
| `--purple-soft` | `rgba(255,45,120,.13)` | `rgba(180,140,255,.14)` | soft fills turn violet |
| `--bg` | `#08080a` | `#050609` | page background shifts |
| `--line` | `#222228` (opaque) | `rgba(255,255,255,.065)` (translucent) | borders look different on panels |
| `--ink` | `#ededf0` | `#eceef4` | text tint |
| `--r` | `10px` | `16px` | card radius |
| `--shadow` | `0 8px 28px rgba(0,0,0,.45)` | not defined | undefined variable |

Rule: **never copy prototype CSS**; the new view uses `trk-`-prefixed classes plus the existing console classes (Requirement 20.2). The console has no `.btn`; its buttons are `.sb` (`.sb.red`, `.sb.ghost`), `.seg button`, `.chips button`, `.tabs button`. `.segs` is a stats list (`li` with `.k`/`.v`/`.e`), not a segmented control.

**Mapping prototype → console token** (console values read from `prototype.css`):

| Prototype token | Prototype value | Console token | Console value | Note |
|---|---|---|---|---|
| `--bg` | `#08080a` | `--bg` | `#050609` | page |
| `--bg-2` | `#0e0e11` | `--panel` | `#0b0d12` | cards |
| `--bg-3` | `#141418` | `--panel2` | `#11141b` | inner blocks; `--panel3` `#171b24` for elevated/selected |
| `--line` | `#222228` | `--line` | `rgba(255,255,255,.065)` | borders |
| `--line-2` | `#34343c` | `--line2` | `rgba(255,255,255,.11)` | stronger borders; `--line3` `.18` for the strongest |
| `--ink` | `#ededf0` | `--ink` | `#eceef4` | primary text |
| `--muted` | `#9a9aa3` | `--mid` | `#a2a7b8` | secondary text; `--dim` `#5e6374` only for non-text decoration (fails 4.5:1) |
| `--purple` (pink accent) | `#ff2d78` | `--red` | `#ff2d55` | accent |
| `--purple-soft` | `rgba(255,45,120,.13)` | `--red-soft` | `rgba(255,45,85,.13)` | accent fill |
| accent hover | — | `--red-hi` | `#ff5a78` | hover/active text on dark |
| `--purple-ink` | `#ffffff` | `.sb.red` text | defined by the class | do not redeclare |
| `--gold` | `#d9a43a` | `--yellow` | `#ffcb57` | |
| `--gold-soft` | `rgba(217,164,58,.13)` | `--yellow-soft` | `rgba(255,203,87,.12)` | |
| `--ok` / `--ok-bg` | `#4cc38a` / `rgba(76,195,138,.10)` | `--green` / `--green-soft` | `#3ddc97` / `rgba(61,220,151,.12)` | |
| `--bad` / `--bad-bg` | `#f0624f` / `rgba(240,98,79,.10)` | `--red-hi` / `--red-soft` (`.tag.red`) | `#ff5a78` / `rgba(255,45,85,.13)` | the console's accent is also the error colour: distinguish severity with `.tag.red` vs `.tag.warn` **and** a glyph/label (Requirement 20.9) |
| `--warn` / `--warn-bg` | `#e5a03a` / `rgba(229,160,58,.11)` | `--yellow` / `--yellow-soft` (`.tag.warn`) | `#ffcb57` / `rgba(255,203,87,.12)` | |
| guide blue `GUIDE` | `#4f8df7` | `--blue` | `#6cb6ff` | alignment guides |
| `--desk`, `--desk-dot` | `#060608`, `rgba(255,255,255,.05)` | `--bg` | `#050609` | dotted desk dropped |
| `--shadow` | `0 8px 28px rgba(0,0,0,.45)` | — | not defined | drop; use the console's panel borders |
| `--r` | `10px` | `--r` | `16px` (cards); inner controls keep the radii already used by `.sb`/`.seg` | do not redeclare |
| `--f-ui`, `--f-cond`, `--f-num` | IBM Plex Sans / Condensed / Mono | `--sans`, `--sans`, `--mono` | Geist Sans / Geist Mono (self-hosted) | no condensed face: use `--sans` |
| light theme (`prefers-color-scheme: light`, `data-theme=light`) | whole second palette | — | — | **removed**: the console is dark by design |

**Canvas constants.** Prototype `PAPER #fdfdfb`, `INK #161618`, `PUR #ff2d78`, `GOLD #e0a526`, `GOLDD #9a6c00`, `GUIDE #4f8df7`, `WARNY #f2c200` and the `boardPal()` objects:

| Prototype | Replacement | Why |
|---|---|---|
| `PUR #ff2d78` / dark-board ink `#ff3d84` | `--red` | accent |
| `GOLD #e0a526`, `WARNY #f2c200` | `--yellow` | |
| `GUIDE #4f8df7` | `--blue` | |
| dark board `#0d0d10` | `--panel` (or `--bg`) | existing |
| grid `g1/g2/g3` (white at .035/.06/.11) | `--line`, `--line2`, `--line3` (white at .065/.11/.18) | existing, slightly stronger |
| zone fill/stroke (`mFill`/`mLine`, red-orange) | `--yellow` at `globalAlpha` (zones are "forbidden": warn colour) or `--red` | no literal `rgba()` |
| `PAPER #fdfdfb` | **`--track-paper`** (new) | no console equivalent (simulated vinyl sheet) |
| `INK #161618` | **`--track-line`** (new) | printed black line |
| `GOLDD #9a6c00` (dimension text on the sheet) | **`--track-ink-on-paper`** (new) = `#7a5500` | `#9a6c00` is only 4.56:1 on the sheet; `#7a5500` gives 6.59:1 |
| glow `rgba(255,45,120,.55)` | `--red` with `shadowBlur` and `globalAlpha` | no literal |

The prototype has two board palettes: a dark one (board `#0d0d10`, glowing pink line) and a white sheet. The dark one needs no new colour; the sheet needs the three `--track-*` tokens. Which is the default is Open question 16 (recommendation: dark; sheet optional).

**Contrast (computed with the WCAG relative-luminance formula; console tokens).**

| Colour | on `--bg` | on `--panel` | on `--panel2` | on `--panel3` |
|---|---|---|---|---|
| `--ink` | 17.47 | 16.75 | 15.88 | 14.85 |
| `--mid` | 8.45 | 8.10 | 7.68 | 7.18 |
| `--dim` | **3.39** | **3.25** | **3.08** | **2.88** |
| `--red` | 5.56 | 5.33 | 5.05 | 4.73 |
| `--red-hi` | 6.74 | 6.47 | 6.13 | 5.73 |
| `--yellow` | 13.44 | 12.89 | 12.22 | 11.43 |
| `--green` | 11.46 | 11.00 | 10.43 | 9.75 |
| `--blue` | 9.43 | 9.04 | 8.57 | 8.02 |

Consequences: every console accent passes 4.5:1 as text on all four panels; `--dim` fails 4.5:1 (text) and 3:1 on `--panel3`, so it is banned for text and meaningful graphics. On the white sheet (`--track-paper #fdfdfb`): `--track-line` 17.74, `--track-ink-on-paper` 6.59, `--red` 3.58 (passes 3:1 for lines/markers, fails 4.5:1 for small text), `--red-hi` 2.95, `--blue` 2.11, `--purple` 2.53, `--green` 1.74, `--yellow` 1.48. So over the sheet only `--red`, `--track-line` and `--track-ink-on-paper` may be used for meaningful graphics; yellow/blue/green guides need a dark outline or must not be drawn on the sheet.

**Reading colours on the canvas.** Today `themeColors()` (`domain/canvas.ts`) reads a fixed list of keys once into a module-level cache and has no invalidation. It lacks `--panel2`, `--panel4`, `--line3`, `--red-soft`, `--yellow-soft`, `--green-soft` and the `--track-*` tokens. Recommendation: **extend that list** (reuse, do not duplicate) rather than add `trackColors()`. Invalidation: the console has no theme switch (dark only), so a stale cache cannot occur today; add an explicit `resetThemeColors()` (clears `C`) for tests and for any future theme change. Pitfall: the cache is filled on the first canvas draw, so `track.css` must be loaded eagerly (imported from `main.tsx` with the other styles, not lazily) or the `--track-*` keys would be cached as empty strings and canvas would draw black; a test asserts that every key declared in the list resolves to a non-empty value (parsing `prototype.css` and `track.css` in jsdom, since computed styles are not available there). Translucency: use `ctx.globalAlpha`; glow with `shadowBlur`. No literal `rgba()` in the scene code.

**Guards (Requirement 20.12–20.14).** `tests/unit/track/palette-guard.test.ts` reads the files with Node `fs` and fails when it finds: `#[0-9a-fA-F]{3,8}\b`, `rgb(`, `rgba(`, `hsl(`, `hsla(`, the prototype-only variables (`--bg-2`, `--bg-3`, `--line-2`, `--muted`, `--gold`, `--ok`, `--bad`, `--warn`, `--desk`, `--f-ui`, `--f-num`, `--f-cond`), `IBM Plex` or a font CDN URL, in `src/ui/components/track/**`, `src/ui/pages/TrackTracer.tsx` and `src/ui/styles/track.css`. Whitelist: the three `--track-*` declaration lines in `track.css` and, only if the PO chooses a paper PNG, a named constants block in `exportPng.ts`. A second test collects every `var(--name)` and fails if `name` is not declared in `prototype.css` or `track.css`. Both are plain Vitest tests (no new dependency).

**Visual acceptance checklist for the PO** (Requirement 20.15): side-by-side with Catálogo and Armador; contrast 4.5:1 text / 3:1 graphics; `:focus-visible` outline 2 px `--red` offset 2 px on controls and on the focusable canvas (`tabindex="0"`); hover/pressed/disabled equal to `.sb`, `.seg button`, `.chips button`, `.tabs button`; no horizontal scroll at 360 px; screenshots attached to the PR.

### 3.9 Not adding to the layer debt

| Rule | How |
|---|---|
| `domain/track` has no infrastructure import | own types; ACL does the mapping |
| `ui/components/track` and `TrackTracer.tsx` have no `@/infrastructure` import | everything through hooks in `application/` |
| `ConsoleContext` is not enlarged | separate `TrackEditorProvider`, mounted only inside the tracer page |
| Enforcement | optional `no-restricted-imports` override for `src/domain/track/**` and `src/ui/components/track/**` (task 12.3) |

## Design Decisions

1. **Port the pure core first**; it has the highest value/risk ratio and can be proven against the prototype.
2. **Controller class + thin React wrapper** (not a React-state rewrite of pointer interaction): keeps the
   proven imperative flow, makes it testable with a fake host, and avoids re-render storms.
3. **One history step per gesture**, exactly like `commit`; history is memory-only.
4. **Frontend computes `length_cm`**; backend only validates range (as the analysis states). All lengths are cm end to end (including `length_min`/`length_max`); metres are a display format.
5. **Draft in `localStorage` only** for unsaved work (401 unmounts the whole console); tracks themselves are API-only.
6. **No built-in profile fallback**: avoids the "copy of rules" the PO asked to remove; verification needs the API.
7. **`drawScene` lives in `ui/`**, not `domain/`, to avoid adding more DOM-dependent code to `domain/`
   (existing `domain/canvas.ts` already does; we do not extend that pattern).
8. **Own provider** for editor state instead of ConsoleContext (already ~1,500 lines).
9. **Keyboard shortcuts scoped to the view** (the prototype's global `document` handler would hijack keys in other tabs).
10. **Palette by reuse, not by copy**: `trk-` classes plus existing console classes; `themeColors()` extended instead of a parallel helper; at most three new `--track-*` tokens; no light theme; a Vitest guard makes literal colours and unknown variables fail the build.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Port regressions in drag/group-select/snap/shortcuts (most logic, fewest tests) | Broken editing | Slices, controller tests with a fake host, manual checklist per slice, keep prototype side by side during the port |
| Unit mix: the prototype keeps rule `length_*` in m, but the API/domain use cm | Wrong verification | No conversion in the domain (cm everywhere); metres only formatted in the UI; the prototype golden fixtures are converted ×100 in tests; Open question 8 |
| Profile source mismatch (Perfiles view static vs tracer API) | Confusing UI | Documented (Open question 14); separate story |
| 401 mid-edit loses work | Data loss | Draft (Requirement 11) + dirty warning |
| Two tabs, last-write-wins `PUT` | A save silently overwrites another tab's edits | Documented limit of EN-28 (no `If-Match`); draft keyed per track id; consider showing `updated_at` and re-fetch before saving as a later improvement |
| Pydantic `msg` texts change with the version | Odd Spanish/English mix | Spanish messages keyed by `type`; raw `msg` only as fallback |
| Closed track with < 3 points (reachable only by import) | 422 `track_closed_needs_three_points` | `normalizeTrack` + warning before sending |
| `GET /profiles` lacks `rules.track` or unit differs | Verification off | Graceful "sin reglas de pista" (Req 6.5) |
| Performance with 500 points and 0.5 cm sampling | Slow drag | Analysis on animation frames, spatial hash already in `crossings`/separation; measure with a 500-point fixture |
| Canvas accessibility | Keyboard/screen-reader users | Inspector numeric fields, shortcuts, ARIA on toolbar; canvas itself remains pointer-driven |
| Prototype file is unversioned (`Proyecto_Taller`, a copy in `Downloads`) | Loss of the reference | Store a copy under `velocista-frontend/docs/prototipos/` (analysis recommendation; not done here) |
| Backend contract changes after this spec | Rework | Keep `limits.ts` and the ACL as the only coupling points |
| Prototype v2 files with missing fields | Import failure | Strict validation with specific messages; defaults only where the prototype used them (`start {e:0,t:0.5}`) |

## Testing Strategy

| Level | What | Where |
|---|---|---|
| Domain golden | «Técnica 3 × 2,5» L = 833.448 cm, 12 pts, 8 arcs, 4 corners, 0 gaps, 0 crossings, 0 issues, `sepMin` 30, `edgeMin` 45, `radiusMin` 15, longest straight 130; «Ocho libre» L = 715.617 cm, 5 arcs, 1 corner, 1 gap, 1 crossing, 0 issues, `sepMin` 12.5, `edgeMin` 40, `radiusMin` 30, straight 160; «Ocho» under LGR → `cruce` + `corte`; tolerance ±0.001 cm | `tests/unit/track/geometry.test.ts`, `rules.test.ts` |
| Domain rules | each of 13 rules pass/fail; fit warning and `fixRadii`; templates; transforms; history cap; limits; `fromPrototypeV2` | `tests/unit/track/*.test.ts` |
| SVG | golden snapshot for a small track; XML escaping | `tests/unit/track/svg.test.ts` |
| HTTP | ACL both ways, pagination, 401, export call; **error parsing of both 422 shapes**: a list body with 3 entries (`less_than_equal` with `loc` containing an integer index, `missing`, `extra_forbidden`) → 3 `fields` with paths `points[3].radius`, `board.width_cm`, `pts`; an object body for each reason of Requirement 19.3; unknown `type` falls back to `msg`; non-JSON body | `tests/unit/http-tracks.test.ts`, `tests/unit/api-errors.test.ts` |
| Hooks | editor history/dirty, save/update/delete, draft, profiles | `tests/integration/track-editor.test.tsx` |
| Controller | fake host: click-to-draw, close circuit, drag commit once, Esc, shortcuts only when mounted | `tests/unit/track/controller.test.ts` (jsdom pointer events, canvas stub) |
| View | Rail entry, list/open/save flow, issues, import v2 | `tests/integration/track-tracer.test.tsx` |
| Live (opt-in) | create → list → read → update → export → delete on the deployed API, `RUN_LIVE_QA=1` | `tests/integration/qa-live-tracks.test.tsx` |

The reference values were obtained by running `Track2` unchanged in Node (extracted copy in a scratch directory; the
prototype file was not modified). Re-run the extraction if the prototype changes.

## Relative size (my criterion)

EN-28 is estimated at 1 SP; that is not credible for the frontend alone. The prototype to port is ~1,850 lines
(405 pure + ~1,440 imperative), plus a new HTTP client, an editor state layer with history, 10+ components, five export/import
paths, styles and live tests. Relative to the existing stories (e.g. the Perfiles or Catálogo views, which are
mostly forms and tables), this is several times larger. Rough split (relative, not measured):

| Slice | Relative size |
|---|---|
| S0 domain port + golden tests | M |
| S1 contracts/HTTP/hooks | S–M |
| S2 read-only page + verification + export | M |
| S3 core editing + history + save | **L** |
| S4 zones, templates, transformations, menu | M–L |
| S5 dimensions, simulation, PNG, import | M |
| S6 polish, a11y, live QA | S–M |

Recommendation: split EN-28 into at least **EN-28-BE** (API), **EN-28-FE-1** (S0–S2), **EN-28-FE-2** (S3–S4) and
**EN-28-FE-3** (S5–S6), so each is reviewable and shippable. This is judgment, not a measurement.

## Open points / not verified

- Backend implementation and the final shape of `GET /api/profiles` (`rules.track`, new `lgr2026`/`libre` profiles) — not available to this repo.
- Visual match with the console is a PO validation; not assessable here.
- Whether `Ctrl+S` should override the browser save — prototype does; keep only inside the focused view.
- The exact Pydantic `msg` strings (depend on the installed version); the client does not rely on them.
