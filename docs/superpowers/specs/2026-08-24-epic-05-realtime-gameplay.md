# EPIC-05 — Realtime Gameplay

## Status and boundary

This document defines EPIC-05 only. It covers transactional gameplay command processing, durable idempotency, authoritative match snapshot persistence, ordered per-match event journaling, transactional outbox publication, Socket.IO realtime delivery, reconnect and recovery, sequence-gap handling, crash recovery, and multi-instance safety.

It does not add UI gameplay presentation, animations, chat, profiles, statistics, ratings, board skins, matchmaking, multiple rooms, spectators, or gameplay rule changes. EPIC-03 remains the authoritative gameplay engine and EPIC-04 remains the authoritative room/table lifecycle.

## Core architecture

EPIC-05 uses PostgreSQL as the durable authoritative truth for match state.

- PostgreSQL stores the authoritative match snapshot, terminal result, processed actions, ordered event journal, and outbox rows.
- The transactional outbox is the durable source for reliable post-commit publication.
- Socket.IO is transport only.
- ACK is a post-commit response to the sender.
- Broadcast is post-commit publication to subscribers.
- ACK and broadcast may race; neither is the durability mechanism.

Commands and publications are intentionally at-least-once. Exactly-once network delivery is not required. The system relies on durable unique identities, idempotent command processing, ordered per-match sequence numbers, client-side deduplication, gap detection, and `game:sync`.

## Scope

EPIC-05 covers:

- transactional gameplay command processing;
- server-side dice RNG;
- authoritative match snapshot persistence;
- durable idempotency keyed by match and action;
- ordered per-match event journal;
- transactional outbox;
- post-commit ACK;
- post-commit Socket.IO publication;
- realtime match subscriptions;
- reconnect;
- `game:sync`;
- sequence-gap detection and snapshot fallback;
- duplicate-delivery tolerance;
- out-of-order-delivery handling;
- active-match version watchdog;
- crash recovery;
- multi-instance correctness;
- terminal match persistence;
- integration with EPIC-04 room completion/reset.

## Out of scope

EPIC-05 does not implement or redesign:

- game rules, movement legality, victory rules, or board geometry;
- room membership, seat allocation, readiness, or room creation;
- UI presentation, animations, or client shell behavior;
- chat, profile, rating, history, statistics, or board skins;
- matchmaking or multi-room systems;
- spectator systems;
- any additional product state beyond the realtime match pipeline.

## Domain ownership

- `packages/game-engine` owns deterministic gameplay legality and pure transition logic.
- `apps/api` owns orchestration, persistence, transaction boundaries, server RNG, outbox writing, and Socket.IO publication.
- The client owns intent and presentation only.
- Server-side identity and dice value are authoritative.
- Redis may accelerate ephemeral coordination, but it is never authoritative for match truth.

## Command processing architecture

Every gameplay command follows the same authoritative pipeline:

1. authenticate the actor from the server session;
2. validate request shape and command-specific preconditions;
3. begin a PostgreSQL transaction;
4. lock the target match row with `SELECT ... FOR UPDATE` or an equivalent durable serialization boundary;
5. verify match existence and terminal state;
6. verify idempotency using `matchId + actionId`;
7. verify `expectedStateVersion`;
8. generate a server-side dice value only for `ROLL_DICE`;
9. call the pure game engine transition with server-authoritative context;
10. persist the new match snapshot, ordered events, processed action, and result metadata;
11. persist an outbox row describing the committed transition;
12. commit;
13. return ACK to the sender;
14. dispatch outbox rows to Socket.IO subscribers independently.

If a transaction fails, nothing is published and the original durable state remains unchanged.

## Command/result contract

The realtime API uses a strict command/result contract. Commands are intent only. They never accept authoritative game state from the client.

Canonical command fields:

- `matchId`
- `actionId`
- `expectedStateVersion`
- `type`
- `actorPlayerId` derived only from the server session
- `diceValue` only in server context for `ROLL_DICE`

Canonical command result shape:

```ts
type GameCommandResult =
  | {
      ok: true;
      matchId: string;
      actionId: string;
      stateVersion: number;
      lastSequence: number;
      snapshot: MatchSnapshot;
      events: MatchEventEnvelope[];
    }
  | {
      ok: false;
      matchId: string;
      actionId: string;
      code: GameCommandErrorCode;
      message: string;
      stateVersion: number;
      snapshot?: MatchSnapshot;
    };
```

Commands must never trust:

- client-supplied player identity;
- client-supplied seat order;
- client-supplied first player;
- client-supplied game snapshot;
- client-supplied dice outcome;
- client-supplied event sequence.

The response contract is discriminated:

- success returns the authoritative updated snapshot and compact metadata for immediate client reconciliation;
- failure returns a typed error and never mutates durable match state.

## Idempotency and expectedStateVersion

Idempotency is durable and match-scoped.

