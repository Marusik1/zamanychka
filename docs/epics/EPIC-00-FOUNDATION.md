# EPIC-00 — Foundation

## Goal

Create a locally runnable, strictly typed monorepo foundation. No real gameplay or EPIC-01+ product functionality.

## Scope

- pnpm workspace with `apps/web`, `apps/api`, `packages/game-engine`, `packages/shared`, `packages/ui`, and `packages/config`.
- React/Vite app shell sufficient to validate startup, responsive foundation, placeholder foundation tokens, and future routing. The real design token system remains EPIC-02 scope.
- Fastify API with `GET /health` and dependency-aware `GET /ready`.
- PostgreSQL and Redis through local Docker Compose.
- Prisma configured without product schema work beyond foundation needs.
- strict TypeScript, lint, formatting, tests, build, environment examples, README.
- reference inventory and approved specification documents.

## Explicitly out of scope

Telegram auth, game rules implementation, routes for pawns, matchmaking behavior, Socket.IO gameplay, chat, profiles, statistics, final screens, and functional board skins.

## Definition of done

- pnpm workspace, apps, and packages build.
- Web and API run locally.
- TypeScript strict, lint, typecheck, tests, and production build pass.
- PostgreSQL and Redis start locally.
- Prisma config is valid.
- `/health` and `/ready` respond correctly.
- `.env.example`, secret hygiene, README, reference documentation, and `SPEC_REVIEW.md` exist.
- No EPIC-01+ implementation exists.

## Stop rule

After verification, issue the EPIC-00 completion report, list risks and project structure, and stop before EPIC-01.
