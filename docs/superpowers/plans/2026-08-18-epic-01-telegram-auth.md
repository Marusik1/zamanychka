# EPIC-01 Telegram Mini App Bootstrap and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure Telegram Mini App bootstrap and revocable server-side authentication to the EPIC-00 monorepo, including two-user development auth, `/api/me`, tested persistence, and responsive bootstrap evidence, without implementing EPIC-02+ product functionality.

**Architecture:** The React client wraps the official Telegram bridge behind a testable adapter and performs `/api/me`-first authentication. Fastify validates raw Telegram init data, resolves an internal Prisma user, and issues an opaque host-only cookie whose SHA-256 digest is stored in PostgreSQL. Strict shared Zod contracts define the HTTP boundary; production Telegram mode, development-only mode, and test configurations are fail-closed.

**Tech Stack:** pnpm monorepo, React 19, Vite, TypeScript strict, Fastify 5, `@fastify/cookie`, Zod, Prisma/PostgreSQL, Node crypto, Vitest/Testing Library, Playwright Chromium.

**Canonical design:** `docs/superpowers/specs/2026-08-18-epic-01-telegram-auth-design.md`

---

## Scope and execution rules

- Use `superpowers:test-driven-development` for every behavioral change.
- Preserve the distinction between dependency-free `GET /health` and dependency-aware `GET /ready`.
- Never log raw `initData`, bot tokens, raw session tokens, cookies, or authorization headers.
- Never accept `telegramId`, username, names, photo URL, or any other identity field beside raw `initData` on the Telegram auth endpoint.
- Keep `packages/game-engine` untouched and empty. Do not add rooms, realtime, chat, profiles, rating, history, boards, skins, or final EPIC-02 design primitives.
- Preserve `/references` byte-for-byte. Do not add or remove those currently untracked files during EPIC-01.
- Commit after each green task. Before claiming completion, use `superpowers:verification-before-completion`.

## File map

### Shared contracts

- Create `packages/shared/src/auth.ts`: strict auth request schemas, response schemas, public error schema, inferred types.
- Create `packages/shared/src/auth.test.ts`: strictness, unions, optional-field semantics, timestamps.
- Modify `packages/shared/src/index.ts`: export auth schemas and types.

### API configuration and persistence

- Modify `apps/api/package.json`: add `@fastify/cookie`; add integration-test/migration scripts if needed.
- Modify `apps/api/prisma/schema.prisma`: `User`, `AuthSession`, and `AuthMethod` only.
- Create `apps/api/prisma/migrations/<timestamp>_epic_01_auth/migration.sql`: durable auth schema and constraints.
- Create `apps/api/prisma.test.config.ts`: test migrations sourced only from `TEST_DATABASE_URL`.
- Create `apps/api/vitest.integration.config.ts`: serialized PostgreSQL integration suite.
- Create `apps/api/src/test/test-database.ts`: `_test` URL guard, cleanup, and lifecycle helpers.
- Modify `infra/docker-compose.yml`: isolated `postgres_test` service on port 5433.
- Modify `apps/api/src/config/env.ts`: explicit production/development/test auth matrix and normalized dev-user config.
- Modify `apps/api/src/config/env.test.ts`: matrix, origins, secrets, two-user allowlist, cookie policy.
- Modify `.env.example`: safe placeholders and local two-user dev configuration.

### API domain and transport

