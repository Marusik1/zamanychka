# Beta Multi-Room Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the singleton lobby assumption with durable multi-room membership, complete room lifecycle UI, and genuine terminal game-flow verification without changing gameplay or realtime authority.

**Architecture:** Extend the existing Room aggregate with `RoomMembership`, per-room locks, room-scoped routes, and list/detail projections. Keep Match snapshots/participants authoritative and immutable, keep PostgreSQL as the race boundary, and reuse the current web lobby/game and EPIC-05 command pipeline.

**Tech Stack:** TypeScript strict mode, Prisma/PostgreSQL, Fastify, React/Vite, Zod, Vitest, Socket.IO/Redis, `@zamanushka/game-engine`.

---

### Task 1: Forward multi-room persistence model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260830120000_add_multi_room_membership/migration.sql`
- Create: `apps/api/src/rooms/multi-room-migration.integration.test.ts`
- Modify: `apps/api/src/rooms/room-repository.ts`
- Test: `apps/api/src/rooms/room-repository.test.ts`
- Test: `apps/api/src/rooms/room-concurrency.test.ts`

- [ ] Write failing tests named `backfills valid legacy occupants without ghosts`, `rejects invalid legacy ownership`, `enforces one membership and seat membership FK`, `retains Match when room close is requested`, and `locks rooms independently`.
- [ ] Run `$env:TEST_DATABASE_URL='postgresql://zamanushka:zamanushka_local@127.0.0.1:5433/zamanushka_test'; pnpm -C apps/api test -- room-repository.test.ts room-concurrency.test.ts`; expect missing repository/model failures.
- [ ] Add `Room.status`, unique `Room.code`, `RoomMembership`, named dual Prisma relations for `Match.room` and `Room.currentMatch`, `UNIQUE(Room.currentMatchId)` real FK, RESTRICT Match history relation, and composite seat-membership relation while retaining four deterministic seats and global seat-user uniqueness. Add SQL CHECKs enforcing `ACTIVE <=> currentMatchId IS NOT NULL` and `CLOSED => currentMatchId IS NULL`.
- [ ] Write forward SQL expand/backfill/validate migration; reject invalid legacy duplicates/missing users, never delete existing Room/Match data, and make CLOSED irreversible in service transitions.
- [ ] In `multi-room-migration.integration.test.ts`, create/drop only a hard-coded local database name ending `_test_migration` after asserting host `127.0.0.1`, port `5433`, and suffix. Copy `schema.prisma`, config, migration lock, and migrations through `20260829223000` into a `mkdtemp` Prisma fixture, run migrate deploy, seed legacy users/seats/matches, copy the new migration into that fixture, and deploy again. Assert backfill/retention/constraints, then rerun deploy for ledger idempotence. A non-null seat already has a User FK; backfill only distinct non-null valid occupants and never synthesize users. Separately seed duplicate/corrupt ownership with constraints deliberately deferred in the fixture and expect the new migration to abort. Never point this fixture at development/production.
- [ ] Replace singleton-only repository primitives with `createRoom`, `listRooms`, `loadRoom(roomId)`, `loadMembershipForUser`, `withLockedRoom(roomId)`, and room-scoped persistence. Keep a temporary legacy bootstrap helper only for migration-compatible tests, not public routes.
- [ ] Run `$env:TEST_DATABASE_URL='<local *_test URL>'; pnpm -C apps/api test:integration -- multi-room-migration.integration.test.ts`, focused ordinary DB tests, `pnpm -C apps/api prisma:validate`, `pnpm -C apps/api prisma:generate`, and `pnpm -C apps/api typecheck`; expect PASS.
- [ ] Commit persistence checkpoint.

### Task 2: Shared contracts and room lifecycle service

**Files:**
- Modify: `packages/shared/src/rooms.ts`
- Modify: `packages/shared/src/rooms.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/rooms/domain.ts`
- Modify: `apps/api/src/rooms/room-service.ts`
- Test: `apps/api/src/rooms/room-service.test.ts`
- Test: `apps/api/src/rooms/room-start-match.test.ts`

