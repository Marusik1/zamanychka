# Beta Multi-Room Lifecycle Design

## Scope

Evolve the existing Room implementation from one singleton table to multiple durable rooms. Preserve the existing game engine, Match command pipeline, realtime transport, result persistence, and visual system. Add only room discovery/creation, explicit membership, seat lifecycle, room exit, isolation, and end-to-end game-flow verification.

This user-approved beta requirement supersedes the repository's stale EPIC-01-only execution-boundary paragraph. All other repository product, security, and engineering rules remain binding.

## Durable model

- `Room` remains the room aggregate and gains only the minimal public identity/lifecycle fields required for a room list: durable id/key, unique short code, status, timestamps, version, seats, memberships, matches, and `currentMatchId`.
- `RoomMembership` is the durable lobby participation authority. It contains an id, `roomId`, `userId`, and join timestamp, with `UNIQUE(userId)` and `UNIQUE(roomId, userId)`. A user therefore has at most one active room membership.
- `RoomSeat` remains independent from membership. Its compound identity is `(roomId, seatIndex)`. Retain global `UNIQUE(userId)` so one user cannot occupy seats in multiple rooms. A nullable composite relation `(roomId, userId) -> RoomMembership(roomId, userId)` uses `RESTRICT`; service transactions clear a seat before deleting membership. This makes an occupied seat without same-room membership impossible in PostgreSQL, not merely in application checks.
- `Match` remains durable game authority. Match participant identity is copied into its existing immutable initialization/snapshot/result contracts and never depends on later lobby membership. Change `Match -> Room` deletion behavior from cascade to `RESTRICT/NO ACTION`; Room history is never deleted through lobby cleanup. `Room.currentMatchId` becomes a real nullable unique foreign key to Match while the transaction also verifies that the Match belongs to that Room.
- Existing singleton data is retained as a legacy room. A forward migration creates memberships only for distinct, non-null existing seat occupants; it must not synthesize users or ghost memberships.

## Lifecycle and invariants

- Creating a room creates the Room and its four deterministic seats in one transaction, then creates the creator's membership. It does not automatically assign a seat.
- Joining a room moves no seat. Because membership is globally unique per user, joining another room requires first leaving the current lobby room.
- Claiming a seat requires membership in that exact room. PostgreSQL row locking and unique constraints serialize races. A user can occupy at most one seat, and a seat can have at most one user.
- Leaving a seat clears that seat and READY but keeps membership.
- Leaving a lobby room atomically clears READY, clears any seat, and removes membership. Network disconnect never performs this operation.
- READY requires membership plus ownership of a seat. Leaving a seat or room removes READY.
- Starting uses only users with a valid membership, occupied seat, READY, and connected presence in the selected room. Seat order is canonical; first player remains server-selected. Match creation and `currentMatchId` assignment stay atomic.
- During an active Match, lobby `LEAVE_ROOM` is rejected while the actor remains ACTIVE in the authoritative Match snapshot. The existing SURRENDER command is the only gameplay exit. After a committed surrender makes that actor SURRENDERED (or after the actor is FINISHED), `LEAVE_ROOM` may atomically clear the lobby seat/membership while immutable Match participants and history remain intact. Match completion continues to use the existing terminal transaction and room reset rules without deleting Match history.
- Member count is distinct active memberships. Seat count is occupied seats backed by valid same-room memberships. Ready count is ready occupied seats backed by valid same-room memberships. These counts may differ.

## Room lifecycle

Rooms have `WAITING`, `ACTIVE`, and `CLOSED` persistence states. Database checks enforce `ACTIVE <=> currentMatchId IS NOT NULL` and `CLOSED => currentMatchId IS NULL`; CLOSED is irreversible. The last member leaving an empty waiting room marks it CLOSED after clearing seats. This avoids destructive deletes and preserves Match history. Closed rooms are excluded from the active list and cannot be joined. Terminal completion returns an active room to WAITING, clears `currentMatchId`, seats, and READY through the existing completion transaction; surviving memberships remain so users may reclaim seats or explicitly leave.

## API and projections

Extend the existing authenticated Fastify room routes and shared schemas; do not create a parallel controller:

- list active rooms with code/status/member/seat capacity summary;
- create a room and membership;
- get a room by id;
- join a room;
- claim seat, leave seat, set READY, start Match, and reconnect scoped by room id;
- leave room.

Actor identity comes only from the server session. Clients never submit participant identity, seat order, first player, authoritative snapshot, dice, or event sequence. Existing room mutations carry `expectedRoomVersion` and validate it under the Room lock. Naturally idempotent operations return the current success projection when the intended state already exists. A retried create by a user whose membership was committed returns that existing room instead of creating another; concurrent creates/joins by the same user are resolved by `UNIQUE(userId)`. Mutations use the existing origin/content-type/session protection and deterministic domain errors.

