# Database Design

## Durable responsibilities

PostgreSQL stores users, Telegram identities, rooms, memberships, matches, snapshots, processed actions, game events, results, statistics, ratings, skins, and chat messages.

## Match transaction

Each accepted command locks its match row with `SELECT ... FOR UPDATE`. The same transaction:

1. validates `expectedStateVersion`;
2. looks up `(matchId, actionId)`;
3. executes the transition;
4. increments state version once;
5. assigns a continuous sequence local to that match;
6. saves snapshot and events;
7. saves the processed command and original response;
8. updates result/statistics when applicable.

## Idempotency

`ProcessedAction` has `UNIQUE(matchId, actionId)` and stores user, accepted/resulting versions, status, response payload, and timestamp. An identical retry returns the stored original result rather than an `ACTION_ALREADY_PROCESSED` error.

## Versioning

- `stateVersion`: number of successful authoritative transitions.
- `sequence`: ordering of individual domain events within one match.

One transition increments state version once and may append several sequential events.

## Redis boundary

Redis supports presence with TTL, rate limiting, matchmaking, ephemeral Socket.IO metadata, and later multi-instance adapters. Authoritative game fields may be cached but never exist only in Redis.

## Chat isolation

`ChatMessage` is separate from `GameEvent`; chat never changes game state version, game event sequence, or engine behavior.
