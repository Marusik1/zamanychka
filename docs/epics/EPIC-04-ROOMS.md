# EPIC-04 — Single Persistent Game Room

## Goal

Build one durable room/table for the Zamanushka MVP. The room hosts 2–4 seated players, tracks readiness, starts a durable match through the approved game engine, and returns to waiting state after the match completes.

## Scope

- exactly one persistent room for the MVP;
- 2–4 player seat management inside that room;
- joining a free seat;
- leaving before the match starts;
- readiness for the next match;
- tracking the current active match reference;
- starting the next durable match from the room into `createActiveGameState(...)`;
- returning the room to a waiting state after a match finishes;
- minimal room status and participant state needed for EPIC-05+.

## Explicitly out of scope

- room creation and deletion;
- room lists, discovery, search, or filtering;
- public/private room distinction;
- room codes or invite links;
- matchmaking across multiple rooms;
- queueing or spectator systems;
- room ownership and moderation;
- multiple concurrent rooms;
- gameplay rules, pawns, dice, capture, victory, or engine semantics;
- Socket.IO transport details beyond the room’s durable state needs;
- chat, profiles, history, rating, board skins, or onboarding.

## Product model

The MVP has one persistent game table. Users join that table, take one of the free seats, and wait for the next match. When a match is started, the room creates a fresh durable match record that becomes the authoritative source for state snapshots, command processing, event history, and results.

`Room != Match`.

- Room: long-lived table container, participant roster, seat availability, readiness, and current match pointer.
- Match: one game instance with its own identity, snapshot, events, result, and winner.

The room may exist without an active match. A finished match does not destroy the room; it returns the room to waiting state so the next match can be started in the same table.

## Architecture

The room layer is a thin application module above the pure game engine. It owns roster state, seat allocation, readiness, and durable match references. It does not duplicate game rules or invent a second source of truth for gameplay.

When a match starts, the room layer constructs the initial game state through `createActiveGameState(...)` using the approved seat template and server-selected first player semantics from EPIC-03. The room layer then stores only the resulting match reference and lifecycle metadata it needs for future restarts and post-match summary.

## Core lifecycle

1. A single room exists.
2. Users join available seats until the configured 2–4 participant limit is reached.
3. Joined participants may leave before start.
4. Participants mark themselves ready.
5. When the room is ready, the server starts a new durable match.
6. The room points at that match while gameplay is active.
7. When the match ends, the room clears the active match pointer and returns to waiting state.

## Seat model

- The room supports 2, 3, or 4 seats.
- Seats are immutable within a match.
- A participant may occupy at most one seat.
- If all four seats are occupied, no additional active player can join that match.
- No queueing or spectator fallback is introduced for the MVP.

## State and persistence

The room layer persists only what it must own:

- room identity;
- participant list;
- seat assignments;
- ready flags;
- current room status;
- current active match reference;
- lifecycle timestamps or audit fields if already supported by the backend patterns.

The durable match record remains separate from the room record. The room points to the current active match, but the match owns the gameplay snapshot, event history, and result.

## Error handling

Room operations fail closed:

- invalid seat selection;
- joining a full room;
- leaving a seat not held by the caller;
- starting a match when the room is not ready;
- starting while a match is already active;
- changing roster state during an active match where disallowed by the lifecycle rules.

Room errors are application-layer errors, not game-engine errors.

## Testing strategy

- seat occupancy and release;
- readiness transitions;
- match start creates a fresh durable match and calls `createActiveGameState(...)`;
- room returns to waiting state after match completion;
- single-room invariant;
- no multi-room behavior leaks into the MVP;
- no gameplay logic duplicated in room tests.

## Acceptance criteria

- The MVP has exactly one persistent room.
- Users can join free seats up to 2–4 players.
- A match can start from the room and is represented by a durable match record.
- The room can return to waiting state after match completion.
- No room lists, matchmaking, invites, or public/private room logic exist in the MVP.
- The room layer does not duplicate EPIC-03 gameplay rules.

## Risks and ambiguities

- Whether the room persists a full history of previous match references or only the current active match reference should be decided by the application data model when implementation starts.
- Whether “leave before game start” removes the participant entirely or marks the seat vacant should follow the backend’s roster conventions, but the room must stay single-table and deterministic.
- Future multi-room support is intentionally excluded from this MVP and should not be inferred from the room module name.