- [ ] Write failing schema/service tests for list/create/join, membership without seat, claim requiring membership, leave-seat retaining membership, leave-room clearing membership/seat/READY, closed-room behavior, version checks, and 2–4 participant start.
- [ ] Add strict public room summary/detail and per-operation contracts. CREATE has neither room id nor version. Existing-room identity comes from `/api/rooms/:roomId`, not the body. JOIN may omit version and reconciles an already-committed same membership; claim-seat, leave-seat, leave-room, READY, and START carry `expectedRoomVersion`. Reconnect is a presence reconciliation read and carries neither authoritative identity nor mutation version. Actor identity remains absent from all bodies.
- [ ] Implement membership-aware projections and counts: members, occupied valid seats, and ready eligible seats.
- [ ] Implement create/join/claim/leave-seat/WAITING-room-leave/ready/start through per-room locks and deterministic errors. ACTIVE-room leave is deliberately absent until Task 3's Match-first primitive. Make create retry reconcile via the actor's unique membership.
- [ ] Add tests `create retry returns existing membership room`, `concurrent same-user creates create one room membership`, and `concurrent joins to different rooms have one winner`; expected final state is exactly one active membership and no orphan newly-created empty active room.
- [ ] For START, read room-scoped presence before opening the PostgreSQL transaction; then lock only that Room and revalidate membership/seat/READY under the lock. Add a spy test proving no presence/Redis call occurs inside the locked callback and a real-DB test proving starts in different rooms can overlap.
- [ ] Enforce RED+YELLOW for two-player start indirectly by passing canonical seat order to unchanged `createActiveGameState`.
- [ ] Run `pnpm -C packages/shared test -- rooms.test.ts` (red before implementation, green after), `$env:TEST_DATABASE_URL='<local *_test URL>'; pnpm -C apps/api test -- room-service.test.ts room-start-match.test.ts` (red then green), plus both package typechecks; commit lifecycle checkpoint.

### Task 3: Room routes, presence, completion, and realtime isolation

**Files:**
- Modify: `apps/api/src/rooms/routes.ts`
- Modify: `apps/api/src/rooms/routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/rooms/presence-store.ts`
- Modify: `apps/api/src/rooms/match-completion.ts`
- Modify: `apps/api/src/rooms/match-completion.test.ts`
- Modify: `apps/api/src/realtime/command-processor.ts`
- Modify: `apps/api/src/realtime/command-processor.test.ts`
- Modify: `apps/api/src/realtime/socketio.ts`
- Test: `apps/api/src/realtime/socketio.test.ts`

- [ ] Write failing route/auth tests for `GET/POST /api/rooms`, room-scoped get/join/seat/ready/start/leave/reconnect, server-derived actor, and no client-controlled authority fields.
- [ ] Register room-scoped routes using existing origin/session guards and map deterministic domain errors.
- [ ] Scope ephemeral presence by room and keep Redis outside DB locks.
- [ ] Change standalone terminal completion to lock Match first and then its owning Room. The terminal command processor already owns the Match lock/transaction, so its completion hook locks only the owning Room inside that transaction. Re-read both, reset only the matching Room, preserve memberships/history, and reject stale completion. No path locks Room then an existing Match.
- [ ] Implement active-room leave as: provisional pointer read; transaction locks candidate Match; derives/locks owning Room; re-reads both; verifies pointer/room/player state; permits only SURRENDERED/FINISHED; clears seat then membership. Retry/reconcile on changed pointer. ACTIVE actors must surrender.
- [ ] Add Room A/Room B event/subscription isolation and surrender/leave/completion race tests using real PostgreSQL where applicable.
- [ ] Before implementation run `$env:TEST_DATABASE_URL='<local *_test URL>'; pnpm -C apps/api test -- routes.test.ts match-completion.test.ts command-processor.test.ts socketio.test.ts`; expect missing multi-room route/lock behavior failures. After implementation rerun the same command and `pnpm -C apps/api typecheck`; expect PASS, then commit orchestration checkpoint.

### Task 4: Multi-room beta web flow

**Files:**
- Modify: `apps/web/src/playable-beta/room-api.ts`
- Modify: `apps/web/src/playable-beta/room-api.test.ts`
- Modify: `apps/web/src/playable-beta/page.tsx`
- Modify: `apps/web/src/playable-beta/app-playable.test.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Write failing tests for `#/rooms`, create/join, `#/rooms/<roomId>`, membership-aware four-seat lobby, leave seat, leave room, READY/start, active-match board reuse, and result return actions.
- [ ] Extend the existing room API client with strict shared parsers and room-scoped URLs.
- [ ] Add compact mobile-first room list and room detail states inside the existing hash router; preserve the polished game board and responsive shell.
- [ ] Keep lobby polling scoped to selected room; keep one existing Match realtime client and subscription by immutable `matchId`.
- [ ] Verify 390x844, 430x932, 1440x900, and 1920x1080 browser screenshots against current approved composition; fix only multi-room overflow/regressions.
- [ ] Before implementation run `pnpm -C apps/web test -- room-api.test.ts app-playable.test.tsx`; expect room-list/detail failures. After implementation rerun it plus `pnpm -C apps/web typecheck`; expect PASS, then commit web checkpoint.

