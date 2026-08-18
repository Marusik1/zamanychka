# Specification Review

## Blocking contradictions

1. Perimeter-to-home residual movement, shared-corner capture/blocking, and overrun beyond `HOME(3)` are not fully defined.
2. Exact perimeter/home coordinate mappings, seat/color allocation, and core state invariants are incomplete.
3. Database validation order conflicts with idempotent ACK replay; action identity/collision semantics are incomplete.
4. Lifecycle transitions and phase/dice/current-player/winner invariants are incomplete.
5. Event catalog, payloads, transition metadata, snapshot sequence, and replay semantics are incomplete.
6. A crash after commit and before broadcast can leave connected clients stale indefinitely.
7. Durable event/result/statistics uniqueness constraints are incomplete.

## Rule ambiguities

- Whether remaining pips continue through `PERIMETER -> HOME(0) -> HOME(n)` in one move.
- Whether an opposing perimeter pawn on the entering player's corner is captured or blocks home entry.
- Required result when a move would pass `HOME(3)`.
- Exact seat/color/corner mapping for 2- and 3-player matches.

## Invalid or unreachable states

The current broad `progress: number` type and incomplete relationships among match status, turn phase, current player, dice, winner, and player statuses admit invalid snapshots.

## Server-authority violations

None found in the intended flow. Server RNG, intent-only commands, engine authority, and PostgreSQL truth are consistent. Dice context must be rejected for every command except `ROLL_DICE`.

## Concurrency risks

- Surrender racing roll/move requires explicit transactional tests.
- Multi-instance publication ordering needs a durable design.

## Idempotency risks

Processed-action lookup must precede stale-version rejection for retries. Stored identity must bind action ID to actor, command type, and normalized payload. Collision behavior and rejected-command replay require definition.

## Reconnect risks

Event replay must define state-version boundaries. A post-commit/pre-broadcast crash requires a durable outbox or a version watchdog so a connected client cannot remain stale forever.

## Database consistency risks

Require unique `(matchId, sequence)`, one terminal result per match, and exactly-once statistics derivation.

## UI / authoritative-state conflicts

Event ordering for move, capture, home entry, extra roll, turn change, and victory must be canonical for deterministic animation. Snapshot must include `lastSequence`.

## Missing test cases

- Shared-corner collision matrix and perimeter-to-home residual steps.
- Home overrun and globally unique occupancy.
- Idempotency retry/collision races and concurrent expected-version commands.
- Crash boundaries around commit, ACK, and broadcast.
- Sync across multiple state versions and stale ACK handling.
- Final broadcast loss without later traffic.

## MVP scope leakage

- EPIC-00 design tokens must be placeholders only; full tokens belong to EPIC-02.
- Achievements must either become explicit product scope later or be removed from EPIC-08.

## Resolution pass 1

- Defined residual perimeter-to-home movement, shared-corner capture/blocking, occupied home paths, and overrun.
- Defined exact coordinates, routes, offsets, home diagonals, seat templates, and occupancy invariants.
- Moved replay/collision handling before stale-version validation and bound action IDs to actor/type/payload.
- Defined lifecycle and terminal snapshot invariants.
- Added event envelopes, canonical order, snapshot sequence, and transition-batch replay.
- Added transactional outbox plus active-client version watchdog.
- Added event, transition, result, and statistics-ledger uniqueness constraints.

## Conclusion

## Resolution pass 3

- Replaced the contradictory pre-match cardinality rule with fixed seat slots plus partial occupancy; `READY`/`ACTIVE` require a full roster.
- Defined version, snapshot, and participant events for every join, leave, and readiness mutation.
- Allowed a non-current surrender to end without a turn event whenever current player and phase are unchanged.
- Made the event envelope a compile-time discriminated mapped union and fixed lifecycle array ordering.

## Final review status

Three independent review passes were completed. The last pass identified only the two contradictions resolved immediately above. Per the three-pass review limit, the specification now requires final human review before planning.

`READY_PENDING_HUMAN_REVIEW`
