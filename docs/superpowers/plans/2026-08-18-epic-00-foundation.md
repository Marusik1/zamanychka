# EPIC-00 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable, strictly typed pnpm monorepo foundation with a React/Vite shell, Fastify health/readiness API, Prisma configuration, and Dockerized PostgreSQL/Redis—without implementing EPIC-01+ behavior.

**Architecture:** A modular monorepo separates deployable web/API applications from pure shared packages. The API exposes only operational endpoints and receives dependency probes through explicit interfaces so readiness is testable without infrastructure. PostgreSQL and Redis run locally through Compose; Prisma 7 uses an explicit generated-client output and PostgreSQL driver adapter.

**Tech Stack:** Node.js 24 (`>=24.0.0`), pnpm `10.32.1`, TypeScript strict, React, Vite, Fastify 5, Vitest, Testing Library, Prisma 7, PostgreSQL 17, Redis 8, Docker Compose, ESLint, Prettier.

---

## File map

- Root: workspace scripts, shared lint/format configuration, environment templates, README, ignore rules.
- `packages/config`: canonical strict TypeScript configurations.
- `packages/shared`: dependency names and health DTO contracts only.
- `packages/game-engine`: empty public package boundary; no rules.
- `packages/ui`: placeholder foundation tokens and one shell primitive; full system remains EPIC-02.
- `apps/api`: environment parsing, process-owned dependency clients/probes, app factory, operational routes, graceful process entrypoint, tests, and empty Prisma schema.
- `apps/web`: Vite bootstrap, minimal Russian app shell, responsive CSS, tests.
- `infra/docker-compose.yml`: local PostgreSQL and Redis only.

### Task 1: Approval metadata and repository hygiene

**Files:**

- Create: `.gitignore`, `.dockerignore`, `.editorconfig`, `.env.example`

- [ ] Verify `docs/SPEC_REVIEW.md` already contains `APPROVED_FOR_EPIC_00` and all three notes; preserve it unchanged.
- [ ] Ignore dependencies, builds, generated Prisma client, coverage, local environment files, logs, and `.superpowers/` while keeping `.env.example`.
- [ ] Document UTF-8/LF/editor defaults and safe Docker context exclusions.
- [ ] Run `git check-ignore node_modules .env apps/api/src/generated/prisma/client.ts` and expect every path to print.
- [ ] Commit hygiene with `git add .gitignore .dockerignore .editorconfig .env.example && git commit -m "chore: add repository hygiene"`.

### Task 2: Root workspace and strict tooling

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `eslint.config.mjs`, `prettier.config.mjs`, `vitest.workspace.ts`
- Create: `packages/config/package.json`, `packages/config/tsconfig/base.json`, `packages/config/tsconfig/node.json`, `packages/config/tsconfig/react.json`

