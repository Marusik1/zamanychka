# Database Design

## Durable responsibilities

PostgreSQL stores users, Telegram identities, rooms, memberships, matches, snapshots, processed actions, game events, results, statistics, ratings, skins, and chat messages.

## Match transaction

Each authenticated command associated with a verified match member locks its match row with `SELECT ... FOR UPDATE`. The same transaction:

1. looks up `(matchId, actionId)` and applies the replay/collision rules below;
2. validates `expectedStateVersion` for a new action;
3. executes the transition;
4. increments state version once for a successful transition;
5. assigns a continuous sequence local to that match;
6. saves snapshot and events;
7. saves the processed command and original response;
8. updates result/statistics when applicable;
9. appends an outbox record for the committed transition.

## Idempotency

`ProcessedAction` has `UNIQUE(matchId, actionId)` and stores user, command type, canonical-payload hash, accepted/resulting versions, status, response payload, and timestamp. An identical retry by the same actor with the same normalized command returns the stored original result before stale-version validation. Reuse by a different actor, command type, or payload returns `ACTION_ID_CONFLICT` and never executes.

`expectedStateVersion` is part of the canonical normalized command identity. Retrying a rejected intent after synchronization requires a new `actionId`.

Commands that pass authentication and match-membership lookup are durably recorded whether accepted or rejected, so transport retries receive the same ACK. Rejection does not increment state version or sequence. Authentication failures without a trusted match/actor identity are not persisted. A replayed old ACK never instructs the client to regress; the client compares its current version and synchronizes when necessary.

## Versioning

- `stateVersion`: number of successful authoritative transitions.
- `sequence`: ordering of individual domain events within one match.

One transition increments state version once and may append several sequential events.

## Constraints and terminal effects

- `GameEvent`: `UNIQUE(matchId, sequence)`.
- `MatchStateVersion`: immutable `UNIQUE(matchId, stateVersion)` with snapshot JSON and `lastSequence`.
- Transition/outbox: `UNIQUE(matchId, resultingStateVersion)`.
- Match result: one terminal result per match (`UNIQUE(matchId)`).
- Per-player result/statistics application: `UNIQUE(matchId, playerId, resultKind)` or an equivalent ledger key.

Terminal result and statistics ledger writes occur in the match transaction. Aggregate counters are derived/upserted from the unique ledger so retries cannot apply them twice.

Immutable version snapshots are retained for exactly the same window as their transition events. Event-mode sync is available only when every requested transition has both a continuous event interval and its matching version snapshot; otherwise the server returns the latest snapshot. MVP retains the full event and version-snapshot history through match completion and the configured match-history retention period.

## Outbox operations

Outbox workers claim rows with leases, retry with bounded exponential backoff, and expose poison rows after a configured attempt threshold without discarding them. Lease expiry makes crashed claims recoverable. Published rows are retained at least through the realtime recovery window. Exact durations are deployment configuration, not game rules.

## Redis boundary

Redis supports presence with TTL, rate limiting, matchmaking, ephemeral Socket.IO metadata, and later multi-instance adapters. Authoritative game fields may be cached but never exist only in Redis.

## Chat isolation

`ChatMessage` is separate from `GameEvent`; chat never changes game state version, game event sequence, or engine behavior.
