# Architecture

## Stack

- pnpm monorepo
- React, TypeScript, Vite
- Fastify and Socket.IO
- Prisma and PostgreSQL
- Redis
- Zustand, TanStack Query, Zod
- animation library selected during the relevant UI epic

## Repository boundaries

```text
apps/web               Telegram-first web client
apps/api               HTTP and realtime application
packages/game-engine   pure rules engine
packages/shared        schemas, DTOs, event contracts, shared types
packages/ui            tokens and reusable UI primitives
packages/config        shared tooling configuration
infra                  local infrastructure
```

The API is a modular monolith with explicit modules for auth, users, rooms, matchmaking, games, realtime, chat, profiles, ratings, and board skins. Transport handlers contain no game rules.

## Authoritative command flow

```text
client intent
→ authenticate / authorize / validate
→ begin transaction
→ SELECT match FOR UPDATE
→ check idempotency and expected state version
→ server RNG when required
→ game-engine transition
→ persist snapshot, events, processed action, results
→ commit
→ ACK sender
→ broadcast committed events
```

Commands for one match are serialized. PostgreSQL row locking is the correctness boundary; an in-process per-match queue may reduce contention but cannot replace the transaction.

## Authority rules

- Client submits intent only.
- Dice is generated server-side.
- PostgreSQL is durable truth.
- Redis may cache but must never exclusively store dice, pawn positions, current turn, winner, final result, or rating result.
- Commit always precedes ACK and broadcast.
