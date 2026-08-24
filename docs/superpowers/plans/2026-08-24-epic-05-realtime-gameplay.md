# EPIC-05 — Realtime Gameplay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement transactional realtime gameplay command processing with durable idempotency, ordered event publication, reconnect recovery, and atomic EPIC-04 terminal room reset integration.

**Architecture:** `apps/api` owns orchestration, persistence, command guards, server RNG, outbox publication, reconnect/sync, and Socket.IO fan-out. `packages/game-engine` remains the pure gameplay authority. PostgreSQL is the correctness boundary; Redis is only ephemeral transport/fan-out infrastructure. Terminal game completion must reuse the EPIC-04 room reset boundary inside the same PostgreSQL transaction whenever the repository can support it.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, Prisma, Socket.IO, Redis adapter/fan-out, existing `packages/game-engine`, existing `packages/shared`, Vitest.

---

### Task 1: Canonical realtime contracts and shared envelope types

**Files:**
- Modify: `packages/shared/src/*` or the existing shared contract module(s)
- Modify: `apps/api/src/realtime/*` domain types if the repository keeps some transport-specific contracts private
- Test: `packages/shared/src/**/*.test.ts` or the existing shared contract tests

- [ ] **Step 1: Write the failing tests**

Cover:
- command envelope shape for `ROLL_DICE`, `ENTER_PAWN`, `MOVE_PAWN`, `SURRENDER`, and `game:sync`;
- discriminated success/error result contract;
- durable command identity fields (`matchId`, `actionId`, `expectedStateVersion`);
- replay-safe event envelope fields (`matchId`, `stateVersion`, `sequence`, `events`);
- no client-controlled authoritative fields (`actorPlayerId`, dice, first player, seat order, snapshot).

- [ ] **Step 2: Run the focused contract tests**

Run: `pnpm -C packages/shared test -- realtime`
Expected: fail until the contracts exist.

- [ ] **Step 3: Implement the minimal contracts**

Add or extend the canonical shared schemas/types for:
- command envelopes;
- command results;
- event envelopes;
- sync request/response envelopes;
- ACK/publication metadata.

Keep the contracts narrow and transport-neutral. Do not add gameplay rules here.

- [ ] **Step 4: Run the focused tests again**

Run: `pnpm -C packages/shared test -- realtime`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/api
git commit -m "feat: add EPIC-05 realtime contracts"
```

---

### Task 2: Match persistence model for snapshots, events, actions, and outbox rows

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/match/*` or the existing match persistence module(s)
- Modify: `apps/api/src/realtime/*` persistence adapters if needed
- Test: `apps/api/src/match/*.test.ts` or the repository’s existing integration-test location

- [ ] **Step 1: Write the failing tests**

Cover:
- current authoritative match snapshot is stored as the latest version only;
- ordered per-match events are append-only;
- processed actions are durable and unique by `matchId + actionId`;
- outbox rows persist in the same transaction as the match update;
- terminal match state stays durable after room reset.

- [ ] **Step 2: Run the focused persistence tests**

Run: `pnpm -C apps/api test -- match`
Expected: fail until the schema/repository exists.

- [ ] **Step 3: Implement the minimal schema/repository changes**

Add the smallest persistence shape needed for:
- current match snapshot;
- ordered event journal;
- processed action records;
- transactional outbox rows;
- terminal result fields.

Do not add extra history tables unless the approved repository pattern already requires them.

- [ ] **Step 4: Regenerate/validate Prisma if needed**

Run: `pnpm -C apps/api prisma:generate`
Expected: PASS

- [ ] **Step 5: Re-run the focused tests**

