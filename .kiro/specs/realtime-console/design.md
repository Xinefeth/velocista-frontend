# Design Document — Realtime Console

## Introduction

One WebSocket (`/ws/console`) feeds a 50-message ring buffer in `ConnectionContext`. Pure functions in
`domain/` turn the buffer into robot status, simulator status and the strip view; React components read
those derived values. The socket is listen-only; commands are REST calls (see the
`run-control-and-history` spec). This document describes the code as it is and the two pending
security/robustness changes (auth first message, 1008 handling).

## Goals & Non-Goals

**Goals**

- Document the client, reconnection, derived states and the strip maths.
- Specify the pending first-message authentication and 1008 handling.

**Non-Goals**

- Server-side WebSocket behaviour (`/ws/console`, `/ws/robot`, simulator ingestion): backend repo.
- Sending commands over the socket.
- Changing code (documentation only).

## Architecture Overview

```
 Backend /ws/console ──► realtime/ws.ts  listenConsole(onMessage, onStatusChange)
                              │  retry every 3000 ms while not closed
                              ▼
                  application/hooks/useRealtime.ts   (≤ 50 msgs, newest first, connected: null|bool)
                              ▼
                  application/state/ConnectionContext  { api, baseDeDatos, tiempoReal, mensajes }
                     ▲ useHealth (GET /health every 5 s)
          ┌───────────┼──────────────────────────┐
          ▼           ▼                          ▼
 useRobotConnection  domain/robotStatus.ts   domain/simulatorStatus.ts   domain/strip.ts
 (manifest/status    (battery, rssi, loop,   (available, state,           (16 bars, centroid,
  snapshots kept)     state, connected)       running, telemetry)          lost/centered)
          ▼                  ▼                       ▼                        ▼
   ConsoleContext        ui/components/Strip   App.tsx simline        ui/pages/Control (Regleta)
```

## Component Design

### 3.1 Wire envelope

`MensajeConsola { sender: "robot"|"timer"|"api"|"sim"; type: string; data: object; received_ms: number }`.

| sender | type | Used for |
|---|---|---|
| `api` | `hello`, `link` | robot `connected` |
| `robot` | `manifest` | panels / robot identity |
| `robot` | `status` | `state`, `loop_hz`, `rssi_dbm`, `channels.bateria_v` |
| `robot` | `signals` | `channels.regleta` (16 readings) |
| `sim` | `connection`, `telemetry`, `config`, `event` | simulator status |

### 3.2 Client (`realtime/ws.ts`)

`listenConsole()` creates `new WebSocket(url)` where `url = socketUrl(window.location)` plus `?token=` (set
twice: once inside `socketUrl()` and again in `ws.ts`; idempotent because `searchParams.set` overwrites).
`onclose` → `onStatusChange(false)` and, if not closed, `setTimeout(connect, RETRY_MS)`. `close()` sets
`closed`, clears the timer and closes the socket. Parse errors are swallowed.

### 3.3 Derived states

- `robotStatusFromMessages` scans newest→oldest; takes the first `status`, the first `link`/`hello`; default `connected = state !== null`.
- `useRobotConnection` walks the buffer oldest→newest with a `WeakSet` of seen messages, so manifest/status survive buffer eviction; a `link` with `connected:false` clears both.
- `simulatorFromMessages` implements the rules of Requirement 5 (connection freshness by `received_ms`).
- `stripFromSignals` implements Requirement 6; `Control.tsx` repeats the same maths inline for simulator telemetry (duplicated constants 0.25 and 72).

### 3.4 Pending: first-message authentication

Target flow:

```
client                         server
  │ open  wss://…/ws/console     │        (no ?token=)
  │ ───────────────────────────► │
  │ {"type":"auth","token":JWT}  │  first frame
  │ ───────────────────────────► │  valid → stream starts
  │                              │  invalid/expired → close(1008)
  │ ◄─ close 1008 ────────────── │
  │ dispatch AUTH_EVENT → login → reconnect with new JWT
```

Impact: `socketUrl()` must stop adding `token`; `listenConsole()` sends the frame in `onopen`;
`onStatusChange(true)` should wait for the server acceptance (message or first frame) to avoid showing
"connected" with a rejected token. The tests `auth.test.tsx` / `auth-integration.test.tsx` assert the
current `?token=` behaviour and must change with it. Motivation: the token currently appears in the
request URL and therefore in Render logs.

## Design Decisions

1. **Ring buffer in React state** keeps the UI simple; derived values are pure and testable.
2. **Fixed 3 s retry**: simple; no jitter/backoff (pending improvement).
3. **Listen-only socket**: commands go through authenticated REST so the API validates and acknowledges them.
4. **Fallback to simulation** in `Strip` when no real robot: existing behaviour of the prototype.
5. **Compatibility window** for auth: the Consola can keep `?token=` until the backend supports the `auth` frame (not verified).

## Open points / not verified

- Whether the backend already implements the `auth` frame and 1008 (message says it "proposes" it).
- End-to-end re-login with a live expired socket (no test).
- `ws.ts` reconnection has no automated test.
