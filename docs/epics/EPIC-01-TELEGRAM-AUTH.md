# EPIC-01 — Telegram Mini App and Auth

## Implementation boundary

EPIC-01 is approved for implementation on the accepted EPIC-00 base at commit `52e7852`. Its scope is Telegram Mini App bootstrap, server-verified raw `initData`, user and revocable session persistence, explicitly enabled non-production development authentication, `GET /api/me`, safe-area integration, browser fallback, and the tests, documentation, smoke coverage, and visual evidence required by the approved design and plan.

Identity is established only from server-verified Telegram data or a server-side development allowlist. `User.id` remains the application identity; Telegram IDs remain external identifiers. Only hashes of opaque session tokens are persisted, and production can never enable development authentication.

Game rules, rooms, matchmaking, realtime gameplay, chat, profiles, rating, history, boards, board skins, and the final visual system are out of scope. Existing future engine and room notes remain unchanged. EPIC-02 must not start without separate explicit approval.

## Definition of Done

- The approved authentication contracts, configuration, verification, persistence, API routes, Telegram adapter, and `/api/me`-first web bootstrap are implemented and tested.
- EPIC-00 health, readiness, workspace, and infrastructure behavior remain intact.
- Formatting, linting, type checking, unit and integration tests, production build, Prisma validation/generation, operational/auth smoke tests, and four required viewport captures pass.
- Secrets, raw Telegram init data, and raw session tokens are absent from persistence, logs, fixtures, screenshots, and commits.
- Final scope review includes `git diff --stat 52e7852`, then work stops before EPIC-02.
