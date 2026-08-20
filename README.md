# Заманушка

Telegram-first online board game. The repository currently implements the verified foundation plus EPIC-01 Telegram/development authentication. Game rules, rooms, realtime gameplay, chat, profiles, ratings, history, boards, and board skins are not implemented.

## Requirements

- Node.js 24+
- pnpm 10.32.1
- Docker Desktop with Docker Compose

## Initial setup

```powershell
Copy-Item .env.example .env
pnpm install
pnpm prisma:generate
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres redis
pnpm --filter @zamanushka/api exec prisma migrate deploy --config prisma.config.ts
```

`.env.example` contains local-only placeholders and two allowlisted development users. Never commit `.env`, a Telegram bot token, raw Telegram init data, or a session cookie/token.

## Authentication configuration

The default example runs development-only authentication:

```dotenv
NODE_ENV=development
DEV_AUTH_ENABLED=true
DEV_AUTH_USERS_JSON=[{"devUserKey":"player-1","displayName":"Player One"},{"devUserKey":"player-2","displayName":"Player Two"}]
APP_ORIGINS=http://127.0.0.1:5173
SESSION_TTL_SECONDS=2592000
```

Set `DEV_AUTH_ENABLED=false` to run Telegram mode outside production, and supply a real `TELEGRAM_BOT_TOKEN` only through the local environment or secret manager. Production always selects Telegram mode, rejects `DEV_AUTH_ENABLED=true`, requires canonical HTTPS `APP_ORIGINS`, and requires the bot token.

Telegram verifier bounds are configurable with `TELEGRAM_INIT_DATA_MAX_BYTES` (default 16384), `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` (default 300), and `TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS` (default 30). Infrastructure also requires `DATABASE_URL` and `REDIS_URL`. `API_HOST` and `API_PORT` default to `127.0.0.1` and `3001` in `.env.example`.

Development/test origins must be explicit canonical loopback HTTP origins. Production origins must be explicit canonical HTTPS origins. Wildcards, credentials, paths, queries, fragments, and `null` origins are rejected.

## Run API and web

Start both applications from the repository root. The explicit proxy target is required because Vite's internal fallback is port 3000 while `.env.example` starts the API on port 3001:

```powershell
$env:VITE_API_TARGET = 'http://127.0.0.1:3001'
pnpm dev
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`
- Liveness: `GET /health` reports that the process is running and does not depend on PostgreSQL or Redis.
- Readiness: `GET /ready` checks PostgreSQL and Redis and returns 503 when either dependency is unavailable.

The web client always calls `/api/me` first. In the default local mode, open the web URL in two independent cookie jars—for example, a normal browser window and a private window—and choose `Player One` in one and `Player Two` in the other. They create distinct internal users and independent sessions. Signing out in one jar revokes only that jar's current session.

For separate terminals instead of `pnpm dev`:

```powershell
pnpm --filter @zamanushka/api dev
```

```powershell
$env:VITE_API_TARGET = 'http://127.0.0.1:3001'
pnpm --filter @zamanushka/web dev
```

## Isolated test database

Integration tests use the dedicated `postgres_test` service on host port 5433. The Prisma test configuration and test cleanup refuse any database whose name does not end in `_test`; they never reset the development database.

Set `TEST_DATABASE_URL` in every new PowerShell session that runs test migration or integration commands:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://zamanushka:zamanushka_local@127.0.0.1:5433/zamanushka_test'
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres_test
docker compose --env-file .env -f infra/docker-compose.yml ps postgres_test
pnpm --filter @zamanushka/api exec prisma migrate deploy --config prisma.test.config.ts
pnpm --filter @zamanushka/api test:integration
```

Use `migrate deploy`; do not run `prisma migrate reset` against either database. Apply committed migrations to the development database with:

```powershell
pnpm --filter @zamanushka/api exec prisma migrate deploy --config prisma.config.ts
```

## Verification available now

```powershell
pnpm exec prettier --check README.md docs/TELEGRAM.md docs/epics/EPIC-01-TELEGRAM-AUTH.md
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @zamanushka/api test:integration
pnpm build
pnpm prisma:validate
pnpm prisma:generate
git diff --check
```

Executable EPIC-01 auth smoke scripts are available through `pnpm smoke:auth -- --mode=development`,
`pnpm smoke:auth -- --mode=telegram`, and `pnpm smoke:production-guard`. The four required browser
captures and command-by-command verification record are stored in
`artifacts/visual-qa/epic-01/README.md`.

## Workspace

```text
apps/api                 Fastify API, auth, persistence, and dependency probes
apps/web                 React/Vite Telegram and browser auth bootstrap
packages/config          strict shared TypeScript configuration
packages/shared          validated operational and authentication contracts
packages/ui              foundation shell primitive and tokens
packages/game-engine     empty boundary; rules begin only in EPIC-03
infra                    local PostgreSQL, isolated test PostgreSQL, and Redis
docs                     canonical product, architecture, and operator documentation
references               user-provided canonical visual references
```

Preserve `/references` byte-for-byte. EPIC-01 must stop after its verification and report; EPIC-02 requires separate explicit approval.