### Task 5: Genuine full-game and lifecycle integration coverage

**Files:**
- Create: `apps/api/src/realtime/full-game-flow.integration.test.ts`
- Reuse exact seam: `apps/api/src/realtime/command-processor.ts` option `rollDice`
- Modify: `apps/api/src/realtime/command-processor.test.ts`
- Modify: `apps/api/src/rooms/room-concurrency.test.ts`

- [ ] Reuse the existing injected `rollDice` option with a deterministic queue that throws when exhausted; production RNG and protocol remain unchanged.
- [ ] Build two authenticated users and the room through injected Fastify HTTP requests for create/join/seat/READY/start, then use the real command processor for gameplay.
- [ ] Implement a deterministic legal-action driver: on each phase submit a unique monotonic `actionId`, current `expectedStateVersion`, consume the queued roll only for new ROLL commands, choose canonical pawn order from returned legal actions, and stop only at FINISHED or fail after 2,000 committed commands. Use default/unmocked game-engine `transition`; never update Match snapshot directly.
- [ ] Provide a fixed dice queue produced and checked into the test fixture so the driver reaches all four HOME slots. Assert the trace includes ENTER, MOVE, extra roll, HOME entry, exact HOME3, ordered events, genuine FINISHED snapshot, `HOME_DIAGONAL_COMPLETED`, MatchResult/history/statistics, and owning-Room reset.
- [ ] Keep blocked-jump, exact-destination capture, ENTER non-capture, no-action, and HOME3 overshoot as adjacent real command-processor scenario tests unless the fixed full-game trace naturally contains them; do not make the terminal trace brittle solely to aggregate every mechanic.
- [ ] Add a second real match path: SURRENDER command -> `LAST_ACTIVE_PLAYER` -> persisted terminal result.
- [ ] Add multiple-room lifecycle test proving distinct pairs, matches, snapshots, events, counts, and concurrent starts remain isolated.
- [ ] Run `$env:TEST_DATABASE_URL='postgresql://zamanushka:zamanushka_local@127.0.0.1:5433/zamanushka_test'; pnpm -C apps/api test:integration -- full-game-flow.integration.test.ts --retry=0` three times, then the full integration suite and API typecheck; expect PASS without snapshot injection.

### Task 6: Final gates, reviews, and deploy package

**Files:**
- Modify: `docs/AMVERA_BETA_DEPLOY.md`
- Verify: `Dockerfile`
- Produce: `C:/Users/m4rus/OneDrive/Desktop/zamanushka-amvera-multiroom` from committed tree

- [ ] Run `pnpm -C packages/game-engine test`, `pnpm -C packages/game-engine typecheck`, `pnpm -C packages/shared test`, `pnpm -C packages/shared typecheck`, `pnpm -C apps/api test`, `$env:TEST_DATABASE_URL='<local *_test URL>'; pnpm -C apps/api test:integration`, `pnpm -C apps/api typecheck`, `pnpm -C apps/web test`, and `pnpm -C apps/web typecheck`.
- [ ] Run `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`, and `git diff --stat d039c9a59f0aa13d83ab8489298d9cc717d93762`; expect all green and scope limited to the authorized P0.
- [ ] Independently review spec compliance, DB/concurrency safety, security, architecture boundaries, and test adequacy; fix only P0 findings and rerun affected gates.
- [ ] Commit final implementation exactly as `beta: add multi-room lifecycle and full game test`; this subject and the external deploy package are explicitly required by the user's P0 request.
- [ ] Verify Dockerfile retains build dummy `DATABASE_URL`, Prisma generate/build, runtime migrate deploy, and `pnpm start`.
- [ ] Update `docs/AMVERA_BETA_DEPLOY.md` with the required maintenance/replacement deployment window, old-binary write exclusion during FK activation, rollback only before activation, and roll-forward after activation.
- [ ] Create a clean deploy directory from final committed HEAD using `git archive`; verify no `.git`, `node_modules`, artifacts, or uncommitted files.
- [ ] Report final SHA, migration, lifecycle/isolation/full-game results, deploy folder, and Amvera readiness.
