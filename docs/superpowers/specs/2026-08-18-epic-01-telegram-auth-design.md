# EPIC-01 — Telegram Mini App Bootstrap and Authentication Design

## Status and boundary

This document defines EPIC-01 only. It adds Telegram Mini App bootstrap, verified Telegram authentication, development authentication, application sessions, and `GET /api/me` to the EPIC-00 foundation.

It does not add game rules, rooms, matchmaking, Socket.IO gameplay, chat, a profile section, rating, history, a board, board skins, or the final visual system. EPIC-02 must not start as part of this work.

## Decisions

- Application sessions are server-side and revocable.
- The browser receives a cryptographically random opaque token in an `HttpOnly` cookie. PostgreSQL stores only its SHA-256 hash.
- Production uses a same-site web/API deployment through a reverse proxy. Wildcard credentialed CORS is forbidden.
- `User.id` is the internal primary key. Telegram IDs are unique external identifiers and never primary keys.
- Only raw `Telegram.WebApp.initData` crosses the client-to-server authentication boundary.
- `initDataUnsafe`, client-supplied Telegram IDs, usernames, names, and photo URLs are never authoritative identity inputs.
- Development authentication is a separate, explicitly enabled server capability and cannot be enabled in production.

## Components

### Web Telegram adapter

`apps/web` exposes a small adapter around `window.Telegram.WebApp` rather than importing Telegram globals throughout React components. The adapter:

- detects whether the official Telegram bridge and non-empty raw `initData` are available;
- calls `WebApp.ready()` once after the application shell can render;
- reads the raw `initData` string without parsing identity on the client;
- subscribes and unsubscribes to `viewportChanged`, `safeAreaChanged`, and `contentSafeAreaChanged` when supported;
- projects viewport and safe-area values into application-owned CSS custom properties with browser fallbacks;
- leaves ordinary browser operation available when Telegram is absent.

The official Telegram bridge is loaded by the web entry document. The adapter remains narrow enough to unit-test with a fake bridge. Telegram theme and final UI composition remain EPIC-02 scope.

### Web authentication bootstrap

The authentication shell has explicit states:

```text
BOOTSTRAPPING
  -> AUTHENTICATING
  -> AUTHENTICATED
  -> DEV_AUTH_REQUIRED
  -> ERROR
```

In Telegram, the web client submits `{ initData }` to `POST /api/auth/telegram`. In an ordinary browser, it queries the server-visible development-auth capability. When development authentication is explicitly enabled, a minimal functional chooser permits selecting one of at least two server-configured development users. There is no silent browser bypass and no arbitrary identity editor.

The web shell renders only enough authenticated state to prove the bootstrap and `/api/me` flow. It is not a profile page or a final design-system implementation.

### API authentication modules

`apps/api` separates these responsibilities:

- Telegram init-data parsing and verification;
- user lookup/upsert;
- session creation, lookup, expiry, and revocation;
- HTTP transport and cookie handling;
- development identity resolution.

Transport handlers do not accept or derive identity from extra client profile fields.

## Telegram init-data verification

`POST /api/auth/telegram` accepts only:

```ts
type TelegramAuthRequest = {
  initData: string;
};
```

The server applies these checks in order:

1. Require a non-empty string within a configured byte limit.
2. Parse the query string strictly and reject duplicate security-relevant keys.
3. Require exactly one `hash`, `auth_date`, and `user` value.
4. Build the data-check-string from all original received key/value pairs except `hash`, sorted alphabetically and separated by `\n`.
5. Derive the secret with HMAC-SHA-256 using `WebAppData` as key and the bot token as message.
6. Compute the HMAC-SHA-256 of the data-check-string using that secret and compare the hexadecimal digest with `hash` using a constant-time comparison.
7. Reject an `auth_date` older than the configured maximum age or more than the allowed clock skew in the future.
8. Only after signature and freshness checks, parse and validate the signed `user` JSON with Zod.

