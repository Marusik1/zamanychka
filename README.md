# Заманушка

Telegram-first online board game. The repository currently contains only the verified EPIC-00 foundation; authentication, game rules, realtime gameplay, chat, profiles, and board skins are intentionally not implemented yet.

## Requirements

- Node.js 24+
- pnpm 10.32.1
- Docker Desktop with Docker Compose

## Setup

```powershell
Copy-Item .env.example .env
pnpm install
pnpm prisma:generate
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres redis
```

The checked-in `.env.example` contains local-only defaults. Never commit `.env` or real credentials.

## Development

```powershell
pnpm dev
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`
- Liveness: `GET /health` — process is running, independent of dependencies.
- Readiness: `GET /ready` — PostgreSQL and Redis are reachable; returns 503 when either is down.

## Verification

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm prisma:validate
docker compose --env-file .env -f infra/docker-compose.yml ps
```

## Workspace

```text
apps/api                 Fastify operational API and dependency probes
apps/web                 React/Vite foundation shell
packages/config          strict shared TypeScript configuration
packages/shared          validated shared operational contracts
packages/ui              placeholder shell primitive and foundation tokens
packages/game-engine     empty boundary; rules begin only in EPIC-03
infra                    local PostgreSQL and Redis
docs                     canonical product and architecture specification
references               user-provided visual references
```

## EPIC-00 exclusions

No Telegram authorization, pawn movement, game engine, matchmaking, Socket.IO gameplay, chat, profiles, statistics, results, or functional board-skin selection is present. Work must stop before EPIC-01 until the user explicitly approves continuation.
