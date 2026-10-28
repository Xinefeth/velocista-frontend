# Design Document — Authentication and Session

## Introduction

Authentication is a thin client-side layer: a token store (`config.ts`), an interceptor inside the
REST adapter (`request()`), and a gate component (`AuthGate`) wired through a DOM event. There is no
router, no refresh flow and no client-side token parsing. Providers are mounted *inside* the gate so
that showing the login form unmounts the whole console and, after login, remounts it fresh.

## Goals & Non-Goals

**Goals**

- Document the login flow, token storage, 401 handling and the session lifecycle as built.
- Specify pending improvements (logout, expiry UX, WebSocket expiry).

**Non-Goals**

- Backend auth (hashing, JWT signing, 1 h TTL): backend repo.
- Roles/permissions, refresh tokens, SSO.
- Changing code (documentation only).

## Architecture Overview

```
 main.tsx
 └─ AuthGate  (listens to window "velocista:auth-required")
     ├─ required=false → children: ConnectionProvider → ConsoleProvider → App
     └─ required=true  → login form  ──► api.login() ──► POST /auth/login
                                              │ access_token
                                              ▼
                              setAccessToken() → sessionStorage["velocista.access-token"]
                              required=false → console remounts (new REST + WS with token)

 request()  (infrastructure/http/api.ts)
   token? → Authorization: Bearer …
   status 401 && path != /auth/login → setAccessToken(null); dispatch AUTH_EVENT; throw ErrorApi
```

Expiry timeline (token TTL 1 h per the backend, not verifiable here):

```
t=0 login ──────────── t=60 min token expires
                        next REST call (≤ 5 s via /health poll) → 401 → form
                        WebSocket: no signal today (retries every 3 s with stale ?token=)
```

## Component Design

### 3.1 Token store (`infrastructure/config.ts`)

`accessToken()`, `setAccessToken(token|null)` over `sessionStorage`; `AUTH_EVENT = "velocista:auth-required"`.
`socketUrl()` appends `?token=` (replaced when the `realtime-console` pending work lands).

### 3.2 REST interceptor (`infrastructure/http/api.ts`)

Part of `request()`: Bearer header, 401 handling, then `toApiError` for non-2xx. `api.login` is the
only unauthenticated call that is excluded from the 401 loop guard (`path !== "/auth/login"`).

### 3.3 `AuthGate` (`ui/components/AuthGate.tsx`)

Local state: `required`, `username`, `password`, `error`, `busy`. Fixed error text for any failure.
Layout: centred `<main>` with username/password inputs and an "Entrar" button.

### 3.4 Tests

`tests/unit/auth.test.tsx` (4) and `tests/unit/auth-integration.test.tsx` (5): Bearer header, 401 clears the
token and fires the event exactly once, form appears on the event, login restores the console, WS URL carries the token.

### 3.5 Pending design

- `logout()` in `config.ts` + a button in `Rail`/`System` page that calls `setAccessToken(null)` and dispatches `AUTH_EVENT`.
- Distinguish reasons in `AuthGate` (`"expired"` vs `"first"`) via `CustomEvent.detail`, to show a session-expired notice.
- WebSocket expiry: handled by 1008 in `ws.ts` (see `realtime-console`).
- Optional `exp` decode for a countdown/warning (token is a JWT; only base64 decoding, no secret needed).

## Design Decisions

1. **sessionStorage, not localStorage**: reduces exposure; the cost is re-login per tab.
2. **Event-based gate**: the REST adapter (infrastructure) cannot import UI or application; a DOM event keeps the dependency rule intact.
3. **Remount on login** instead of retrying requests: simplest way to reload all data with the new token; loses unsaved UI state.
4. **No distinction in login errors**: avoids leaking whether a username exists, but hides network failures from the user.

## Open points / not verified

- The 1 h TTL and the `/auth/login` response shape come from the request/backend, not from this repo's code (only `access_token` is read).
- Whether the deployed backend requires auth for every endpoint (e.g. `/health`) is not verifiable here.