The default maximum age is five minutes and default future skew is thirty seconds. Both are server configuration validated at startup.

Telegram user IDs are parsed without lossy numeric conversion. PostgreSQL stores them as `BigInt`; JSON contracts represent them as decimal strings where exposure is necessary. Application authorization uses only internal `User.id`.

Invalid signature, stale data, malformed signed identity, and other verification failures return the same public `TELEGRAM_AUTH_INVALID` error and never log raw init data, calculated signatures, or the bot token.

## User model

The Prisma user record has an internal generated ID and optional provider identities:

```text
User
- id: internal UUID/CUID primary key
- telegramId: nullable unique BigInt
- devUserKey: nullable unique string
- username: nullable string
- firstName: string
- lastName: nullable string
- languageCode: nullable string
- photoUrl: nullable string
- createdAt
- updatedAt
```

A production Telegram user has `telegramId` and no `devUserKey`. A development user has `devUserKey` and no Telegram identity. Provider identities are not merged automatically in EPIC-01.

After successful verification, the API upserts by `telegramId`. Permitted Telegram profile fields may be refreshed, while `User.id` remains stable.

## Application session model

The session table contains:

```text
AuthSession
- id: internal primary key
- userId: foreign key
- tokenHash: unique SHA-256 digest
- authMethod: TELEGRAM | DEVELOPMENT
- expiresAt
- revokedAt: nullable
- createdAt
```

The API generates at least 256 bits of randomness for the raw token. Only the hash is persisted. The raw token is returned once in an `HttpOnly` cookie with:

- `Path=/`;
- `SameSite=Lax`;
- `Secure=true` in production;
- a bounded `Max-Age` matching the server expiry.

The default session lifetime is thirty days and is configurable. A new login creates an independent session. `POST /api/auth/logout` revokes only the current session and clears the cookie. Unknown, expired, or revoked tokens all produce `401 AUTH_REQUIRED`.

`GET /api/me` accepts no user identifier. It resolves identity exclusively from the session cookie and returns the public auth-user projection.

State-changing authentication endpoints require JSON content type and validate `Origin` against a configured same-site allowlist when the header is present. Production configuration must define the public web origin. Credentialed wildcard CORS is not allowed.

## Development authentication

Development authentication is enabled only when both conditions are true:

```text
NODE_ENV != production
DEV_AUTH_ENABLED = true
```

If production configuration attempts to enable it, configuration parsing fails and the API does not start. When disabled, the dev-auth route is not registered and capability discovery reports it unavailable.

`POST /api/auth/dev` accepts only:

```ts
type DevAuthRequest = {
  devUserKey: string;
};
```

The key must resolve to a profile in a server-side validated allowlist containing at least two distinct users for multiplayer development. Arbitrary Telegram IDs, usernames, or profile fields are rejected by strict request schemas. Separate browser cookie jars selecting different keys receive distinct internal users and sessions.

Development users are visibly marked through `authProvider: "DEVELOPMENT"` in the public auth projection. The bot token is not required when the API runs exclusively with explicitly enabled development authentication, but production requires it.

## Shared contracts

`packages/shared` owns strict Zod schemas and inferred types for:

- `TelegramAuthRequest`;
- `DevAuthRequest`;
- `AuthUser`;
- `AuthSuccess` including session expiry;
- `/api/me` response;
- development capability response;
- the stable public error envelope.

Representative public projection:

```ts
type AuthUser = {
  id: string;
  displayName: string;
  username?: string;
  photoUrl?: string;
  languageCode?: string;
  authProvider: "TELEGRAM" | "DEVELOPMENT";
};
```

Unknown fields on identity-bearing request schemas are rejected. Internal Prisma errors, hashes, tokens, configuration, and stack traces never appear in responses.

## HTTP surface

