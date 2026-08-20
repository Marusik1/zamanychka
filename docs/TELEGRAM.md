# Telegram Mini App

## Supported launch surfaces

Zamanushka authenticates Telegram launches only when the official bridge exposes non-empty signed `Telegram.WebApp.initData` containing a `user`. Configure production as a Main Mini App or another launch surface with signed user init data. Launch contexts without that data, including keyboard-button contexts that omit a signed user, are not authentication entry points for EPIC-01.

The web document loads Telegram's official bridge before the application module. A narrow adapter calls `WebApp.ready()` once, forwards only raw `initData`, tracks viewport and safe-area lifecycle events, and projects safe-area values into app-owned CSS variables. When the bridge is absent, ordinary-browser operation remains available through explicitly enabled development authentication.

Never use `initDataUnsafe` as identity and never send a Telegram ID, username, name, language, or photo URL as an authoritative client field.

## `/api/me`-first bootstrap

The client always calls `GET /api/me` before considering a new login. A valid cookie returns the public internal user and prevents routine re-authentication. After `401`:

- Telegram with usable raw init data calls `POST /api/auth/telegram`.
- An ordinary browser calls `GET /api/auth/dev`; when enabled, it shows the server-provided chooser and calls `POST /api/auth/dev` with one allowlisted key.
- A browser without enabled development auth is told to open the application inside a supported Telegram launch surface.

All requests use same-origin relative URLs and include credentials.

## Server verification

`POST /api/auth/telegram` accepts exactly `{ "initData": "..." }`. The server:

1. Enforces the configured UTF-8 byte limit and strict query parsing, rejecting all duplicate keys.
2. Requires one `hash`, `auth_date`, and `user`.
3. Percent-decodes each key/value, sorts every pair except `hash`, and joins them as `key=value` lines. `signature`, if supplied, stays in the data-check-string.
4. Derives `secret = HMAC_SHA256(key="WebAppData", message=bot_token)` and verifies `HMAC_SHA256(secret, data_check_string)` against an exact lowercase 64-hex `hash` with a constant-time comparison.
5. Rejects `auth_date` outside the configured age and future-skew window (defaults: 300 seconds old, 30 seconds future).
6. Parses the signed user only after verification.

The signed user must have a positive safe-integer ID. The application extracts only `id`, `first_name`, `last_name`, `username`, `language_code`, and `photo_url`. Extra documented and unknown future fields are stripped rather than breaking authentication. The outer HTTP schema remains strict.

All failures use the generic `TELEGRAM_AUTH_INVALID` response. Raw init data, calculated signatures, session tokens, cookies, and bot tokens must never enter logs, persistence, fixtures, screenshots, or commits.

## Internal identity and sessions

Telegram's ID is stored as a unique external `BigInt`; it is never the application primary key. Authorization uses the generated internal `User.id`. Telegram profile refreshes preserve that ID. Development users have a unique server-configured `devUserKey` and are not automatically merged with Telegram users.

Sessions use an opaque, unpadded base64url token backed by at least 256 random bits. Only its SHA-256 hash is persisted. A login with a valid current cookie atomically revokes and replaces that session; it does not revoke sessions in other cookie jars. Concurrent replacement of one old cookie yields exactly one successor and `409 AUTH_SESSION_REPLACED` for losers. Logout revokes only the current session. Expired, revoked, unknown, and absent sessions all produce `401 AUTH_REQUIRED`.

Production uses a host-only `__Host-zamanushka-session` cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`, and a configurable lifetime (default 30 days). Development/test use the host-only `zamanushka-session` cookie without `Secure` for loopback HTTP. Cookie clearing repeats the same scope.

## Routes and request guards

| Method | Route                | Notes                                    |
| ------ | -------------------- | ---------------------------------------- |
| `GET`  | `/api/me`            | Cookie-only identity lookup              |
| `GET`  | `/api/auth/dev`      | Always available capability discovery    |
| `POST` | `/api/auth/dev`      | Registered only in development-auth mode |
| `POST` | `/api/auth/telegram` | Registered only in Telegram mode         |
| `POST` | `/api/auth/logout`   | Revokes the current cookie's session     |

POST requests require JSON and an exact allowlisted `Origin`. All auth routes and errors return `Cache-Control: no-store`. `/health` is dependency-free liveness; `/ready` checks PostgreSQL and Redis.

## Runtime modes

Production always uses Telegram authentication, requires `TELEGRAM_BOT_TOKEN`, requires canonical HTTPS `APP_ORIGINS`, uses the secure `__Host-` cookie, and rejects `DEV_AUTH_ENABLED=true` at startup.

Development and test require an explicit `DEV_AUTH_ENABLED` value:

- `true`: development-only mode; requires `DEV_AUTH_USERS_JSON` with 2–16 distinct allowlisted users. The Telegram POST route is absent.
- `false`: Telegram mode; requires `TELEGRAM_BOT_TOKEN`. The development POST route is absent.

Both non-production modes require explicit canonical loopback HTTP origins. Tests must also provide their mode and origins explicitly.

## Scope boundary

EPIC-01 supplies only the auth bootstrap shell and safe-area plumbing. Telegram theme composition and the final design system begin no earlier than EPIC-02. Preserve `/references` byte-for-byte, and do not begin EPIC-02 without separate approval.