- Create `apps/api/src/auth/telegram-init-data.ts`: pure strict parser, HMAC verification, freshness, forward-compatible signed-user parsing.
- Create `apps/api/src/auth/telegram-init-data.test.ts`: cryptographic and parser unit matrix.
- Create `apps/api/src/auth/session-token.ts`: base64url generation and SHA-256 digest.
- Create `apps/api/src/auth/session-token.test.ts`: format, entropy-length boundary, deterministic hashing.
- Create `apps/api/src/auth/auth-repository.ts`: Prisma user upserts, session lookup/create/revoke, row-locked replacement.
- Create `apps/api/src/auth/auth-service.ts`: provider-independent login/session orchestration and public projections.
- Create `apps/api/src/auth/cookies.ts`: environment-specific cookie name/options and exact clearing.
- Create `apps/api/src/auth/origin-guard.ts`: JSON and fail-closed origin checks.
- Create `apps/api/src/auth/routes.ts`: Telegram/dev/login/logout/me/capability routes and stable public errors.
- Create `apps/api/src/auth/routes.test.ts`: injected unit-level route/error/cookie tests.
- Create `apps/api/src/auth/auth.integration.test.ts`: PostgreSQL-backed user/session/concurrency tests.
- Modify `apps/api/src/app.ts`: inject auth dependencies and register cookie/auth routes without weakening operational routes.
- Modify `apps/api/src/server.ts`: construct one Prisma client for probes and auth, redact sensitive request fields, close dependencies.
- Modify `apps/api/src/health/dependency-probes.ts`: expose the existing Prisma client without changing liveness/readiness semantics.

### Web bootstrap

- Modify `apps/web/package.json`: add the `@zamanushka/shared` workspace dependency.
- Modify `apps/web/index.html`: load the official Telegram bridge before the module entry.
- Create `apps/web/src/telegram/types.ts`: minimal local Telegram bridge declarations used by the adapter.
- Create `apps/web/src/telegram/adapter.ts`: detection, one-shot ready, raw init data, lifecycle subscriptions, CSS variables.
- Create `apps/web/src/telegram/adapter.test.ts`: fake-bridge lifecycle tests.
- Create `apps/web/src/auth/api.ts`: credentials-included relative `/api` client and schema parsing.
- Create `apps/web/src/auth/bootstrap.ts`: `/api/me`-first state transition logic.
- Create `apps/web/src/auth/bootstrap.test.ts`: Telegram and ordinary-browser state matrix.
- Create `apps/web/src/auth/auth-shell.tsx`: minimal authenticated state, error state, and two-user dev chooser.
- Create `apps/web/src/auth/auth-shell.test.tsx`: functional user flows and no arbitrary identity inputs.
- Modify `apps/web/src/app.tsx`: initialize adapter and render auth shell only.
- Modify `apps/web/src/styles.css`: app-owned viewport/safe-area variables and restrained responsive bootstrap styling.
- Modify `apps/web/vite.config.ts`: same-origin `/api` development proxy.

### Documentation, smoke, and evidence

- Modify `AGENTS.md`: execution boundary becomes EPIC-01 only; retain future notes and stop rule.
- Expand `docs/epics/EPIC-01-TELEGRAM-AUTH.md`: implementation scope, DoD, security invariants, verification.
- Modify `docs/TELEGRAM.md`: supported launch surfaces, auth flow, dev matrix, session behavior.
- Modify `README.md`: auth environment, two dev users, migration and smoke instructions; remove EPIC-00-only status.
- Create `scripts/epic-01-auth-smoke.mjs`: deterministic Telegram signature, cookie jars, `/api/me`, logout, two dev identities.
- Create `scripts/epic-01-production-guard-smoke.mjs`: production dev-bypass negative configuration check.
- Create `artifacts/visual-qa/epic-01/README.md` and four PNG screenshots: commands, viewport metadata, comparison notes.

## Task 0: Record authorization and execution boundary

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/epics/EPIC-01-TELEGRAM-AUTH.md`

- [ ] **Step 1: Record the approved EPIC-01 boundary before application code**

Replace the stale EPIC-00 execution boundary with the user's explicit authorization for EPIC-01 only. Add Telegram identity/session invariants and the mandatory stop before EPIC-02. Preserve all existing product/UI/engineering rules and the future engine/room notes.

- [ ] **Step 2: Record the implementation base**

After this boundary commit, record `git rev-parse HEAD` as `EPIC_01_IMPLEMENTATION_BASE` in local execution notes. Final scope review compares all implementation changes against this commit, not `HEAD~1`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec prettier --check AGENTS.md docs/epics/EPIC-01-TELEGRAM-AUTH.md`