```text
POST /api/auth/telegram  verify raw initData and create session
POST /api/auth/dev       create an allowlisted dev session; route exists only when enabled
POST /api/auth/logout    revoke current session and clear cookie
GET  /api/auth/dev       report whether dev auth is available and list safe chooser metadata
GET  /api/me             return authenticated public user
```

The existing `GET /health` remains a dependency-free liveness endpoint. `GET /ready` remains dependency-aware and is not weakened by auth work.

Public errors use a stable envelope and minimum disclosure:

```text
400 VALIDATION_ERROR
401 AUTH_REQUIRED
401 TELEGRAM_AUTH_INVALID
403 ORIGIN_NOT_ALLOWED
404 NOT_FOUND
429 RATE_LIMITED (contract reserved; rate limiting implementation may remain a later operational concern)
500 INTERNAL_ERROR
```

## Logging and secret handling

- `TELEGRAM_BOT_TOKEN`, raw init data, session cookies, authorization headers, and raw session tokens are redacted.
- Request logging does not serialize authentication bodies or headers containing credentials.
- Public errors have stable messages and opaque request identifiers where useful.
- Environment examples use placeholders only.
- Production startup validates required secrets and rejects development bypass configuration.

## Testing

### Unit tests

- valid Telegram signature fixture;
- tampering with each signed field;
- duplicate/missing fields, malformed encoding and user JSON;
- stale and future `auth_date`;
- oversized init data;
- constant-time comparison length boundary;
- Telegram ID conversion without precision loss;
- session token hashing, expiry, revocation, and raw-token non-persistence;
- Telegram adapter detection, one-time `ready()`, lifecycle subscription cleanup, safe-area fallback, and raw init-data forwarding;
- strict shared schemas rejecting client identity additions.

### API and database integration tests

- successful Telegram user creation and stable upserted internal ID;
- cookie security attributes and authenticated `/api/me`;
- two concurrent independent sessions;
- logout revokes only the current session;
- expired/revoked/unknown sessions share the non-leaky unauthorized response;
- two allowlisted development users remain distinct;
- unknown development key is rejected;
- development route is absent when disabled;
- production plus development bypass fails configuration validation;
- origin and JSON content-type guards;
- database contains only session-token hashes;
- auth failures do not expose Telegram, cryptographic, Prisma, or configuration details;
- existing `/health` and dependency-aware `/ready` behavior remains intact.

## Verification and smoke tests

EPIC-01 completion requires:

- formatting check;
- lint;
- TypeScript typecheck;
- unit tests;
- integration tests against PostgreSQL;
- production builds;
- Prisma validate and generate;
- API smoke test using a deterministically signed Telegram fixture;
- API smoke test with two development users in separate cookie jars;
- `/api/me` and logout smoke tests;
- negative production dev-bypass configuration smoke test;
- web browser smoke test for Telegram bootstrap fallback and development chooser.

## Scope-leakage review

The authenticated shell may display the current user's basic auth projection only to prove the flow. It must not introduce profile editing, statistics, navigation for later product modules, room behavior, game state, realtime transport, board rendering, board skins, or final design tokens.

## Preserved implementation notes

- Before EPIC-03, explicitly assign ownership of `stateVersion` increments.
- `physicalPath` means all visited cells after the source, including the destination, so `physicalPath.length === distance`.
- Future room lifecycle operations must be retry-safe and idempotent.
- `/references` is the canonical visual source. Existing files are preserved unmodified and untracked until a durable repository/storage policy is approved before EPIC-02.
- Future UI epics retain Playwright visual-QA evidence by epic and required viewport.
- `/health` remains liveness-only and `/ready` remains dependency-aware.

## Official basis

The design follows Telegram's Mini Apps documentation: send raw `WebApp.initData` to the backend, never trust `initDataUnsafe`, verify the HMAC data-check-string with the bot token, validate `auth_date`, call `WebApp.ready()` when the UI is ready, and use viewport/safe-area fields and lifecycle events when available.