Run: `pnpm -C apps/api test -- match`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/match apps/api/src/realtime
git commit -m "feat: add EPIC-05 match persistence model"
```

---

### Task 3: Transactional command processor and idempotency

**Files:**
- Modify: `apps/api/src/realtime/command-processor.ts` or equivalent
- Modify: `apps/api/src/realtime/idempotency.ts` or equivalent
- Modify: `apps/api/src/realtime/command-guards.ts` or equivalent
- Test: `apps/api/src/realtime/*.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- exact retry returns original committed success;
- conflicting fingerprint fails with the dedicated conflict error;
- stale `expectedStateVersion` fails without mutation;
- exact same command does not rerun RNG or game-engine after commit;
- failed commands preserve durable state exactly.

- [ ] **Step 2: Run the focused tests**

Run: `pnpm -C apps/api test -- realtime`
Expected: fail until processor logic exists.

- [ ] **Step 3: Implement the transactional pipeline**

Implement:
- session-authenticated actor identity;
- PostgreSQL row lock on the authoritative match;
- `ProcessedAction` lookup before terminal/state validation for exact retry replay;
- fingerprint comparison and conflict handling;
- `expectedStateVersion` validation inside the lock;
- server-side dice RNG only for `ROLL_DICE`;
- pure engine transition invocation;
- terminal-match detection and room-reset boundary hook.

- [ ] **Step 4: Re-run the focused tests**

Run: `pnpm -C apps/api test -- realtime`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/realtime
git commit -m "feat: add EPIC-05 transactional command processor"
```

---

### Task 4: Terminal transaction integration with EPIC-04 room reset

**Files:**
- Modify: `apps/api/src/rooms/*` integration boundary
- Modify: `apps/api/src/realtime/command-processor.ts`
- Modify: `apps/api/src/rooms/room-repository.ts` or equivalent
- Test: `apps/api/src/rooms/*.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- terminal command persists match snapshot/result/events/action/outbox and resets the matching room in one PostgreSQL transaction;
- stale terminal completion cannot clear a newer match;
- exact retry of the winning terminal command returns the original success;
- room reset clears currentMatchId, seats, and READY only for the matching match.

- [ ] **Step 2: Run the focused tests**

Run: `pnpm -C apps/api test -- room`
Expected: fail until the terminal integration exists.

- [ ] **Step 3: Implement the room-reset boundary reuse**

Reuse the approved EPIC-04 repository/application behavior rather than duplicating room lifecycle rules in EPIC-05.
Ensure the transaction verifies `room.currentMatchId == terminalMatchId` before clearing the singleton room state.

- [ ] **Step 4: Re-run the focused tests**

Run: `pnpm -C apps/api test -- room`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rooms apps/api/src/realtime
git commit -m "feat: integrate EPIC-05 terminal room reset"
```

---

### Task 5: Ordered event journal and outbox publishing

**Files:**
- Modify: `apps/api/src/realtime/event-journal.ts` or equivalent
- Modify: `apps/api/src/realtime/outbox.ts` or equivalent
- Modify: `apps/api/src/realtime/outbox-dispatcher.ts` or equivalent
- Test: `apps/api/src/realtime/*.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- deterministic per-match sequence assignment;
- append-only ordered event journal;
- outbox row persisted in the same transaction;
- safe claim/lease behavior with multi-worker dispatch;
- duplicate publish is tolerated and deduplicated by clients;
- ACK replay comes from `ProcessedAction`, not from outbox delivery.

- [ ] **Step 2: Run the focused tests**

Run: `pnpm -C apps/api test -- realtime`
Expected: fail until journal/outbox dispatch exists.

- [ ] **Step 3: Implement the journal/outbox writer and dispatcher**

Add:
- deterministic event ordering metadata;
- outbox claim/lease handling with a safe retry path;
- post-commit publish payloads for ACK and broadcast channels;
- publication status update after successful dispatch.

Keep Socket.IO transport-only; do not invent new product behavior.

- [ ] **Step 4: Re-run the focused tests**

Run: `pnpm -C apps/api test -- realtime`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/realtime
git commit -m "feat: add EPIC-05 ordered event journal and outbox"
```

---

### Task 6: Socket.IO publication and match subscriptions

**Files:**
- Modify: `apps/api/src/realtime/socketio/*` or equivalent
- Modify: `apps/api/src/realtime/publication/*` or equivalent
- Test: `apps/api/src/realtime/*.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- authenticated match subscription;
- duplicate Socket.IO envelopes are tolerated;
- out-of-order delivery does not mutate state;
- instance B can receive a publish fan-out from instance A through the distributed adapter;
- network ACK is not a durability signal.

- [ ] **Step 2: Run the focused tests**

Run: `pnpm -C apps/api test -- realtime`
Expected: fail until publication wiring exists.

- [ ] **Step 3: Implement the publish/subscribe wiring**

Use the repository’s existing Socket.IO and Redis adapter pattern to fan out committed events post-commit.
Keep transport concerns isolated from command processing.

- [ ] **Step 4: Re-run the focused tests**

Run: `pnpm -C apps/api test -- realtime`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/realtime
git commit -m "feat: add EPIC-05 Socket.IO publication"
```

---

### Task 7: Reconnect, game:sync, gap detection, and version watchdog

**Files:**
- Modify: `apps/api/src/realtime/sync/*` or equivalent
- Modify: `apps/api/src/realtime/watchdog/*` or equivalent
- Modify: client-facing replay metadata only if the repository already has a narrow surface for it
- Test: `apps/api/src/realtime/*.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- `game:sync` returns ordered continuous transition envelopes when the range is available;
- `game:sync` falls back to the authoritative snapshot when the range is unsafe or missing;
- reconnect tolerates broadcast arriving while sync is in progress;
- the watchdog is independently periodic and detects missed-broadcast divergence;
- gap detection forces sync rather than applying a broken delta chain.

- [ ] **Step 2: Run the focused tests**

Run: `pnpm -C apps/api test -- realtime`
Expected: fail until sync/watchdog exists.

- [ ] **Step 3: Implement sync and watchdog behavior**

Add:
- durable client watermark handling;
- sync decision logic;
- snapshot fallback;
- safe buffering/deduplication during reconnect.

- [ ] **Step 4: Re-run the focused tests**

Run: `pnpm -C apps/api test -- realtime`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/realtime
git commit -m "feat: add EPIC-05 sync and watchdog recovery"
```

---

### Task 8: Final EPIC-05 verification and hardening

**Files:**
- Modify only files required by real failures surfaced in this task
- Test: repository-wide and package-level tests

- [ ] **Step 1: Run the focused package gates**

Run:
- `pnpm -C apps/api test`
- `pnpm -C apps/api typecheck`
- `pnpm -C packages/shared test`
- `pnpm -C packages/shared typecheck`
- `pnpm -C packages/game-engine test`
- `pnpm -C packages/game-engine typecheck`

Expected: PASS

- [ ] **Step 2: Run the full repository gates**

Run:
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

Expected: PASS

- [ ] **Step 3: Run final independent reviews**

Review against:
- `docs/superpowers/specs/2026-08-24-epic-05-realtime-gameplay.md`
- `docs/GAME_ENGINE.md`
- `docs/MATCH_STATE_MACHINE.md`
- `docs/TESTING.md`
- `docs/ARCHITECTURE.md`

Focus on:
- terminal transaction atomicity;
- exact retry behavior after terminal success;
- idempotency fingerprint semantics;
- failure idempotency;
- outbox crash windows;
- multi-instance fan-out;
- missed-broadcast recovery;
- sync/subscription races;
- Room vs Match authorization;
- EPIC-03/04 responsibility leakage.

- [ ] **Step 4: Fix only real EPIC-05 defects**

If any failure is found, fix only the EPIC-05 defect, rerun the affected focused gates, then rerun the full gates if the fix touched final-gate-relevant files.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/shared docs/superpowers/specs/2026-08-24-epic-05-realtime-gameplay.md
git commit -m "feat: complete EPIC-05 realtime gameplay"
```

---

## Implementation notes

- Do not introduce room creation, matchmaking, spectators, or any additional product state.
- Do not move gameplay legality into `apps/api`; the engine remains authoritative.
- Do not assume exactly-once delivery anywhere.
- Do not weaken the terminal transaction boundary if EPIC-04 integration can be done in one PostgreSQL transaction.
- Keep command-processing logic, publication logic, and sync/recovery logic in separate modules so each task can be reviewed independently.