Expected: PASS; only EPIC-01 is authorized.

Commit: `git commit -m "docs: authorize EPIC-01 implementation"`

## Task 1: Freeze shared authentication contracts

**Files:**
- Create: `packages/shared/src/auth.ts`
- Create: `packages/shared/src/auth.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing strict-schema tests**

Cover a valid `{ initData }`, rejection of `{ initData, telegramId }`, valid `{ devUserKey }`, exact `AuthSuccess`, `MeResponse`, enabled/disabled `DevAuthCapability`, RFC 3339 `expiresAt`, optional fields omitted rather than nullable, and stable `PublicError`.

```ts
expect(() => telegramAuthRequestSchema.parse({ initData: 'signed', telegramId: '1' })).toThrow();
expect(devAuthCapabilitySchema.parse({ enabled: false, users: [] })).toEqual({
  enabled: false,
  users: [],
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm --filter @zamanushka/shared test -- auth.test.ts`

Expected: FAIL because `./auth.js` and schemas do not exist.

- [ ] **Step 3: Implement minimal strict Zod contracts**

Use `.strict()` for HTTP request objects and response objects, a discriminated union for capability, `.datetime({ offset: true })` for expiry, and an explicit error-code enum including `AUTH_SESSION_REPLACED`.

- [ ] **Step 4: Export contracts and run shared verification**

Run:

```powershell
pnpm --filter @zamanushka/shared test
pnpm --filter @zamanushka/shared typecheck
```

Expected: all shared tests and typecheck pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/auth.ts packages/shared/src/auth.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add EPIC-01 auth contracts"
```

## Task 2: Add fail-closed authentication configuration

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/config/env.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add failing table-driven configuration tests**

Test all five matrix rows: production Telegram; development dev-only; development Telegram; test dev-only; test Telegram. Also test production dev flag rejection, missing bot token where required, fewer than two dev users, duplicate dev keys, numeric bounds for max bytes/age/skew/session TTL, non-HTTPS production origins, wildcard/opaque origins, credentials, non-root path, query, fragment, and missing explicit test origins.

- [ ] **Step 2: Run config tests and confirm RED**

Run: `pnpm --filter @zamanushka/api test -- src/config/env.test.ts`

Expected: FAIL for missing auth configuration fields.

- [ ] **Step 3: Implement normalized `AuthRuntimeConfig`**

Parse environment strings once and return a discriminated `auth` configuration with every runtime bound needed by the verifier and session service:

```ts
type AuthRuntimeConfig =
  | {
      mode: 'telegram';
      botToken: string;
      allowedOrigins: string[];
      cookie: CookiePolicy;
      sessionTtlSeconds: number;
      initDataMaxBytes: number;
      initDataMaxAgeSeconds: number;
      initDataFutureSkewSeconds: number;
    }
  | {
      mode: 'development';
      users: DevUserConfig[];
      allowedOrigins: string[];
      cookie: CookiePolicy;
      sessionTtlSeconds: number;
    };
```

Production always selects Telegram and `__Host-zamanushka-session` with `Secure=true`. Development/test select mode only from `DEV_AUTH_ENABLED`; local/test cookie stays host-only with `Secure=false`. Parse `DEV_AUTH_USERS_JSON` as a bounded strict JSON array. Normalize each `APP_ORIGINS` entry with `new URL` and require it to equal its canonical `.origin`: reject credentials, non-root paths, query, fragment, opaque/`null` origins, and wildcards. Require HTTPS in production and explicit loopback HTTP origins only for local/test use.

- [ ] **Step 4: Update `.env.example` without secrets**

Provide two safe local users (`player-1`, `player-2`), explicit `APP_ORIGINS=http://127.0.0.1:5173`, placeholder bot token, auth age/skew/session TTL values, and comments explaining mode selection.

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
pnpm --filter @zamanushka/api test -- src/config/env.test.ts
pnpm --filter @zamanushka/api typecheck
```

Expected: PASS.

Commit: `git commit -m "feat(api): enforce auth configuration matrix"`

## Task 3: Implement Telegram init-data verification

**Files:**
- Create: `apps/api/src/auth/telegram-init-data.ts`
- Create: `apps/api/src/auth/telegram-init-data.test.ts`

- [ ] **Step 1: Write deterministic signing helper and failing validator tests**

Use Node `createHmac` in tests to produce a current signed fixture. Cover: valid input; changed `user`, `auth_date`, and `query_id`; uppercase/short/non-hex hash; duplicate any key; invalid percent encoding; absent hash/date/user; oversized input; stale and future time; malformed JSON; unsafe/fractional/non-positive ID; documented extra fields and unknown future fields accepted/stripped; `signature` retained in the bot-HMAC data-check-string.

- [ ] **Step 2: Run test and confirm RED**

Run: `pnpm --filter @zamanushka/api test -- src/auth/telegram-init-data.test.ts`

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement the pure verifier**

Implement strict query component parsing, all-key duplicate rejection, decoded-value sorting, exact lowercase 64-hex validation, two-stage HMAC, `timingSafeEqual` on equal-length buffers, injected clock, and Zod parsing after cryptographic verification. Use a non-strict nested Telegram schema (`.strip()`) but return only the six supported fields.

- [ ] **Step 4: Run focused tests and mutation sanity checks**

Run: `pnpm --filter @zamanushka/api test -- src/auth/telegram-init-data.test.ts`

Expected: all cryptographic cases pass without logging fixtures.

- [ ] **Step 5: Commit**

Commit: `git commit -m "feat(api): verify Telegram Mini App init data"`

## Task 4: Add Prisma user and session persistence

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<generated_timestamp>_epic_01_auth/migration.sql`
- Create: `apps/api/prisma.test.config.ts`
- Create: `apps/api/vitest.integration.config.ts`
- Create: `apps/api/src/test/test-database.ts`
- Modify: `apps/api/package.json`
- Modify: `infra/docker-compose.yml`
- Modify: `.env.example`
- Create: `apps/api/src/auth/session-token.ts`
- Create: `apps/api/src/auth/session-token.test.ts`
- Create: `apps/api/src/auth/auth-repository.ts`
- Create: `apps/api/src/auth/auth.integration.test.ts`

- [ ] **Step 1: Write failing token tests**

Assert an injected 32-byte source encodes to unpadded URL-safe base64, hashing is deterministic 64-hex SHA-256, and generated values differ. Repository tests assert that persistence DTOs and rows never contain the raw token.

- [ ] **Step 2: Implement the token utility and turn tests GREEN**

Run: `pnpm --filter @zamanushka/api test -- src/auth/session-token.test.ts`

Expected: PASS.

- [ ] **Step 3: Provision and guard the isolated test database**

Add `postgres_test` to Compose with database `zamanushka_test`, port 5433, and its own volume. Add `TEST_DATABASE_URL` to `.env.example`. Create `prisma.test.config.ts` that reads only `TEST_DATABASE_URL` and fails unless the parsed database name ends in `_test`. Add a serialized integration Vitest config (`fileParallelism: false`, `maxWorkers: 1`) and a helper that repeats the guard before any cleanup.

Run:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres_test
docker compose --env-file .env -f infra/docker-compose.yml ps postgres_test
```

Expected: isolated PostgreSQL is healthy before migration/tests.

- [ ] **Step 4: Write failing repository integration tests before persistence implementation**

Cover Telegram upsert stable internal ID, distinct dev users, hash-only persistence, expiry/revocation, two device sessions, sequential same-cookie replacement, and two concurrent replacements. Test setup refuses any URL whose database name does not end in `_test`; cleanup touches only the guarded database. Run the integration script and confirm RED because Prisma auth models/repository methods are absent.

- [ ] **Step 5: Define the minimal Prisma schema**

Add `AuthMethod { TELEGRAM DEVELOPMENT }`, nullable unique `telegramId BigInt`, nullable unique `devUserKey String`, supported profile fields, timestamps, and `AuthSession` with unique `tokenHash`, indexed `userId`, expiry/revocation, and cascade cleanup relation. Do not add profiles, stats, rooms, or game tables.

- [ ] **Step 6: Generate and inspect a migration against test configuration**

Run:

```powershell
pnpm prisma:generate
pnpm prisma:validate
pnpm --filter @zamanushka/api exec prisma migrate dev --name epic_01_auth --config prisma.test.config.ts
```

Expected: one migration containing only auth enum/tables/indexes/foreign key; generated client compiles.

- [ ] **Step 7: Implement focused repository methods**

Use Prisma transactions for ordinary writes. For replacement, use parameterized raw SQL with Prisma's quoted `"AuthSession"` and `"tokenHash"` identifiers to acquire `SELECT ... FOR UPDATE`, then recheck active state, revoke, and insert the successor in the same `READ COMMITTED` transaction. Unknown tokens follow the ordinary no-current-session path; expired/revoked tokens are not replaceable; a request that loses the lock race returns a focused replacement-conflict result and creates nothing.

- [ ] **Step 8: Deploy migration, run serialized integration tests, and inspect rows**

Run:

```powershell
pnpm --filter @zamanushka/api exec prisma migrate deploy --config prisma.test.config.ts
pnpm --filter @zamanushka/api test:integration -- src/auth/auth.integration.test.ts
```

Expected: PASS with Docker PostgreSQL running; raw tokens are absent from queried records.

- [ ] **Step 9: Commit**

Commit: `git commit -m "feat(api): persist users and revocable sessions"`

## Task 5: Build Fastify auth service and routes

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/auth/auth-service.ts`
- Create: `apps/api/src/auth/auth-service.test.ts`
- Create: `apps/api/src/auth/cookies.ts`
- Create: `apps/api/src/auth/origin-guard.ts`
- Create: `apps/api/src/auth/routes.ts`
- Create: `apps/api/src/auth/routes.test.ts`
- Create: `apps/api/src/auth/auth-http.integration.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/health/dependency-probes.ts`

- [ ] **Step 1: Add `@fastify/cookie`**

Run: `pnpm --filter @zamanushka/api add @fastify/cookie`

Expected: lockfile and API manifest change only.

- [ ] **Step 2: Write failing auth-service orchestration tests**

With a typed fake repository, drive Telegram verification/upsert, allowlisted dev resolution, session issue, expiry, sequential replacement, replacement conflict, `/me`, and logout. Confirm RED before creating `auth-service.ts`.

- [ ] **Step 3: Write failing injected route tests**

Use an in-memory fake auth service and Fastify `inject`. Assert all five configuration rows: production Telegram, development dev-only, development Telegram, test dev-only, and test Telegram. Cover capability response always registered; exact POST route presence/absence; strict bodies; JSON content type; missing/`null`/malformed/disallowed/allowed origins; `Cache-Control: no-store`; `/me`; logout; public error mapping; no sensitive details. Assert cookies exactly: no `Domain`; bounded `Max-Age` matches persisted expiry; production uses `__Host-`, Path `/`, HttpOnly, SameSite Lax, Secure; local/test is host-only and non-Secure; logout clearing repeats name, Path, SameSite, Secure, host-only scope and expiry semantics.

- [ ] **Step 4: Write failing real HTTP/PostgreSQL integration tests**

Using the guarded serialized test database, specify a deterministically signed Telegram flow, stable user upsert, cookie-to-`/api/me`, sequential and concurrent replacement, logout, both dev users, all route matrices, and unchanged health/readiness. Confirm RED before service/routes exist.

- [ ] **Step 5: Run new tests and confirm RED**

Run:

```powershell
pnpm --filter @zamanushka/api test -- src/auth/auth-service.test.ts src/auth/routes.test.ts
pnpm --filter @zamanushka/api test:integration -- src/auth/auth-http.integration.test.ts
```

Expected: FAIL because routes are absent.

- [ ] **Step 6: Implement cookie, origin, service, and route units**

Keep HTTP handlers thin. Parse all bodies with shared schemas. Never include raw auth bodies in log fields. Map unknown server errors to `INTERNAL_ERROR`; validation, auth, origin, Telegram, and session-replacement failures receive only stable messages.

- [ ] **Step 7: Integrate into `buildApp` with dependency injection**

Extend `BuildAppOptions` with auth config/service while retaining injected readiness probes. Server construction shares one Prisma client between probes and repository, configures Fastify redaction for `req.headers.cookie`, `req.headers.authorization`, and auth request bodies, and closes clients once.

- [ ] **Step 8: Turn service, route, and integration suites GREEN**

Run:

```powershell
pnpm --filter @zamanushka/api test
pnpm --filter @zamanushka/api test:integration
pnpm --filter @zamanushka/api typecheck
```

Expected: all API tests pass.

Commit: `git commit -m "feat(api): expose secure authentication endpoints"`

## Task 6: Implement the Telegram browser adapter

**Files:**
- Modify: `apps/web/index.html`
- Create: `apps/web/src/telegram/types.ts`
- Create: `apps/web/src/telegram/adapter.ts`
- Create: `apps/web/src/telegram/adapter.test.ts`
- Modify: `apps/web/src/vite-env.d.ts`

- [ ] **Step 1: Write failing fake-bridge tests**

Test absent bridge, empty init data, non-empty init data, `ready()` exactly once, subscription to three supported events, event-driven CSS updates, fallback zero insets, stable viewport height, and complete cleanup.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --filter @zamanushka/web test -- src/telegram/adapter.test.ts`

Expected: FAIL because adapter is absent.

- [ ] **Step 3: Add official bridge and minimal local types**

Load `https://telegram.org/js/telegram-web-app.js?59` before `/src/main.tsx`. Type only fields/events consumed in EPIC-01; do not model unrelated Telegram APIs.

- [ ] **Step 4: Implement adapter and CSS variable projection**

Expose detection, raw init data, one-shot ready, and a disposer. Set `--app-viewport-height`, `--app-safe-area-*`, and `--app-content-safe-area-*` without trusting identity fields.

- [ ] **Step 5: Run web unit/type tests and commit**

Run:

```powershell
pnpm --filter @zamanushka/web test -- src/telegram/adapter.test.ts
pnpm --filter @zamanushka/web typecheck
```

Expected: PASS.

Commit: `git commit -m "feat(web): add Telegram Mini App adapter"`

## Task 7: Implement `/api/me`-first web authentication

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/auth/api.ts`
- Create: `apps/web/src/auth/bootstrap.ts`
- Create: `apps/web/src/auth/bootstrap.test.ts`
- Create: `apps/web/src/auth/auth-shell.tsx`
- Create: `apps/web/src/auth/auth-shell.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: Add the shared workspace dependency**

Run: `pnpm --filter @zamanushka/web add "@zamanushka/shared@workspace:*"`

Expected: web manifest and lockfile resolve the existing shared package before auth tests import its schemas.

- [ ] **Step 2: Write failing bootstrap state-machine tests**

Assert `/api/me` is always first; 200 skips login; 401 + Telegram sends only `{ initData }`; 401 + browser discovers dev capability; disabled capability becomes a clear unavailable error; enabled capability yields chooser; unexpected responses enter non-leaky error state.

- [ ] **Step 3: Write failing component tests**

Cover loading, authenticated internal ID/display name/provider, exactly two configured dev choices, selecting a key, retry, logout, and absence of free-form Telegram/user identity inputs or future product navigation.

- [ ] **Step 4: Run focused tests and confirm RED**

Run: `pnpm --filter @zamanushka/web test -- src/auth`

Expected: FAIL for missing modules.

- [ ] **Step 5: Implement schema-validated credentials client and bootstrap**

Use relative `/api` URLs, `credentials: 'include'`, JSON bodies only for POST, and shared response parsing. Never parse `initDataUnsafe`.

- [ ] **Step 6: Implement minimal auth shell and lifecycle integration**

Initialize the Telegram adapter, start bootstrap, call `ready()` when the shell can render, and dispose listeners on unmount. Preserve restrained EPIC-00 styling while adding safe-area padding and responsive states only.

- [ ] **Step 7: Add Vite development proxy**

Proxy `/api`, `/health`, and `/ready` to the configured local API target without enabling wildcard credentialed CORS.

- [ ] **Step 8: Run web tests and commit**

Run:

```powershell
pnpm --filter @zamanushka/web test
pnpm --filter @zamanushka/web typecheck
```

Expected: all web tests pass.

Commit: `git commit -m "feat(web): bootstrap Telegram and development auth"`

## Task 8: Complete operator documentation

**Files:**
- Modify: `docs/epics/EPIC-01-TELEGRAM-AUTH.md`
- Modify: `docs/TELEGRAM.md`
- Modify: `README.md`

- [ ] **Step 1: Expand EPIC and Telegram docs**

Document supported launch surfaces, `/api/me`-first flow, HMAC/freshness rules, forward-compatible signed user parsing, cookie/session replacement, dev/test/production matrix, and endpoint table.

- [ ] **Step 2: Update README operations**

Add migration commands, auth environment examples, two-browser dev-user instructions, Telegram bot-token handling, and exact verification commands. Explicitly retain `/health` versus `/ready` semantics and reference preservation.

- [ ] **Step 3: Run formatting check and commit**

Run: `pnpm exec prettier --check AGENTS.md README.md docs/TELEGRAM.md docs/epics/EPIC-01-TELEGRAM-AUTH.md`

Expected: PASS after formatting.

Commit: `git commit -m "docs: document EPIC-01 auth operation"`

## Task 9: Add executable API smoke coverage

**Files:**
- Create: `scripts/epic-01-auth-smoke.mjs`
- Create: `scripts/epic-01-production-guard-smoke.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the auth smoke script against a running API**

Accept an explicit `--mode=telegram|development`. Telegram mode requires only the smoke bot token and verifies signed login, `/api/me`, replacement, logout, no-store, and non-leaky failures. Development mode requires no bot token and verifies two allowlisted users in separate cookie jars. Never exercise mutually exclusive routes against one server mode.

- [ ] **Step 2: Write production guard smoke**

Spawn config parsing in a child process with `NODE_ENV=production` and `DEV_AUTH_ENABLED=true`; require non-zero exit and ensure stderr contains no secret values.

- [ ] **Step 3: Add scripts and test them in each applicable mode**

Add `smoke:auth` and `smoke:production-guard` package scripts. Run against isolated API ports/configurations so the dev-only and Telegram-mode route matrices are both exercised.

- [ ] **Step 4: Format implementation files**

Run: `pnpm format`

Expected: only EPIC-01 files receive mechanical formatting; inspect the diff before staging.

- [ ] **Step 5: Commit**

Commit: `git commit -m "test: add EPIC-01 auth smoke coverage"`

## Task 10: Full verification and visual QA

**Files:**
- Create: `artifacts/visual-qa/epic-01/README.md`
- Create: `artifacts/visual-qa/epic-01/auth-390x844.png`
- Create: `artifacts/visual-qa/epic-01/auth-430x932.png`
- Create: `artifacts/visual-qa/epic-01/auth-1440x900.png`
- Create: `artifacts/visual-qa/epic-01/auth-1920x1080.png`

- [ ] **Step 1: Start clean infrastructure and apply migrations**

Run:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres redis
pnpm prisma:generate
pnpm prisma:validate
pnpm --filter @zamanushka/api exec prisma migrate deploy --config prisma.config.ts
docker compose --env-file .env -f infra/docker-compose.yml ps
```

Expected: PostgreSQL and Redis healthy; migration deployed; Prisma validates/generates.

- [ ] **Step 2: Run the complete static and test suite**

Run in this order:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: every command exits 0. Record test counts and any intentional warnings.

- [ ] **Step 3: Run API operational and auth smoke tests**

Start the API in dev-only mode, verify `/health` stays 200 without dependency logic and `/ready` reports both dependencies, then execute `pnpm smoke:auth`. Restart on an isolated port in development Telegram mode with a smoke-only token and execute the deterministic Telegram portion. Run `pnpm smoke:production-guard`.

Expected: all auth flows pass; two dev cookie jars map to different internal IDs; Telegram ID is not the application ID; logout revokes only the current session; production bypass cannot start.

- [ ] **Step 4: Run web smoke and capture four viewports**

Start API dev-only mode and Vite. With Playwright Chromium, authenticate/select a development user and capture 390x844, 430x932, 1440x900, and 1920x1080 PNGs. Confirm no overflow, safe-area padding, readable hierarchy, board/game/profile absence, and stable browser fallback.

- [ ] **Step 5: Compare evidence with references without expanding design scope**

Record the relevant reference filenames and observations in `artifacts/visual-qa/epic-01/README.md`: restrained dark/premium foundation, visual hierarchy, spacing, and responsive integrity. Do not reproduce board/skin/product layouts in this auth shell.

- [ ] **Step 6: Inspect Git scope and secrets**

Run:

```powershell
git status --short
git diff --check
git diff --stat <EPIC_01_IMPLEMENTATION_BASE>
git grep -n -E "TELEGRAM_BOT_TOKEN=.+|initData=.+|__Host-zamanushka-session=." -- ':!pnpm-lock.yaml'
```

Expected: only EPIC-01 files/evidence are changed; `/references` remains untouched/untracked; no real secret, raw init data, or cookie value is committed.

- [ ] **Step 7: Request final code review and resolve findings**

Use `superpowers:requesting-code-review` against the canonical design and this plan. Re-run affected verification after fixes.

- [ ] **Step 8: Commit evidence and final documentation**

Commit: `git commit -m "test: verify EPIC-01 authentication"`

- [ ] **Step 9: Issue the completion report and stop**

Use exactly this structure and do not begin EPIC-02:

```text
EPIC 01 COMPLETE

Сделано:
- ...

Изменённые файлы:
- ...

Backend:
- ...

Frontend:
- ...

Game logic:
- not implemented (out of scope)

Realtime:
- not implemented (out of scope)

Tests:
- ...

Проверено:
[x] format
[x] lint
[x] typecheck
[x] unit tests
[x] integration tests
[x] production build
[x] Prisma validate/generate
[x] PostgreSQL/Redis smoke
[x] API auth smoke
[x] web smoke and four-viewport evidence

Следующий эпик:
EPIC-02 — not started; requires separate approval
```

## Plan acceptance checks

- Every identity decision occurs after server-side verification or server-side dev allowlist lookup.
- The outer auth bodies are strict; the signed nested Telegram user is forward-compatible.
- Existing sessions prevent routine re-auth; valid same-cookie replacement is serialized and bounded to one successor.
- Raw tokens, raw init data, and bot tokens never enter persistence, logs, fixtures, screenshots, or commits.
- Production cannot expose development authentication under any client input.
- `User.id` remains the only application identity; Telegram ID is nullable unique external data.
- EPIC-00 operational behavior remains intact.
- No EPIC-02+ functionality is present.
