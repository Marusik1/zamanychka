# Game Engine

## Boundary

`packages/game-engine` is a deterministic, immutable TypeScript library. It has no dependency on Fastify, Prisma, PostgreSQL, Redis, Socket.IO, Telegram, browser APIs, or UI code.

## Core state

```ts
type PawnPosition =
  | { zone: "OFF_BOARD" }
  | { zone: "PERIMETER"; progress: number }
  | { zone: "HOME"; homeIndex: 0 | 1 | 2 | 3 }
  | { zone: "REMOVED" };

type PlayerMatchStatus = "ACTIVE" | "SURRENDERED" | "FINISHED";

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

A single normalized clockwise perimeter is rotated for each player. Position and physical coordinate are deliberately separate. `physicalCoord(PawnPosition)` feeds one occupancy model covering `PERIMETER` and `HOME`; `OFF_BOARD` and `REMOVED` have no coordinate.

## Invariants

- Original state is never mutated.
- Same state, command, and context produce the same transition.
- Every route coordinate is checked, not only its destination.
- `REMOVED` never appears in legal actions or physical calculations.
- A real command recomputes legality; previously returned `LegalAction` is only a UI projection.
- Domain events describe committed facts, not instructions to clients.

## Canonical rules

See [GAME_RULES.md](./GAME_RULES.md). Engine tests must trace each rule to that file.
