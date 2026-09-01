# Game Engine

## Boundary

`packages/game-engine` is a deterministic, immutable TypeScript library. It has no dependency on Fastify, Prisma, PostgreSQL, Redis, Socket.IO, Telegram, browser APIs, or UI code.

## Core state

```ts
type PawnPosition =
  | { zone: 'OFF_BOARD' }
  | {
      zone: 'PERIMETER';
      progress:
        | 0
        | 1
        | 2
        | 3
        | 4
        | 5
        | 6
        | 7
        | 8
        | 9
        | 10
        | 11
        | 12
        | 13
        | 14
        | 15
        | 16
        | 17
        | 18
        | 19
        | 20
        | 21
        | 22
        | 23
        | 24
        | 25
        | 26
        | 27;
    }
  | { zone: 'HOME'; homeIndex: 0 | 1 | 2 | 3 }
  | { zone: 'REMOVED' };

type PlayerMatchStatus = 'ACTIVE' | 'SURRENDERED' | 'FINISHED';

type GameState = {
  status: MatchStatus;
  stateVersion: number;
  players: PlayerState[];
  currentPlayerId: string | null;
  turnPhase: TurnPhase | null;
  diceValue: DiceValue | null;
  pawns: PawnState[];
  winnerPlayerId: string | null;
  turnNumber: number;
};
```

`TurnPhase` is non-null only while `status === "ACTIVE"`. Legal actions are deterministic projections and need not be persisted in the match snapshot.

Before activation, a match has exactly the configured number of immutable seat slots but may have fewer occupied players. Every occupied player has one unique allowed seat/color and four uniquely identified `OFF_BOARD` pawns. On `READY` and `ACTIVE`, all configured slots are occupied. After activation the roster, seats, colors, and pawn ownership are immutable. No two non-removed pawns may share a physical coordinate except transiently inside the computation that produces a capture event; persisted snapshots always have globally unique occupancy.

Dice values are integers 1–6. The API adapter uses a cryptographically secure uniform RNG with rejection sampling (or an equivalently unbiased primitive). Starting-seat selection uses the same uniform server-side RNG boundary. Tests inject deterministic RNG values; production never accepts either value from a client.

## API

```ts
transition(state, command, { diceValue? }): GameTransition;
getLegalActions(state, playerId): LegalAction[];
resolvePawnCoordinate(position, owner): BoardCoord | null;
resolvePhysicalPath(state, pawnId, distance): BoardCoord[];
getOccupancy(state): BoardOccupancy;
canMovePawn(state, pawnId, distance): boolean;
isWinningState(state, playerId): boolean;
```

The API receives a server-generated dice value only for `ROLL_DICE`. Clients never provide dice, targets, paths, captures, or home indexes.

## Coordinate model

The normalized clockwise perimeter is exactly:

```text
(0,0)..(0,7), (1,7)..(7,7), (7,6)..(7,0), (6,0)..(1,0)
```

It has 28 coordinates. Player-relative `progress` maps to offsets RED 0, BLUE 7, YELLOW 14, and GREEN 21 modulo 28. `progress` never wraps: the step after 27 enters `HOME(0)`.

Home coordinates are:

```text
RED:    (0,0), (1,1), (2,2), (3,3)
BLUE:   (0,7), (1,6), (2,5), (3,4)
YELLOW: (7,7), (6,6), (5,5), (4,4)
GREEN:  (7,0), (6,1), (5,2), (4,3)
```

Position and physical coordinate are deliberately separate. `physicalCoord(PawnPosition)` feeds one occupancy model covering `PERIMETER` and `HOME`; `OFF_BOARD` and `REMOVED` have no coordinate. Move resolution walks one player-relative sequence from `PERIMETER(0..27)` to `HOME(0..3)` without resetting remaining steps.

## Invariants

- Original state is never mutated.
- Same state, command, and context produce the same transition.
- Every route coordinate is checked, not only its destination.
- `REMOVED` never appears in legal actions or physical calculations.
- A real command recomputes legality; previously returned `LegalAction` is only a UI projection.
- Domain events describe committed facts, not instructions to clients.
- `extraRollGranted` carries one of `ROLLED_SIX`, `CAPTURE`, or `NO_LEGAL_ACTION_ON_SIX`; a successful capture always resolves to exactly one extra-roll event even when it also used a six.
- Dice context is accepted only for `ROLL_DICE` and must be absent for every other command.

## Canonical rules

See [GAME_RULES.md](./GAME_RULES.md). Engine tests must trace each rule to that file.