## Frontend flow

The existing hash router gains `#/rooms` and `#/rooms/<roomId>` without adding another router. The list provides compact create/enter actions. A room page renders the current polished four-seat lobby, membership-aware controls, READY, start, leave-seat, and leave-room. Active Match rendering and realtime controllers are reused. Lobby polling remains acceptable and is scoped by room id. Match subscriptions remain scoped by immutable `matchId`; Room A cannot receive Match B events.

## Transaction and realtime boundaries

All durable room mutations lock the selected Room row inside PostgreSQL and re-read membership/seat state under the lock. Room creation relies on unique room-code retry and DB constraints. Match start locks only its Room, enabling independent rooms to start concurrently.

Terminal processing uses one consistent lock order: lock Match, derive its `roomId`, lock that exact Room, re-read/verify Match terminal state, verify `room.currentMatchId === match.id`, persist result/history, reset only that Room, and commit. Start never locks Match before Room because no Match exists yet; gameplay command processing already locks Match and only touches its owning Room on terminalization. This prevents stale completion of Match A from clearing a newer Match B and avoids cross-room locks.

Active-room leave follows the same Match-first lock order. It reads `currentMatchId` only to locate the candidate, begins a transaction, locks that Match, locks its owning Room, then re-reads both and verifies the pointer, room identity, Match status, immutable participation, and actor state. Only SURRENDERED/FINISHED actors may then have their lobby seat/membership cleared. If the pointer changed, the operation retries/reconciles without mutation. WAITING-room leave remains Room-only. No path locks Room and then an existing Match.

Redis remains presence/fan-out only. Presence keys include room id, disconnect does not alter durable membership, and gameplay outbox publication remains match-scoped. START reads the presence snapshot immediately before entering the short PostgreSQL transaction, then revalidates durable membership/seat/READY under the Room lock. Presence is an advisory product guard rather than durable truth: a disconnect after validation does not roll back an already committed Match and never becomes surrender. No DB lock is held across Redis I/O; presence TTL and reconnect use the existing adapter semantics.

## Forward migration and deployment safety

Use an expand/backfill/validate migration only—never reset, `db push`, or production data deletion:

1. Add Room code/status fields with safe defaults, `RoomMembership`, indexes, and nullable current-Match relation support.
2. Backfill the legacy singleton code/status and insert memberships idempotently for distinct non-null seat occupants whose users exist.
3. Abort migration on duplicate/invalid legacy seat ownership rather than manufacturing or discarding membership.
4. Add the composite seat-to-membership foreign key as PostgreSQL `NOT VALID`, validate it after backfill, then make it authoritative; change Match room deletion to RESTRICT.
5. Deploy under the existing single-application maintenance/replacement procedure so the old singleton binary cannot claim a seat between validation and new-binary activation. Re-running migration deployment is safe through Prisma's migration ledger. Rollback means restoring the previous application only before constraint activation; after activation, roll forward—never reverse destructive data changes.

## Failure behavior

Unknown/closed room, membership conflict, missing membership, full/taken seat, stale room version, invalid READY, active-player leave, and concurrent start return deterministic domain failures. Create/join/leave/start define stable no-op/retry behavior; a lost-response create reconciles through the user's unique membership. Failed operations leave Room, membership, seat, Match, events, and result unchanged.

## Verification

- Migration tests cover legacy occupant reconciliation without ghosts and safe forward deployment.
- PostgreSQL integration tests cover same-seat races, simultaneous same-user joins to different rooms, one-membership-per-user, seat/member/READY invariants, leave/reclaim, reconnect, stale completion versus a newer Match, and two independent rooms. They also race SURRENDER, `LEAVE_ROOM`, and terminal completion to prove no deadlock, no pre-surrender departure, and correct eventual seat/membership cleanup.
- API tests cover list/create/get/join/leave-seat/leave-room/ready/start and server-authored identity.
- Realtime tests prove Match and room isolation.
- A deterministic test-only RNG seam drives legal commands through the real API/realtime command processor and unmocked game-engine `transition` from Room creation through a genuine `HOME_DIAGONAL_COMPLETED` terminal transition. It asserts ordered events, FINISHED snapshot, persisted MatchResult/history, owning-Room reset, surviving memberships, and isolation. It may not inject a terminal snapshot or mock transition. A second genuine flow reaches `LAST_ACTIVE_PLAYER` through the real SURRENDER command and performs the same persistence assertions.
- Existing engine/shared/API/web suites, typechecks, Prisma validation/generation, production build, and diff checks remain green.

## Non-goals

No matchmaking, private rooms, passwords, invitations, spectators, chat redesign, rankings, bots, production forced dice, gameplay-rule changes, realtime redesign, or UI redesign.
