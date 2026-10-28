# Requirements Document — Realtime Console (WebSocket, robot/simulator status, sensor strip)

## Introduction

The Consola listens to the backend over a single WebSocket, `/ws/console`. The API forwards robot
messages (`sender: "robot"`: `manifest`, `status`, `signals`), its own messages (`sender: "api"`:
`hello`, `link`) and the external simulator's messages (`sender: "sim"`: `connection`, `telemetry`,
`config`, `event`). The Consola derives from that stream the robot link/status (HU-14), the
simulator status and the line-sensor strip "Regleta" (HU-15). This spec documents the real client
(`realtime/ws.ts`, `useRealtime`, `ConnectionContext`, `useRobotConnection`, `ConsoleContext`) and adds
pending requirements: authenticate the socket with a first `auth` message instead of `?token=` and
reconnect after a 1008 close. The Consola never sends data over this socket (listen-only); commands go
through REST.

Facts verified by reading `src/infrastructure/realtime/ws.ts`, `src/infrastructure/config.ts`,
`src/application/**`, `src/domain/{robotStatus,simulatorStatus,strip}.ts`, `src/ui/components/Strip.tsx`,
`src/ui/pages/Control.tsx` and the tests listed in each task. Server-side behaviour (close codes,
`auth` message) was NOT verified here: it is a backend proposal.

## Glossary

- **Consola**: SPA del piloto.
- **`/ws/console`**: Endpoint WebSocket de la API que difunde mensajes a la consola.
- **MensajeConsola**: Sobre `{sender, type, data, received_ms}` (`infrastructure/contracts/messages.ts`).
- **Buffer de mensajes**: Últimos `MAX_MESSAGES` = 50 mensajes, el más nuevo primero (`useRealtime`).
- **robotStatus**: Estado derivado del robot (`connected`, `state`, `battery`, `rssiDbm`, `loopHz`).
- **simulatorStatus**: Estado derivado del simulador externo (`available`, `state`, `connected`, `running`, `sessionId`, `activeRunId`, `telemetry`, `config`).
- **Regleta (Strip)**: 16 canales (2 × QTR-8A) del canal `regleta` del mensaje `signals`.
- **Código 1008**: Cierre WebSocket "policy violation"; el backend lo propone para token inválido/expirado.
- **JWT**: Token de sesión (dura 1 h); hoy viaja como `?token=` en la URL.

## Requirements

### Requirement 1: Console WebSocket connection

**User Story:** As a pilot, I want the console to stay connected to the backend, so that I see live data.

#### Acceptance Criteria

1. WHEN the Consola mounts under `ConnectionProvider`, THE realtime client SHALL open one WebSocket to the URL built by `socketUrl()` (derived from `VITE_API_BASE_URL`, or `VITE_WS_URL` when set, `wss://` over HTTPS).
2. WHEN a message arrives, THE client SHALL parse it as JSON and deliver it to `onMessage`; IF the payload is not valid JSON, THEN THE client SHALL ignore it silently.
3. WHEN the socket opens, THE client SHALL report `connected = true`; WHEN it closes, THE client SHALL report `connected = false`.
4. THE `useRealtime` hook SHALL keep at most `MAX_MESSAGES` = 50 messages, newest first.
5. THE Consola SHALL NOT send application messages over `/ws/console` (listen-only).

### Requirement 2: Reconnection

**User Story:** As a pilot, I want the console to reconnect by itself after a drop.

#### Acceptance Criteria

1. WHILE the subscription is not closed, WHEN the socket closes for any reason, THE client SHALL retry the connection after `RETRY_MS` = 3000 ms.
2. WHEN the subscription is closed (component unmount), THE client SHALL cancel the retry timer and close the socket.
3. THE client SHOULD back off exponentially instead of a fixed 3 s retry (NOT implemented; fixed interval today).
4. IF the connection was never established, THEN THE `tiempoReal` state SHALL be `checking` until the first open/close event, `ok` when open, `down` when closed.

### Requirement 3: Connection health in the UI

**User Story:** As a pilot, I want to see whether API, database and real time are up.

#### Acceptance Criteria

1. THE `useHealth` hook SHALL call `GET /health` on mount and every `HEALTH_INTERVAL_MS` = 5000 ms and expose `status` `checking | ok | down`.
2. THE `ConnectionContext` SHALL expose `salud`, `api`, `baseDeDatos` (`ok` only when `health.database === "ok"`), `tiempoReal` and `mensajes`.
3. WHEN the health call fails, THE `api` and `baseDeDatos` states SHALL be `down`.

### Requirement 4: Robot status (HU-14)

**User Story:** As a pilot, I want to see the live state of the velocista.

#### Acceptance Criteria