- `actionId` is unique at least within the match.
- Repeating the same command with the same `matchId + actionId` returns the original committed result.
- A duplicate delivery must not create a second logical transition.
- A repeated command with the same `actionId` but different actor, type, payload, or version is a hard conflict and must not be accepted as a new action.

`matchId + actionId` is the durable transition identity for command processing. Each journaled event also has its own durable identity within the same match, derived from the committed per-match sequence.

`expectedStateVersion` is a concurrency guard:

- if it matches the current authoritative version, the command may proceed subject to rule checks;
- if it is stale, the command fails without mutation;
- if it is missing or malformed, the command fails without mutation.

Version checking happens inside the locked transaction, after loading the authoritative current match row.

## Snapshot persistence

Each successful gameplay command persists an immutable authoritative match snapshot.

Snapshot invariants:

- snapshots are versioned;
- snapshots are write-once authoritative facts;
- a later snapshot never mutates an earlier snapshot in place;
- terminal snapshots remain durable and queryable after room reset and after later matches start.

The match record owns:

- current version;
- current turn state;
- current players and pawns;
- winner and result fields;
- terminal status;
- current snapshot pointer or embedded snapshot as supported by the repository design.

The room layer never duplicates gameplay state. It only points at the active match and is later reset by the approved EPIC-04 lifecycle.

## Ordered event journal

Each successful transition appends ordered per-match events.

Requirements:

- ordering is deterministic within a match;
- event identities are durable and unique per match;
- sequence numbers are assigned by the server inside the same transaction that commits the transition;
- clients consume events in order;
- events describe committed facts, not instructions;
- event order is preserved across retries and replays.

The journal is append-only and supports durable recovery after partial publication failures. The event journal is not the publication mechanism; it is the authoritative historical record of what happened.

## Transactional outbox

Every successful gameplay transaction writes an outbox row in the same PostgreSQL transaction as the snapshot and event journal updates.

Outbox requirements:

- created only after the transition is durable inside the same transaction;
- published asynchronously after commit;
- safe under retry and duplicate dispatch;
- able to represent both ACK-adjacent and subscriber broadcast payloads;
- durable across API restart and worker restart;
- independent of Socket.IO delivery success.

The outbox dispatcher may be in-process or worker-based, but the durable source of truth remains PostgreSQL.

## Socket.IO protocol

Socket.IO is transport only.

Suggested channel model:

- `match:{matchId}` for active match subscribers;
- `game:sync` for reconciliation requests;
- `game:ack` for sender acknowledgements if transport-level ACK is used;
- `game:event` or an equivalent transition envelope channel for committed broadcasts.

Protocol requirements:

- join and leave subscriptions are authenticated and scoped by match membership;
- a client may subscribe to the active match it is authorized to observe;
- broadcasts carry match identity, ordered event metadata, and version metadata;
- publications are post-commit only;
- subscribers may receive duplicate envelopes and must deduplicate by durable identity and sequence;
- network ACK is not a durability signal.

## Reconnect and game:sync

Reconnect is authoritative recovery, not a new game action.

When a client reconnects:

- it re-establishes its authorized match subscription;
- it provides the last durable version and sequence it has applied;
- the server compares that client state to the current authoritative state.

`game:sync` response modes:

- `events` when the missing range is available and continuous;
- `snapshot` when events are missing, stale, or unsafe to replay.

The client must prefer authoritative snapshot over attempting to infer missing history.

## Gap detection and snapshot fallback

The client tracks:

- last applied match version;
- last applied event sequence.

If the client sees:

- a gap in sequence numbers;
- an out-of-order transition that cannot be safely applied;
- an unknown or stale version;
- a missing event range;

it must stop applying incremental events and request `game:sync`.

The server may also proactively recommend or trigger `game:sync` using a lightweight version watchdog while a match is active.

Snapshot fallback rules:

- authoritative snapshot always wins over stale incremental animation;
- snapshot reconciliation may cancel queued client event playback;
- snapshot reconciliation must never invent hidden transitions.

## Duplicate and out-of-order delivery

The system tolerates:

- repeated delivery of the same committed transition;
- out-of-order arrival across multiple instances or retries;
- duplicate Socket.IO envelopes;
- repeated ACK attempts;
- repeated outbox dispatch attempts.

Clients deduplicate by durable identity and sequence. They never assume delivery exactly once. If a sequence gap or conflict is detected, they stop applying incremental deltas and sync from the server.

## Version watchdog

While a match is active, the client periodically compares a lightweight server version watermark with its last applied version.

If divergence is detected:

- the client invokes `game:sync`;
- the server returns either missing events or a snapshot;
- the client reconciles to the authoritative state before continuing.

The watchdog closes the commit-before-publication crash window when no later gameplay traffic exists to trigger a natural resync.

## Crash recovery

EPIC-05 must survive these crash windows:

