# EPIC-01 — Telegram Mini App and Authentication

## Implemented scope

EPIC-01 adds the Telegram Mini App bridge, a `/api/me`-first web bootstrap, verified Telegram authentication, explicitly enabled non-production development authentication, internal users, and revocable server-side sessions. The authenticated screen is intentionally only a bootstrap proof, not the final product UI.

Supported Telegram entry points are a Main Mini App or any other launch surface that supplies non-empty signed `Telegram.WebApp.initData` containing a `user`. Keyboard-button and other contexts without signed user init data are not authentication entry points in this epic. They receive the same generic invalid-authentication outcome; the client never falls back to `initDataUnsafe` or client-supplied identity.

The ordinary browser remains supported through the server-advertised development-user chooser when development authentication is explicitly enabled.

## Authentication flow

Every client begins with `GET /api/me`, using the existing cookie:

1. A `200` response authenticates the existing session without another login.
2. After `401`, a Telegram client posts only `{ "initData": "..." }` to `POST /api/auth/telegram`.
3. After `401` outside Telegram, the client requests `GET /api/auth/dev`. If enabled, it displays the server-configured users and posts only `{ "devUserKey": "..." }` to `POST /api/auth/dev`.
4. If neither signed Telegram data nor development authentication is available, authentication stops with a generic error.

All browser requests use relative `/api` URLs and `credentials: include`.

## Telegram verification and identity

The server rejects empty or oversized init data, invalid percent encoding, every duplicate query key, and missing `hash`, `auth_date`, or `user`. It builds the data-check-string from every percent-decoded key/value except `hash`, sorted by key and joined with newlines. A Telegram `signature` field remains in that string.

Verification derives the secret as HMAC-SHA-256 with key `WebAppData` and message `TELEGRAM_BOT_TOKEN`, then computes HMAC-SHA-256 over the data-check-string. The supplied hash must be exactly 64 lowercase hexadecimal characters and is compared as equal-length digest bytes with a constant-time comparison. The default freshness window rejects data older than 300 seconds or more than 30 seconds in the future; both bounds are configurable.

Only after HMAC and freshness verification does the server parse the signed `user`. The Telegram ID must be a positive JavaScript safe integer. The parser consumes only `id`, `first_name`, `last_name`, `username`, `language_code`, and `photo_url`; documented and unknown future signed properties are accepted and stripped. This forward compatibility applies only inside the verified signed object. HTTP authentication request bodies are strict and reject extra identity fields.

`User.id` is the sole internal application identity. Telegram IDs are unique external `BigInt` identifiers and development keys are separate unique external identifiers. Telegram and development identities are not automatically merged. A Telegram profile upsert may refresh allowed fields while preserving `User.id`.

## Sessions and HTTP security

Login creates an opaque, unpadded base64url token with at least 256 bits of randomness. PostgreSQL stores only its unique SHA-256 hash. The raw token is returned once as an `HttpOnly`, host-only cookie with `Path=/`, `SameSite=Lax`, a bounded `Max-Age`, and no `Domain` attribute. Production uses `__Host-zamanushka-session` with `Secure`; development and test use `zamanushka-session` without `Secure` for loopback HTTP.

A valid current cookie presented during login is atomically replaced: the current session is row-locked and revoked while one successor is created. Concurrent attempts using the same old cookie allow only one successor; losing requests return `409 AUTH_SESSION_REPLACED` without changing the winning cookie. Other cookie jars remain independent. Logout revokes only the current session and clears the cookie using the same scope attributes. Unknown, expired, and revoked tokens all return `401 AUTH_REQUIRED`.

Authentication POSTs require `application/json` and an exact configured `Origin`. Missing, malformed, `null`, wildcard, or unlisted origins are rejected. Production origins must be canonical HTTPS origins; development and test origins must be explicit loopback HTTP origins. Authentication bodies, cookies, authorization headers, raw init data, raw tokens, bot tokens, and request bodies are not logged.

Every authentication response, including errors, capability discovery, and `/api/me`, sends `Cache-Control: no-store`.

## HTTP endpoints

| Method | Path                 | Availability          | Purpose                                                        |
| ------ | -------------------- | --------------------- | -------------------------------------------------------------- |
| `GET`  | `/api/me`            | Always                | Resolve the public user solely from the session cookie         |
| `GET`  | `/api/auth/dev`      | Always                | Return the safe development-auth capability and chooser labels |
| `POST` | `/api/auth/dev`      | Development mode only | Authenticate one server-allowlisted development user           |
| `POST` | `/api/auth/telegram` | Telegram mode only    | Verify raw Telegram init data and create or replace a session  |
| `POST` | `/api/auth/logout`   | Always                | Revoke the current session and clear its cookie                |
| `GET`  | `/health`            | Always                | Dependency-free process liveness                               |
| `GET`  | `/ready`             | Always                | PostgreSQL/Redis dependency readiness                          |

The two login POST routes are mutually exclusive for a running configuration. `GET /api/auth/dev` returns `{ "enabled": false, "users": [] }` when development authentication is unavailable.

## Configuration matrix

| `NODE_ENV`    | `DEV_AUTH_ENABLED` | Mode             | Required auth configuration                                     |
| ------------- | ------------------ | ---------------- | --------------------------------------------------------------- |
| `production`  | omitted or `false` | Telegram         | bot token, canonical HTTPS origins, secure `__Host-` cookie     |
| `production`  | `true`             | Startup rejected | development bypass is forbidden                                 |
| `development` | `true`             | Development-only | at least two allowlisted users and explicit loopback origins    |
| `development` | `false`            | Telegram         | bot token and explicit loopback origins                         |
| `test`        | `true`             | Development-only | explicit allowlisted users and origins; non-secure local cookie |
| `test`        | `false`            | Telegram         | explicit bot token and origins; non-secure local cookie         |

Outside production, `DEV_AUTH_ENABLED` must be explicitly set. Test configuration never inherits an auth mode implicitly.

## Definition of Done and boundary

- Strict shared contracts, configuration validation, Telegram verification, persistence, routes, adapter, safe-area projection, `/api/me`-first bootstrap, and browser fallback are implemented and tested.
- PostgreSQL remains authoritative; Redis is not used for session truth.
- `/health` remains dependency-free and `/ready` remains dependency-aware.
- `/references` remains the canonical visual source and must be preserved byte-for-byte.
- Formatting, lint, type checking, unit tests, guarded PostgreSQL integration tests, builds, Prisma validation/generation, later smoke coverage, and four required viewport captures form the EPIC-01 completion gate.
- Game rules, rooms, matchmaking, realtime, chat, profiles, ratings, history, boards, board skins, and the final visual system remain out of scope.

Stop after EPIC-01 verification. EPIC-02 requires separate explicit approval.