1. WHEN a `sender: "robot"`, `type: "status"` message arrives, THE Consola SHALL derive `state`, `loopHz`, `rssiDbm` and `battery` (channel `bateria_v`); non-numeric values SHALL become `null`.
2. WHEN a `link` message for `device: "robot"` or a `hello` message with `devices.robot` arrives, THE Consola SHALL set `connected` accordingly; IF neither arrived but a `status` did, THEN `connected` SHALL be true.
3. WHEN the robot link drops (`link` with `connected: false`), THE `useRobotConnection` hook SHALL clear the manifest and the status.
4. WHEN a `manifest` message arrives, THE hook SHALL keep it even after it leaves the 50-message buffer.
5. WHILE the robot is not linked or `tiempoReal` is not `ok`, THE Consola SHALL NOT send commands to it and SHALL show "El robot seleccionado no está conectado a la API." (also when the manifest id differs from the selected robot).
6. WHEN the status has `state` and the robot is linked, THE `Strip` header SHALL show the robot's battery, link and loop frequency; otherwise it SHALL fall back to the local simulation values.

### Requirement 5: Simulator status

**User Story:** As a pilot, I want to see the state of the external simulator.

#### Acceptance Criteria

1. WHEN `sender: "sim"` messages exist, THE Consola SHALL derive `available = true`, the `state` from the latest `connection` snapshot (`unknown` otherwise), the latest `telemetry` and `config`.
2. WHEN a `run_started` event arrives, THE Consola SHALL set `running = true`; WHEN `run_finished`, `false`; otherwise it SHALL use `telemetry.running`, then `active_run_id !== null`.
3. THE simulator SHALL count as `connected` only if the latest `connection` state is `ready` or telemetry is newer than the last non-ready `connection` frame (by `received_ms`).
4. WHILE no simulator message has arrived, THE `App` SHALL show "Esperando el estado del simulador externo desde el backend…".
5. WHEN the source is the external simulator, THE Consola SHALL require both `simulator.connected` and `tiempoReal === "ok"` before enabling start/stop/setup.

### Requirement 6: Sensor strip (HU-15)

**User Story:** As a pilot, I want to see the 16 line-sensor readings and where the line is.

#### Acceptance Criteria

1. WHEN a `sender: "robot"`, `type: "signals"` message carries `channels.regleta` with exactly 16 finite numbers, THE Consola SHALL normalise each reading by `STRIP_FULL_SCALE` = 1000 and clamp it to 0..1.
2. IF the channel is missing, has a different length or contains non-numeric values, THEN THE Consola SHALL return no strip (null) and show "Esperando lecturas de sensores del backend." in API mode.
3. THE Consola SHALL mark a bar active at ≥ `ACTIVE_THRESHOLD` = 0.5 and the line as lost when no bar reaches `LOST_THRESHOLD` = 0.15.
4. WHEN the line is not lost, THE Consola SHALL compute the position as the weighted centroid mapped to −1..1 and in mm (± `STRIP_HALF_MM` = 72), and tag it "Centrada" when |position| < `CENTERED_NORM` = 0.25.
5. WHILE the source is the external simulator, THE Control page SHALL build the strip from simulator telemetry with the same thresholds (duplicated inline in `Control.tsx`).

### Requirement 7 (PENDING): Authenticate the socket without putting the JWT in the URL

**User Story:** As an operator, I want the JWT out of the WebSocket URL, so that it does not end up in Render/proxy logs.

#### Acceptance Criteria

1. WHEN the socket opens and a session token exists, THE client SHALL send as the first message `{"type":"auth","token":"<JWT>"}` — NOT implemented. Today `socketUrl()` and `listenConsole()` add `?token=<JWT>` (verified; tested as the current behaviour in `tests/unit/auth.test.tsx` and `tests/unit/auth-integration.test.tsx`).
2. THE client SHALL NOT append `token` to the URL query once Criterion 1 is implemented — NOT implemented.
3. WHILE the backend does not accept the `auth` message, THE client MAY keep `?token=` for compatibility (server support unverified; the backend "proposes" the change).
4. THE tests for the WebSocket URL SHALL be updated to assert no `token` query parameter and that the first sent frame is the `auth` message — NOT done.

### Requirement 8 (PENDING): Reconnect and re-login after close code 1008

**User Story:** As a pilot, I want an expired session on the socket to lead me back to login and live data to resume.

#### Acceptance Criteria

1. WHEN the socket closes with code 1008, THE client SHALL stop blind retries with the stale token and dispatch the authentication-required event (`AUTH_EVENT`) — NOT implemented. Today `onclose` ignores the code and retries every 3 s with the same token.
2. WHEN the user logs in again, THE client SHALL reconnect with the new token — works today by re-mounting `ConnectionProvider` under `AuthGate` after login (unverified end to end).
3. IF the backend rejects the socket while the token is expired, THEN THE Consola SHALL NOT loop forever against the server — NOT implemented.