- [ ] Define pnpm 10 workspace packages and Node `>=24.0.0` engine.
- [ ] Set `packageManager: "pnpm@10.32.1"`, `engines.node: ">=24.0.0"`, and workspace globs `apps/*`, `packages/*`.
- [ ] Add root scripts: `dev` (`pnpm -r --parallel --filter './apps/*' dev`), `lint`, `typecheck`, `test`, `build`, `format`, `format:check`, `prisma:generate`, and `prisma:validate`.
- [ ] Configure TypeScript strictness including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride`.
- [ ] Configure ESLint flat config for TypeScript/React and Prettier without duplicating formatting rules.
- [ ] Install exact dependency families with `pnpm install`; expected exit 0 and a generated `pnpm-lock.yaml`.
- [ ] Run `pnpm exec tsc --version`, `pnpm exec eslint --version`, and `pnpm exec vitest --version`; each must exit 0.
- [ ] Commit the workspace/tooling foundation.

### Task 3: Package boundaries

**Files:**

- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/health.ts`, `packages/shared/src/health.test.ts`
- Create: `packages/game-engine/package.json`, `packages/game-engine/tsconfig.json`, `packages/game-engine/src/index.ts`
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`, `packages/ui/src/foundation.css`, `packages/ui/src/app-frame.tsx`, `packages/ui/src/app-frame.test.tsx`

- [ ] RED: test health DTO factories/schema and run the focused test to observe missing exports.
- [ ] Run `pnpm --filter @zamanushka/shared test -- health.test.ts`; expect FAIL because `healthResponseSchema`/`readinessResponseSchema` are not exported.
- [ ] GREEN: implement only `HealthResponse`/`ReadinessResponse` contracts and pass the focused test.
- [ ] Keep `game-engine` as an empty documented boundary with no game functions.
- [ ] RED: test the accessible `AppFrame` shell primitive and observe failure.
- [ ] Run `pnpm --filter @zamanushka/ui test -- app-frame.test.tsx`; expect FAIL because `AppFrame` is not exported.
- [ ] GREEN: implement minimal semantic frame and placeholder tokens; pass focused test.
- [ ] Typecheck/build packages and commit.

### Task 4: Fastify operational API

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Create: `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`
- Create: `apps/api/src/health/dependency-probes.ts`, `apps/api/src/health/routes.ts`, `apps/api/src/health/routes.test.ts`

- [ ] RED: test environment parsing defaults/errors and verify expected failures.
- [ ] Run `pnpm --filter @zamanushka/api test -- env.test.ts`; expect FAIL because `parseEnv` is missing.
- [ ] GREEN: add Zod environment parsing for host, port, database URL, and Redis URL.
- [ ] RED: use Fastify injection to specify `/health` as process liveness and `/ready` as dependency-aware 200/503 response; verify missing app failure.
- [ ] Assert `/health` returns status 200, JSON content type, `{ status: "ok" }`; assert `/ready` returns 200 with `{ status: "ready", dependencies: { postgres: "up", redis: "up" } }` or 503 with `status: "not_ready"` and individual `up/down` values.
- [ ] Run `pnpm --filter @zamanushka/api test -- routes.test.ts`; expect FAIL because `buildApp` and health routes are missing.
- [ ] GREEN: implement an app factory with injected `ReadinessProbe` interfaces and operational routes only.
- [ ] Define `ReadinessProbe = { name: "postgres" | "redis"; check(): Promise<boolean> }`; routes consume shared Zod-backed DTOs.
- [ ] Add structured logging and a placeholder graceful-shutdown entrypoint without product routes. Keep the app factory injectable; defer live-client imports and wiring to Task 5.
- [ ] Run API tests/typecheck and commit.

### Task 5: Prisma 7 and real readiness adapters

**Files:**

- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, `apps/api/src/generated/.gitkeep`
- Create: `apps/api/src/infrastructure/prisma.ts`, `apps/api/src/infrastructure/redis.ts`, `apps/api/src/health/live-dependencies.ts`
- Create: `apps/api/src/health/live-dependencies.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/package.json`

- [ ] Add dependencies `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `@types/pg`, `redis`, and `dotenv`; API remains ESM (`"type": "module"`).
- [ ] RED: test probes call injected `queryRaw`/`ping` clients and map success/failure independently; run `pnpm --filter @zamanushka/api test -- live-dependencies.test.ts` and expect missing probe factories.
- [ ] GREEN: add PostgreSQL `SELECT 1` and Redis `PING` probes using long-lived process-owned clients. Readiness requests never disconnect them; Fastify shutdown disconnects each exactly once.
- [ ] Configure `prisma.config.ts` with `schema: "prisma/schema.prisma"`, migration path, and datasource `env("DATABASE_URL")` after `import "dotenv/config"`.
- [ ] Configure schema with `datasource db { provider = "postgresql" }` and `generator client { provider = "prisma-client"; output = "../src/generated/prisma"; moduleFormat = "esm" }`; add no product models.
- [ ] Instantiate `PrismaPg({ connectionString: env.DATABASE_URL })`, then generated `PrismaClient({ adapter })`; create a Redis client from `REDIS_URL`.
- [ ] Wire live clients/probes into `server.ts` and `buildApp`, and close them via Fastify `onClose`.
- [ ] Run `pnpm --filter @zamanushka/api exec prisma validate --config prisma.config.ts`; expect valid schema.
- [ ] Run `pnpm --filter @zamanushka/api exec prisma generate --config prisma.config.ts`; expect generated client under `src/generated/prisma`.
- [ ] Run focused tests and `pnpm --filter @zamanushka/api typecheck`; expect exit 0.
- [ ] Commit infrastructure adapters.

### Task 6: React/Vite app shell

**Files:**

- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/tsconfig.node.json`, `apps/web/vite.config.ts`, `apps/web/index.html`
- Create: `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, `apps/web/src/app.test.tsx`, `apps/web/src/styles.css`, `apps/web/src/vite-env.d.ts`

