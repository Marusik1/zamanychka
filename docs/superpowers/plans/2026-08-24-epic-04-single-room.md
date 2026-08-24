# EPIC-04 — Single Persistent Game Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the one persistent MVP game room that manages seats, readiness, current active match references, and match lifecycle orchestration without duplicating EPIC-03 gameplay rules.

**Architecture:** The room layer is a thin application module in `apps/api` that persists a single durable room/table, serializes room mutations, and starts matches by calling the existing pure game-engine factory. Room state and match state remain separate: the room owns seat availability, readiness, presence, and the current match pointer, while each match owns the authoritative gameplay snapshot, events, and result.

**Tech Stack:** TypeScript, `apps/api`, `packages/game-engine`, `packages/shared`, Prisma, PostgreSQL, Vitest, integration tests, deterministic transaction tests.

---

### Task 1: Room domain model and persistence contracts

**Files:**
- Create: `apps/api/src/rooms/domain/room-types.ts`
- Create: `apps/api/src/rooms/domain/room-contracts.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/rooms.ts` or equivalent shared contract file if one already exists
- Test: `apps/api/src/rooms/domain/room-contracts.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover the room model shape and public DTO/contracts for:
- a single persistent room;
- participant roster entries with seat assignment and readiness;
- ephemeral connected/presence flag;
- explicit `currentMatchId`;
- command/response shapes for `TAKE_SEAT`, `LEAVE_SEAT`, `SET_READY`, `START_MATCH`, and reconnect.

- [ ] **Step 2: Run the focused contract tests**

Run: `pnpm -C apps/api test -- room-contracts`

Expected: fail until the contracts are implemented.

- [ ] **Step 3: Implement the minimal contracts**

Define the room DTOs and internal types required by EPIC-04. Keep them narrow: no room lists, no invites, no discovery, no multi-room fields, no host/owner role, and no gameplay rules.

- [ ] **Step 4: Run the focused contract tests again**

Run: `pnpm -C apps/api test -- room-contracts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rooms/domain/room-types.ts apps/api/src/rooms/domain/room-contracts.ts packages/shared/src/index.ts
git commit -m "feat(rooms): add single-room domain contracts"
```

### Task 2: Room persistence schema and repository

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/rooms/room-repository.ts`
- Create: `apps/api/src/rooms/room-repository.test.ts`
- Create: `apps/api/src/rooms/room-mapper.ts`

- [ ] **Step 1: Write the failing repository tests**

Cover:
- loading the single room;
- creating the room row if absent;
- updating roster, readiness, presence, and `currentMatchId`;
- matching room state to and from persistence;
- atomic seat updates.

- [ ] **Step 2: Run the focused repository tests**

Run: `pnpm -C apps/api test -- room-repository`

Expected: fail until schema and repository exist.

- [ ] **Step 3: Implement the minimal schema/repository**

Add only the columns needed for the single room MVP. Keep the model deliberately small and separate from match tables.

- [ ] **Step 4: Run the focused repository tests again**

