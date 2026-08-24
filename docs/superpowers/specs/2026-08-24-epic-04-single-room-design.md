# EPIC-04 — Single Persistent Game Room Design

## Status and boundary

This document defines EPIC-04 only. It adds the single persistent game room, seat management, readiness, match start, and match return-to-waiting lifecycle required by the MVP.

It does not add room lists, matchmaking, invitations, room codes, public/private room distinctions, multiple concurrent rooms, spectators, queues, gameplay rules, dice, pawn movement, chat, profiles, rating, history, or board skins. EPIC-05 and later epics must not start as part of this work.

## Decisions

- The MVP has exactly one persistent game room.
- The room is the game table, not a match.
- A new durable match is created for every started game.
- `Room != Match` is a permanent boundary.
- EPIC-03 remains the sole authority for gameplay mechanics.
- Match creation uses the existing `createActiveGameState(...)` factory; the room layer does not duplicate rules.
- If all four seats are occupied, additional users cannot become active players in that match.
- No queueing or spectator complexity is introduced unless a later canonical requirement explicitly demands it.
- `START_MATCH` is explicit, not automatic.
- Any currently seated participant may initiate `START_MATCH`.
- There is no room owner or host role.
- Start is legal only when 2–4 seats are occupied, every seated participant is READY, every seated participant is currently connected, and no active/current match exists.
- READY never starts the match by itself.
- The server selects `firstPlayerId` at successful `START_MATCH` from the seated participants and persists that choice as part of match initialization.
- `createActiveGameState(...)` receives the already selected `firstPlayerId`.

## Core model

### Room

The room is a durable single-table container that persists across games. It owns:

- current participants;
- seat order and free-seat availability;
- readiness before a match starts;
- the active match reference, if any;
- waiting/active/return-to-waiting room lifecycle state;
- connection presence as ephemeral state for currently seated participants.

The room does not own gameplay legality, dice, pawn positions, victory, or event history.

### Match

The match is a separate durable record created when the room starts a game. It owns:

- authoritative match snapshot;
- command processing history;
- event history;
- winner/result;
- future statistics/history references.

The room points to the active match while gameplay is in progress, but the match remains independently identifiable.

## Single-room lifecycle

The MVP room follows one deterministic cycle:

1. the room exists;
2. participants join free seats;
3. participants leave before the game starts if they wish;
4. participants mark themselves ready;
5. when the room is ready, any currently seated participant may explicitly start the match;
6. the room stores the active match reference;
7. when the match finishes, the room clears the active match reference and returns to waiting state.

The room never becomes a room directory, lobby browser, or matchmaking system.

## Seat model

- Supported seat counts are 2, 3, and 4.
- A seat is either free or occupied.
- Each participant can occupy at most one seat.
- A participant may join only a free seat.
- Leaving before start releases the seat.
- No other active player can be added once the room is full.
- Seat assignment within a started match is immutable.
- A disconnected participant keeps the same reserved seat until explicit `LEAVE_SEAT` before match start.
- Disconnect does not clear READY.
- Disconnect does not release the seat.
- Reconnect automatically reattaches the authenticated user to the same reserved seat.
- A disconnected participant blocks `START_MATCH` until connected again.
- There is no durable disconnected participant lifecycle status.

## Match start semantics

When the room starts a match:

- it chooses the canonical player count from the occupied seats;
- it selects `firstPlayerId` from the seated participants on the server;
- it creates the initial authoritative engine state through `createActiveGameState(...)`;
- it stores the resulting durable match reference;
- it transitions the room from waiting state into active match running state;
- it does not reimplement or reinterpret game mechanics.

The room layer may validate readiness and seat occupancy before calling the engine factory, but it must not duplicate engine rules.

## Room state shape

The implementation may persist the exact schema used by the backend, but the room concept must be expressible in a compact state model:

- `roomId` or equivalent durable identity;
- participant roster;
- seat assignments;
- ready flags;
- current room status;
- current active match reference or `null`;
- connection presence for seated participants;
- timestamps or audit metadata if already standard in the backend.

This spec intentionally avoids prescribing a public lobby or discovery surface.

## Errors and boundaries

Room operations fail closed:

- invalid seat choice;
- taking a seat already held by another authenticated user;
- joining a full room;
- leaving a seat not held by the caller;
- starting a match while a seated participant is disconnected;
- starting a match before the room is ready;
- starting while another active match already exists;
- mutating lobby-like state that is forbidden during an active match.

Room errors are application-layer errors. They must not overlap with engine legality errors.

All room mutations that can race are serialized against the one durable room state. At minimum this applies to:

- `TAKE_SEAT`;
- `LEAVE_SEAT`;
- `SET_READY`;
- `START_MATCH`.

Concurrent seat claims resolve deterministically so only one succeeds. Concurrent `START_MATCH` attempts resolve deterministically so exactly one durable match is created and `currentMatchId` is set atomically; later attempts observe the existing match and fail or no-op deterministically.

## Integration points

- `packages/game-engine`: owns the gameplay engine and `createActiveGameState(...)`.
- `apps/api`: owns room persistence, seat management, readiness, and active match references.
- `packages/shared`: may define the room DTOs and API request/response schemas used by the app layer.

The room layer may pass only the data the engine needs to construct the initial match state. It must not pass raw game rules back into the room module.

## Testing strategy

The EPIC-04 implementation must be covered by tests that prove:

- only one persistent room exists in the MVP;
- participants can join free seats and leave before start;
- disconnected participants retain their reserved seat and READY state until explicit leave;
- reconnect reattaches the same authenticated user to the same seat;
- any seated participant may initiate `START_MATCH`;
- readiness gates match start;
- match start creates a new durable match and calls `createActiveGameState(...)`;
- `firstPlayerId` is server-selected from seated participants and passed into `createActiveGameState(...)`;
- concurrent seat claims serialize to one winner and one deterministic loser;
- concurrent `START_MATCH` serializes to exactly one created match;
- the room returns to waiting state after match completion;
- no room list, invite, code, matchmaking, or multi-room behavior is introduced;
- the room layer does not duplicate EPIC-03 gameplay rules.

## Acceptance criteria

EPIC-04 is complete when:

- the MVP can host one persistent game room;
- 2–4 players can occupy seats and ready up;
- any seated participant can explicitly start the match once the room is ready;
- a match starts from the room and is persisted as a distinct durable entity;
- the room tracks the current active match reference;
- after match completion the room returns to waiting state;
- no multi-room feature exists;
- no gameplay logic is reimplemented in the room layer;
- reconnect restores a disconnected seated participant to the same seat before match start or the same active match during play;
- all relevant tests pass.

## Risks and ambiguities

- The backend may choose whether to persist only the current active match reference or also a compact history of prior match IDs. EPIC-04 only requires the active reference and waiting-state recovery.
- The exact API shape for seat joining and readiness should follow existing backend conventions, but the single-room invariant must remain fixed.
- Later epics must not infer multi-room support from the presence of the room module or the word “rooms” in historical docs.
