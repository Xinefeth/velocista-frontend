# Requirements Document — Authentication and Session

## Introduction

The backend protects its REST API (and the console WebSocket) with a JWT obtained from
`POST /auth/login`; the token lasts 1 hour. The Consola stores the token for the browser session,
sends it as `Authorization: Bearer`, and, when the backend answers 401, drops the token and shows a
login form. This spec documents the real behaviour (verified in `src/infrastructure/config.ts`,
`src/infrastructure/http/api.ts`, `src/ui/components/AuthGate.tsx`, `src/main.tsx` and
`tests/unit/auth*.test.tsx`) and the gaps.

**Discrepancy with the request that ordered this spec:** it states that on a 401 the Consola "does not
redirect to login today". In the code it does: `request()` clears the token and dispatches
`velocista:auth-required`, and `AuthGate` replaces the console with a login form (tested in
`auth.test.tsx` and `auth-integration.test.tsx`). There is no router, so it is a form swap, not a URL
redirect. What is really missing is listed as pending below (logout, proactive expiry, expiry on the
WebSocket, retry of the failed action after login, user-facing "session expired" message).

## Glossary

- **JWT / token de acceso**: Token devuelto por `/auth/login` (`access_token`); válido 1 h (dato del backend, no verificable desde este repo).
- **AuthGate**: Componente que envuelve la consola y muestra el formulario de login cuando se pide.
- **AUTH_EVENT**: Evento `velocista:auth-required` que avisa que hace falta iniciar sesión.
- **sessionStorage**: Almacén del navegador que se borra al cerrar la pestaña; clave `velocista.access-token`.
- **ErrorApi**: Error normalizado de la capa REST (`status`, `reason`, `detail`).

## Requirements

### Requirement 1: Log in

**User Story:** As a pilot, I want to sign in with my username and password.

#### Acceptance Criteria

1. WHEN the pilot submits the login form, THE Consola SHALL call `POST /auth/login` with `{username, password}` and, on success, store `access_token` and hide the form.
2. WHILE the login request is in flight, THE form SHALL disable the button and show "Conectando…".
3. IF the login fails for any reason, THEN THE form SHALL show "No se pudo iniciar sesión. Revisa tus credenciales y la conexión." and keep the form visible (it does not distinguish bad credentials from network failure).
4. WHEN login succeeds, THE form SHALL clear the password field.
5. IF `/auth/login` itself answers 401, THEN THE Consola SHALL NOT dispatch `AUTH_EVENT` again (no loop).

### Requirement 2: Token storage and use

**User Story:** As a pilot, I want my session to last while I use the console but not persist forever.

#### Acceptance Criteria

1. THE Consola SHALL keep the token in `sessionStorage` (key `velocista.access-token`), so it disappears when the tab closes.
2. WHEN a token exists, THE REST adapter SHALL send `Authorization: Bearer <token>` on every request.
3. WHEN the token is absent, THE REST adapter SHALL send no `Authorization` header.
4. THE Consola SHALL NOT store the token in `localStorage`, cookies or in the build (verified).
5. WHEN the WebSocket connects, THE Consola SHALL currently append the token as `?token=` (to be replaced; see `realtime-console` Requirement 7).

### Requirement 3: Behaviour on 401 / expiry

**User Story:** As a pilot, I want to be asked to sign in again when my session expires.

#### Acceptance Criteria

1. WHEN any REST response other than from `/auth/login` has status 401, THE REST adapter SHALL clear the stored token, dispatch `AUTH_EVENT` and still reject the call with the `ErrorApi`.
2. WHEN `AUTH_EVENT` is received, THE `AuthGate` SHALL unmount the console and render the login form.
3. WHILE the console is mounted, THE periodic `GET /health` (every 5 s) SHALL detect an expired token within about 5 s and trigger the login form.
4. WHEN login succeeds after an expiry, THE `AuthGate` SHALL remount the console (providers reload robots, runs and reconnect the WebSocket with the new token); in-memory UI state is lost.
5. THE Consola SHOULD show an explicit "tu sesión expiró" message when the form appears because of a 401 (NOT implemented: the form is identical to a first-time login).
6. THE Consola SHOULD retry or let the pilot repeat the action that got the 401 (NOT implemented: that request fails with the `ErrorApi`).
7. WHEN the WebSocket is rejected for an expired token, THE Consola SHOULD also request login (NOT implemented; see `realtime-console` Requirement 8).

### Requirement 4: Initial state without a session

**User Story:** As a pilot, I want to be asked to sign in when I open the console without a session.

#### Acceptance Criteria

1. WHEN the app starts, THE `AuthGate` SHALL render the console (not the form) and only show the form after the first 401; there is no up-front token check.
2. IF the backend requires authentication, THEN THE first protected request SHALL return 401 and the form SHALL appear (works through `/health` and robot loading).
3. THE Consola SHOULD show the login form up front when no token exists and the backend requires auth (NOT implemented: a brief flash of the console is possible).

### Requirement 5 (PENDING): Logout and proactive expiry

**User Story:** As a pilot, I want to sign out and to be warned before the 1 h token ends.

#### Acceptance Criteria

1. THE Consola SHALL provide a "Cerrar sesión" control that clears the token and shows the login form — NOT implemented (no logout code in `src/`).
2. THE Consola SHOULD decode the JWT `exp` claim and warn or re-authenticate before expiry — NOT implemented (the token is opaque to the client).
3. THE Consola SHOULD NOT depend on a refresh token (the backend offers none; not verified).

### Requirement 6: Secrets

**User Story:** As an operator, I want no credentials in the bundle.

#### Acceptance Criteria

1. THE Consola SHALL contain no username, password or token in source, `.env.example` or the build; the password input is cleared after submit.
2. THE login form SHALL use `autoComplete="username"` and `"current-password"`.
3. THE Consola SHALL NOT log the token (no `console.*` of it found in `src/`).