Run: `pnpm -C apps/api test -- room-repository`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/rooms/room-repository.ts apps/api/src/rooms/room-repository.test.ts apps/api/src/rooms/room-mapper.ts
git commit -m "feat(rooms): persist the single game room"
```

### Task 3: Seat lifecycle, readiness, and presence handling

**Files:**
- Create: `apps/api/src/rooms/room-service.ts`
- Create: `apps/api/src/rooms/room-service.test.ts`
- Modify: `apps/api/src/auth/*` only if required to expose authenticated user identity to room operations

- [ ] **Step 1: Write the failing seat/presence tests**

Cover:
- take seat into one free slot;
- reject duplicate seat claims deterministically;
- leave seat before start;
- set ready/unready for the seated participant;
- reconnect reattaches the same authenticated user to the same seat;
- disconnect does not release the seat;
- disconnect does not clear readiness;
- seat blocked by a disconnected participant still counts as occupied.

- [ ] **Step 2: Run the focused room-service tests**

Run: `pnpm -C apps/api test -- room-service`

Expected: fail until the lifecycle service is implemented.

- [ ] **Step 3: Implement seat lifecycle rules**

Implement a single-room service that updates persistence through one serialized room state boundary. Keep presence ephemeral and separate from durable seat/ready state. This task also owns `SET_READY` business logic.

- [ ] **Step 4: Run the focused room-service tests again**

Run: `pnpm -C apps/api test -- room-service`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rooms/room-service.ts apps/api/src/rooms/room-service.test.ts
git commit -m "feat(rooms): implement single-room seat lifecycle"
```

### Task 4: Explicit start-match orchestration

**Files:**
- Create: `apps/api/src/rooms/start-match.ts`
- Create: `apps/api/src/rooms/start-match.test.ts`
- Create: `apps/api/src/rooms/first-player-selection.ts`
- Modify: `apps/api/src/rooms/room-service.ts`
- Modify: `apps/api/src/rooms/room-repository.ts`
- Modify: `packages/game-engine/src/domain/create-active-game-state.ts` only if a contract mismatch is exposed

- [ ] **Step 1: Write the failing start-match tests**

Cover:
- `START_MATCH` is explicit;
- any seated participant may start;
- start fails if not all seated participants are READY;
- start fails if any seated participant is disconnected;
- start fails if an active match already exists;
- start creates exactly one durable match;
- concurrent start attempts resolve so only one match is created;
- `firstPlayerId` is selected by the server from seated participants;
- `createActiveGameState(...)` receives the already selected `firstPlayerId`.

- [ ] **Step 2: Run the focused start-match tests**

Run: `pnpm -C apps/api test -- start-match`

Expected: fail until orchestration exists.

- [ ] **Step 3: Implement atomic start-match orchestration**

Use the room repository transaction boundary to serialize `START_MATCH`, create the durable match, persist `currentMatchId`, and call `createActiveGameState(...)` with the server-selected `firstPlayerId`.

- [ ] **Step 4: Run the focused start-match tests again**

Run: `pnpm -C apps/api test -- start-match`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rooms/start-match.ts apps/api/src/rooms/start-match.test.ts apps/api/src/rooms/first-player-selection.ts apps/api/src/rooms/room-service.ts apps/api/src/rooms/room-repository.ts
git commit -m "feat(rooms): add explicit single-room match start"
```

### Task 5: Room-to-match lifecycle after terminal game completion

**Files:**
- Create: `apps/api/src/rooms/match-completion.ts`
- Create: `apps/api/src/rooms/match-completion.test.ts`
- Modify: `apps/api/src/rooms/room-service.ts`
- Modify: `apps/api/src/rooms/room-repository.ts`

- [ ] **Step 1: Write the failing post-match lifecycle tests**

Cover:
- room remains the same persistent table after a match ends;
- `currentMatchId` clears on terminal match completion;
- room returns to waiting state after a terminal match;
- a new match can start afterward using the same room;
- match identity remains durable and separate from the room.
 - all seats become empty when the terminal match completes;
 - READY state is cleared with the seats;
 - disconnected and connected participants alike lose their seats as part of the post-match reset;
 - rematch requires TAKE_SEAT + SET_READY again.

- [ ] **Step 2: Run the focused lifecycle tests**

Run: `pnpm -C apps/api test -- match-completion`

Expected: fail until lifecycle handling exists.

- [ ] **Step 3: Implement terminal-match room reset**

Clear the active match pointer and restore waiting-room state only. Do not mutate game-engine state or invent gameplay rules.

- [ ] **Step 4: Run the focused lifecycle tests again**

Run: `pnpm -C apps/api test -- match-completion`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rooms/match-completion.ts apps/api/src/rooms/match-completion.test.ts apps/api/src/rooms/room-service.ts apps/api/src/rooms/room-repository.ts
git commit -m "feat(rooms): reset single room after match completion"
```

### Task 6: API routes and guard wiring

**Files:**
- Create: `apps/api/src/rooms/routes.ts`
- Create: `apps/api/src/rooms/routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts` if route registration requires it
- Modify: `packages/shared` room schemas if needed

- [ ] **Step 1: Write the failing route tests**

Cover:
- take seat;
- leave seat;
- set ready;
- start match;
- reconnect presence behavior if surfaced via API;
- deterministic conflict responses for simultaneous seat claims and start attempts;
- no room list/search/invite/public-private endpoints exist.

- [ ] **Step 2: Run the focused route tests**

Run: `pnpm -C apps/api test -- rooms routes`

Expected: fail until the routes are wired.

- [ ] **Step 3: Implement the routes**

Wire the route handlers to the room service and keep all room state mutations behind the serialized repository boundary.

- [ ] **Step 4: Run the focused route tests again**

Run: `pnpm -C apps/api test -- rooms routes`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rooms/routes.ts apps/api/src/rooms/routes.test.ts apps/api/src/app.ts
git commit -m "feat(rooms): wire single-room API routes"
```

### Task 7: Cross-rule and concurrency hardening

**Files:**
- Create: `apps/api/src/rooms/room-concurrency.test.ts`
- Modify: `apps/api/src/rooms/*` as needed
- Modify: `apps/api/src/rooms/*` tests as needed

- [ ] **Step 1: Write the failing cross-rule tests**

Cover:
- two users race for the same seat;
- two users race to start the match;
- disconnected pre-start participant blocks start;
- reconnect restores eligibility;
- no active match can be started twice;
- room state remains deterministic under repeated execution.

- [ ] **Step 2: Run the focused concurrency tests**

Run: `pnpm -C apps/api test -- room-concurrency`

Expected: fail until race handling is covered.

- [ ] **Step 3: Harden the concurrency boundary**

Make sure all racing room mutations resolve through the same serialized durable state path. Use PostgreSQL as the correctness boundary, not Redis.

- [ ] **Step 4: Run the focused concurrency tests again**

Run: `pnpm -C apps/api test -- room-concurrency`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rooms/room-concurrency.test.ts apps/api/src/rooms
git commit -m "feat(rooms): harden single-room concurrency"
```

### Task 8: Final EPIC-04 verification

**Files:**
- All EPIC-04 room files

- [ ] **Step 1: Run targeted package verification**

Run:
- `pnpm -C apps/api test`
- `pnpm -C apps/api typecheck`
- `pnpm -C packages/shared test`
- `pnpm -C packages/shared typecheck`
- `pnpm -C packages/game-engine test`
- `pnpm -C packages/game-engine typecheck`

Expected: PASS.

- [ ] **Step 2: Run repo verification gates**

Run the canonical repository gates from the root:
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

Expected: PASS.

- [ ] **Step 3: Final review**

Check the implementation against the EPIC-04 spec and confirm:
- single-room invariant;
- Room != Match;
- no multi-room behavior;
- no gameplay rule duplication;
- explicit `START_MATCH`;
- deterministic seat and first-player handling;
- reconnect and disconnected-seat behavior;
- deterministic race outcomes.

- [ ] **Step 4: Commit final checkpoint**

```bash
git add .
git commit -m "feat(rooms): implement EPIC-04 single persistent room"
```

