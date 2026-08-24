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

The API is a modular monolith with explicit modules for auth, users, a single persistent room/table, games, realtime, chat, profiles, ratings, and board skins. Transport handlers contain no game rules.

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
→ persist transactional outbox record
→ commit
→ ACK sender and outbox dispatcher independently deliver committed truth
```

Commands for one match are serialized. PostgreSQL row locking is the correctness boundary; an in-process per-match queue may reduce contention but cannot replace the transaction.

## Authority rules

- Client submits intent only.
- Dice is generated server-side.
- PostgreSQL is durable truth.
- Redis may cache but must never exclusively store dice, pawn positions, current turn, winner, final result, or rating result.
- Commit always precedes ACK and broadcast.

## Publication reliability

The database outbox is the durable publication source. Workers claim committed rows safely and publish transition envelopes. ACK and broadcast are both strictly post-commit but may race with each other; neither is the durability mechanism. Unique match/version keys prevent duplicate logical transitions; duplicate network delivery remains allowed and clients deduplicate by sequence. Cross-instance delivery may arrive out of order, so clients never apply a gap. While a match is active, clients periodically compare a lightweight server version watermark and invoke `game:sync` on divergence. This watchdog closes the commit-before-broadcast crash window even when no later gameplay traffic occurs.