- [ ] RED: render the future-facing Russian shell and assert brand, EPIC-00 status, and accessible main region; verify failure.
- [ ] Run `pnpm --filter @zamanushka/web test -- app.test.tsx`; expect FAIL because `App` is missing.
- [ ] GREEN: implement a minimal responsive shell using only placeholder foundation tokens.
- [ ] Ensure no final home screen, gameplay, auth, chat, profile, or functional skin UI is present.
- [ ] Run web tests/typecheck/build and commit.

### Task 7: Local infrastructure and operator documentation

**Files:**

- Create: `infra/docker-compose.yml`, `README.md`, `docs/REFERENCES.md`
- Modify: `.env.example`

- [ ] Define `postgres:17-alpine` and `redis:8-alpine` with healthchecks, named volumes, explicit `5432`/`6379` local ports, and development-only values sourced from `.env` defaults.
- [ ] Document prerequisites, install, environment setup, Prisma generation, Compose lifecycle, development commands, endpoint semantics, full verification, and EPIC-00 exclusions.
- [ ] Inventory: `ChatGPT Image 18 авг. 2026 г., 20_57_18.png` 1024x1536 (primary multi-screen mobile/gameplay), `ChatGPT Image 18 авг. 2026 г., 20_57_40.png` 1055x1491 (primary flow/density/board/pawns), and six 1181x2560 material references: `photo_2026-08-17_21-22-39.jpg` warm brown, `...41.jpg` black-white, `...42.jpg` dark-cream frame, `...46.jpg` tactile cloth only, `...47.jpg` burgundy, `...49.jpg` wood grain/frame.
- [ ] Run `docker compose --env-file .env.example -f infra/docker-compose.yml config`; expect exit 0 and both services.
- [ ] Commit infrastructure/docs with `git add infra README.md docs/REFERENCES.md .env.example && git commit -m "docs: add local development workflow"`.

### Task 8: Full verification and smoke tests

**Files:**

- Modify only files required to fix failures, always with a failing regression test before production-code changes.

- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; every command must exit 0.
- [ ] Copy `.env.example` to an untracked root `.env`; API scripts load it through an explicit root path rather than relying on filtered-pnpm current directory. Start dependencies with `docker compose --env-file .env -f infra/docker-compose.yml up -d postgres redis`.
- [ ] Run `docker compose --env-file .env -f infra/docker-compose.yml ps`; expect both services `healthy` (poll for at most 60 seconds).
- [ ] Run `pnpm --filter @zamanushka/api prisma:validate` and `pnpm --filter @zamanushka/api prisma:generate` with `.env` loaded; expect exit 0.
- [ ] Start `pnpm --filter @zamanushka/api start` on `127.0.0.1:3001`; poll `/health` for at most 30 seconds.
- [ ] Request `/health`; assert HTTP 200 and exact `{ "status": "ok" }`.
- [ ] Request `/ready`; assert HTTP 200, `status=ready`, `postgres=up`, and `redis=up`.
- [ ] Stop only Redis with `docker compose --env-file .env -f infra/docker-compose.yml stop redis`; assert `/health` remains 200 and `/ready` becomes 503 with `redis=down`; restart Redis and assert readiness returns 200.
- [ ] Start `pnpm --filter @zamanushka/web preview --host 127.0.0.1 --port 4173`; poll `http://127.0.0.1:4173` and assert HTTP 200 plus visible `Заманушка` and `EPIC-00` text.
- [ ] Capture browser screenshots to `artifacts/visual-qa/epic-00/` at 390x844, 430x932, 1440x900, and 1920x1080. Compare board/shell hierarchy, graphite/gold restraint, spacing, and desktop-vs-mobile composition to the two primary references; record observations in `artifacts/visual-qa/epic-00/README.md`. Because EPIC-00 has no board/game screen, document that only shell composition is assessed. Commit the README and screenshots as EPIC evidence.
- [ ] Stop only processes started for smoke tests; preserve Docker data unless explicitly requested otherwise.
- [ ] After any smoke-test fix, rerun the complete `format:check`, lint, typecheck, tests, and build suite.
- [ ] Run `git diff --check`, inspect scope against EPIC-00, and commit final fixes.
- [ ] Produce the required report sections: specification status, implemented files/features, backend, frontend, game logic, realtime, tests, verification checklist, project tree, risks/notes, explicit out-of-scope list, and `STOPPED BEFORE EPIC-01`.
- [ ] STOP before EPIC-01.
