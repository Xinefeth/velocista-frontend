# Design Document — Run Control and History

## Introduction

`ConsoleContext` is the single use-case hub: it decides, per command target (real robot, external
simulator, local simulation), which REST call to make, keeps the selected robot/setup/run state and
polls the run history. `Control.tsx` adds the simulator-specific branch (PID-only, setup id on start).
All REST access goes through `infrastructure/http/{api,robot,runs}.ts`. This document describes the
code as it is; it does not change it.

## Goals & Non-Goals

**Goals**

- Document command routing per target, setup persistence and the history lifecycle.
- Document how robots/components/versions are consumed (Builder/Catalog).

**Non-Goals**

- Backend endpoint behaviour, simulator ingestion and run metrics (`j`, `iae`) computation.
- The in-browser simulation internals (`domain/simulator.ts`).
- Realtime state (see `realtime-console`).

## Architecture Overview

```
 ui/pages/Control ──► ConsoleContext (toggleRunning, sendSetup, saveSetup, calibrate,
                       │               prepareExternalRun, setMode, setLine)
                       │
   source = robot ─────┼─► sendRobotCommand ─► api.command("start|stop|setup|calibrate")  POST /devices/robot/commands
                       │                   └► changeModeLine                              POST /robots/{id}/mode-line/{mode|line}
   source = sim (API) ─┼─► prepareExternalRun ─► storeSetup  POST /robots/{id}/setups  → setup_id
                       │     └► api.command("start",{setup_id}, robotId) / ("stop")
   source = sim (fixtures, initialRobots) ─► domain/simulator.ts (local, no REST)

 saveSetup ─► storeSetup ─► (robot) applyStoredSetup  POST /robots/{id}/setups/{sid}/apply

 History:  loadRunHistory() every 5 s ─ GET /runs?limit=200&offset=N ─► toRun ─► Runs page
           annotateRun(id, note)       ─ PATCH /runs/{id}
 Builder:  api.robots.selection() ─ GET /robots + GET /robots/{id}/versions/{vid}
           api.catalog.list()     ─ GET /components
           createRobot / createComponent / saveVersion ─ POST /robots | /components | /robots/{id}/versions
```

## Component Design

### 3.1 REST endpoints used

| Function | Method / path |
|---|---|
| `api.command(type, data, robotId?)` | `POST /devices/robot/commands` `{type, data, robot_id?}` → `{seq}` |
| `storeSetup` | `POST /robots/{id}/setups` → `{id}` |
| `applyStoredSetup` | `POST /robots/{id}/setups/{sid}/apply` → `{seq}` |
| `changeModeLine` | `POST /robots/{id}/mode-line/{mode|line}` → `{seq}` |
| `api.runs.list` | `GET /runs?limit&offset` → `PaginaCorridas` |
| `annotateRun` | `PATCH /runs/{id}` `{note}` |
| `api.robots.{list,getVersion,create,createVersion,selection}` | `/robots`, `/robots/{id}/versions[/{vid}]` |
| `api.catalog.{list,create}` | `/components` |

### 3.2 History pipeline (`http/runs.ts`)

`loadRunHistory(robots)` pages until `records.length >= total` (or an empty page), de-duplicates with a `Map`
by id, sorts by `number`, maps with `toRun`. `ConsoleContext` stores the result in `runsRef`, sets `lastRunRef`
to the last run of the selected robot and bumps a tick to re-render. A `fetching` flag avoids overlapping polls.

### 3.3 Notes

`saveNote` appends to the existing note (`"<old>. <new>"`), calls `PATCH`, and only then mutates the local run.

### 3.4 Control page branches (`ui/pages/Control.tsx`)

`useExternalSim = c.source === "sim" && c.apiMode`. Start → `prepareExternalRun()` then `api.command("start", {setup_id}, c.robot.id)`.
Setup send → PID-only guard, then `api.command("setup", …)` followed by `c.sendSetup()` (local state update).
The page imports `api` and `ErrorApi` directly (deviation from the layer rule; see `architecture`).

### 3.5 Builder / Catalog

`selection()` flattens a robot and its current version into `RobotDef` with one version entry; non-current versions are not listed. `saveVersion` always saves `status: "current"` and triggers a robots reload.

## Design Decisions

1. **Backend ingests simulator runs**: the Consola only reads history; no client-side run creation in production.
2. **Persist setup before start**: ties each run to a reproducible `setup_id`/version.
3. **Poll every 5 s** (not push): simple; history is not sent over the WebSocket.
4. **Notes via PATCH, optimistic only after success**: avoids showing notes that were not saved.
5. **Fixture mode retained** (`initialRobots`) for tests and demos, isolated by `apiMode`.

## Open points / not verified

- Backend validation of `setup_id` on start and semantic of `robot_id` in commands.
- Whether the backend exposes per-lap data (no consumer here).
- Behaviour of history polling while the login form is shown (the console is unmounted, so polling stops).