- commit succeeds, ACK fails;
- commit succeeds, outbox publish fails;
- commit succeeds, broadcast fails;
- process restarts before publication;
- duplicate publication after restart.

Recovery rules:

- committed transitions remain durable regardless of publication success;
- outbox rows are retried until published or otherwise safely handled;
- repeated publication does not change match state;
- reconnect plus `game:sync` restores correctness even if some network delivery was lost.

## Multi-instance behavior

EPIC-05 must support multiple API instances.

Requirements:

- row-level transaction serialization is the correctness boundary;
- duplicate network publication is tolerated;
- outbox dispatch may be parallelized but must not invent transitions;
- clients may receive the same transition from multiple instances;
- clients must deduplicate by durable identities and sequence;
- out-of-order delivery across instances is expected and handled by sync.

Redis may help coordinate ephemeral concerns such as presence or fan-out optimization, but never as the source of authoritative match truth or command serialization correctness.

## Terminal match behavior

Terminal transitions are fully authoritative.

On terminal success:

1. persist the terminal match snapshot and result;
2. persist the terminal event journal entries;
3. persist the processed action record;
4. persist the outbox row;
5. commit;
6. publish the terminal result post-commit;
7. let EPIC-04 room completion/reset clear the singleton room state for the matching completed match.

The room reset must reuse EPIC-04 behavior rather than duplicate it.

Required terminal invariants:

- terminal match remains durable;
- terminal match snapshot and result remain queryable;
- room.currentMatchId clears only for the matching terminal match;
- seats clear;
- READY clears;
- stale terminal completion cannot clear a newer active match;
- a completed match can still be used for history, audit, and later statistics.

If a single PostgreSQL transaction cannot safely span both terminal match persistence and room reset within the repository architecture, that must be called out explicitly as a spec blocker rather than silently weakened.

## EPIC-04 integration

EPIC-05 integrates with EPIC-04 as follows:

- EPIC-04 owns room readiness, current match reference, and post-match room reset;
- EPIC-05 owns match command processing, match persistence, event ordering, and publication;
- EPIC-04 may call into EPIC-05 results when a match is terminal;
- EPIC-05 may not reimplement room lifecycle rules.

The single persistent room is a lobby/table container, not a gameplay authority.

## Testing strategy

### Unit tests

- server RNG adapter boundaries;
- idempotency key behavior;
- `expectedStateVersion` success and failure;
- command guard precedence and error behavior;
- pure transition mapping from inputs to persisted envelope data;
- event ordering and deterministic envelope composition;
- reconnect and `game:sync` decision logic;
- gap detection and snapshot fallback;
- duplicate and out-of-order delivery handling.

### Integration tests

- two commands at one expected version;
- concurrent commands against the same match row lock;
- duplicate identical retries;
- same action ID with different actor, type, payload, or version;
- commit and outbox persistence in one transaction;
- ACK replay without client regression;
- broadcaster retry after restart;
- reconnect after missed publication;
- sequence-gap to snapshot fallback;
- crash after commit before ACK or publish;
- missed final broadcast with no later traffic;
- version watchdog recovery;
- multi-instance deduplication and ordering;
- terminal match persistence plus EPIC-04 room reset interaction.

### Property / invariant tests

- deterministic same-input same-output behavior;
- sequence monotonicity within a match;
- snapshot immutability;
- duplicate-delivery tolerance;
- out-of-order delivery tolerance;
- round-trip recovery from snapshots and event ranges.

## Acceptance criteria

- Gameplay commands are processed transactionally and serialized correctly.
- Durable idempotency prevents duplicate logical transitions.
- Server-side dice RNG is authoritative.
- Match snapshots, ordered events, and processed actions are persisted durably.
- Outbox publication survives crashes and retries.
- Socket.IO delivery is post-commit only.
- Clients recover through reconnect, `game:sync`, gap detection, and snapshot fallback.
- Multi-instance delivery is safe and deduplicated.
- Terminal matches remain durable.
- EPIC-04 room reset occurs only for the matching terminal match and does not corrupt later matches.
- No later product area is implemented by this epic.

## Risks and ambiguities

- The repository must support one PostgreSQL transaction boundary for terminal match persistence and matching room reset. If the current architecture cannot do that safely, it is a blocker and not an implementation detail.
- The exact shape of the outbox payload and Socket.IO envelope should remain narrow and transport-neutral until implementation, but the durable identity and ordering requirements are fixed.
- Whether the version watchdog is timer-based or piggybacked on gameplay traffic is an implementation detail; the contract is only that stale clients detect divergence and sync.

## Preserved implementation notes

- EPIC-03 remains the sole gameplay legality authority.
- EPIC-04 remains the sole room lifecycle authority.
- PostgreSQL row locking is the command serialization boundary.
- Redis is never authoritative for match state.
- ACK and broadcast are post-commit and may race.
- Clients deduplicate by durable identity and sequence, not by delivery timing.
