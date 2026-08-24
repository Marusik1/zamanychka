# EPIC-03 — Core Game Engine

Implement the deterministic, immutable TypeScript rules engine for Zamanushka exactly as defined by `docs/GAME_RULES.md`, `docs/GAME_ENGINE.md`, and `docs/MATCH_STATE_MACHINE.md`.

## Scope

This epic delivers the pure authoritative game engine for match play:

- canonical state and command types for 2/3/4-player matches;
- seat/color templates and immutable seat assignment;
- perimeter coordinate model for the 28-cell clockwise outer ring;
- `OFF_BOARD`, `PERIMETER`, `HOME`, and `REMOVED` pawn zones;
- legal-action generation;
- deterministic transition execution;
- coordinate, occupancy, and path helpers;
- surrender, victory, and turn-rotation rules;
- domain events describing committed facts;
- table-driven and property-based tests covering all canonical mechanics.

The engine is the single source of truth for game legality. It may be consumed by future realtime, rooms, and API layers, but it must not depend on them.

## Out of scope

EPIC-03 does not implement:

- Fastify, Prisma, PostgreSQL, Redis, Socket.IO, or Telegram integration;
- persistence, idempotency storage, locking, or outbox publication;
- HTTP routes or room lifecycle behavior;
- client UI, animations, or browser APIs;
- matchmaking, chat, profiles, rating, history, or board skins;
- server RNG generation. The engine accepts server-generated dice values only through `context`.

## Domain model

The engine package owns the canonical game types for play state and transitions:

```ts
type MatchStatus = 'WAITING_FOR_PLAYERS' | 'READY' | 'ACTIVE' | 'FINISHED' | 'ABANDONED';
type TurnPhase = 'WAITING_FOR_ROLL' | 'WAITING_FOR_ACTION';
type PlayerMatchStatus = 'ACTIVE' | 'SURRENDERED' | 'FINISHED';
type WinReason = 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER';

type PlayerColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';

type PawnPosition =
  | { zone: 'OFF_BOARD' }
  | {
      zone: 'PERIMETER';
      progress: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27;
    }
  | { zone: 'HOME'; homeIndex: 0 | 1 | 2 | 3 }
  | { zone: 'REMOVED' };
```

State is immutable and deterministic:

```ts
type GameState = {
  status: MatchStatus;
  stateVersion: number;
  players: PlayerState[];
  currentPlayerId: string | null;
  turnPhase: TurnPhase | null;
  diceValue: 1 | 2 | 3 | 4 | 5 | 6 | null;
  pawns: PawnState[];
  winnerPlayerId: string | null;
  turnNumber: number;
};
```

The engine also owns the immutable match-seat template and initial-state factory semantics:

- 2 players: RED + YELLOW
- 3 players: RED + BLUE + GREEN
- 4 players: RED + BLUE + YELLOW + GREEN

Seat order is immutable after start. The initial state factory accepts the configured player count and creates empty seat slots or fully occupied active seats depending on the lifecycle phase:

- pre-start states may contain empty seats;
- `READY` and `ACTIVE` require all configured seats occupied;
- each occupied player receives exactly one immutable seat/color;
- each player starts with four unique `OFF_BOARD` pawns.

The authoritative state also carries immutable match roster data needed by the engine:

- player seat index;
- player color;
- pawn ownership;
- active/surrendered/finished status;
- configured player-count template.

Legal actions are projections and do not need to be persisted in a snapshot.

State-version semantics are fixed:

- the initial authoritative state version is `0`;
- every successful engine transition increments `stateVersion` by exactly `1`;
- failed transitions never mutate state and never increment `stateVersion`;
- EPIC-03 owns only the active-game snapshot contract; lifecycle activation happens outside gameplay transitions;
- `turnNumber` increments by exactly `1` only when an authoritative `turnChanged` event changes `currentPlayerId`;
- extra rolls, six-with-no-action, and failed commands do not increment `turnNumber`.

## Initial ACTIVE state factory

EPIC-03 gameplay does not execute lifecycle transitions such as `READY -> ACTIVE`. Instead, the game engine must provide a factory for the first authoritative active snapshot:

```ts
createActiveGameState(config): GameState
```

The initial active state is defined exactly as:

- `stateVersion = 0`;
- `turnNumber = 1`;
- `status = 'ACTIVE'`;
- `turnPhase = 'WAITING_FOR_ROLL'`;
- `diceValue = null`;
- `winnerPlayerId = null`;
- `currentPlayerId` is set to the first active player selected by the server;
- all pawns start `OFF_BOARD`;
- seat/color assignment is immutable and fully populated;
- all configured players are already active participants.

The factory is deterministic for a given server-selected first player and seat template.

## Commands

The engine accepts only these commands:

```ts
type GameCommand =
  | { type: 'ROLL_DICE'; matchId: string; actionId: string; expectedStateVersion: number }
  | { type: 'ENTER_PAWN'; matchId: string; actionId: string; expectedStateVersion: number; pawnId: string }
  | { type: 'MOVE_PAWN'; matchId: string; actionId: string; expectedStateVersion: number; pawnId: string }
  | { type: 'SURRENDER'; matchId: string; actionId: string; expectedStateVersion: number };
```

The engine never accepts:

- a client-provided dice result;
- target coordinates;
- capture IDs;
- path arrays;
- home indexes;
- implicit reroll requests.

## Transition contract

The canonical boundary is:

```ts
transition(state, command, context): GameTransitionResult
```

`context` is server-authored and must include:

- `actorPlayerId`: the authoritative acting player identity selected by the server session/room layer;
- `diceValue` only when the command is `ROLL_DICE`;
- any additional engine-internal server facts needed to resolve the transition.

The engine never trusts client payload for identity, turn ownership, or dice.

Required guarantees:

- same `state + command + context` produces the same output;
- original state is never mutated;
- returned state and event lists are derived from pure computation;
- all legality checks are performed by the transition, not by the caller;
- hidden automatic rerolls do not exist.

`GameTransitionResult` is a discriminated contract:

```ts
type GameTransitionResult =
  | {
      ok: true;
      state: GameState;
      events: GameEvent[];
      legalActions: LegalAction[];
    }
  | {
      ok: false;
      error: GameTransitionError;
    };
```

Failure is non-mutating:

- no state mutation;
- no emitted events;
- no stateVersion increment;
- no turnNumber increment;

`GameTransitionResult` success contains:

- next immutable state;
- ordered domain events;
- legal actions for the next authoritative state when useful to the caller;
- no error.

## Legal-action model

`getLegalTurnActions(state, playerId)` is phase-aware and returns only turn-dependent legal actions:

- `ROLL_DICE` when the state is `ACTIVE` and `turnPhase` is `WAITING_FOR_ROLL`;
- `ENTER_PAWN` when the state is `ACTIVE` and `turnPhase` is `WAITING_FOR_ACTION`;
- `MOVE_PAWN` when the state is `ACTIVE` and `turnPhase` is `WAITING_FOR_ACTION`.

`getLegalActions(state, playerId)` returns the broader authoritative set of actions currently available to that player, including `SURRENDER`.

The legal-action model must encode:

- entering a pawn on six;
- moving an eligible pawn by the exact dice value;
- capture as part of exact destination resolution;
- surrender availability for any active participant;
- no-action outcomes that change turn or preserve the player depending on the dice semantics.

Legal actions are never trusted as client proof. Every command is revalidated against current authoritative state.

Typed legal-action projections must carry enough data for future UI/API surfaces without becoming command proof:

```ts
type LegalAction =
  | {
      type: 'ENTER_PAWN';
      pawnId: string;
      playerId: string;
      from: { zone: 'OFF_BOARD' };
      to: PawnPosition;
      toCoord: BoardCoord;
      physicalPath: BoardCoord[];
    }
  | {
      type: 'MOVE_PAWN';
      pawnId: string;
      playerId: string;
      from: PawnPosition;
      fromCoord: BoardCoord;
      to: PawnPosition;
      toCoord: BoardCoord;
      physicalPath: BoardCoord[];
      capturePreview?: {
        pawnId: string;
        playerId: string;
        occupantZone: 'PERIMETER' | 'HOME';
      };
    }
  | { type: 'SURRENDER'; playerId: string };
```

`LegalAction` is a projection only. Command proof comes from re-running the authoritative transition.

## Command legality matrix

The engine must apply legality by command, phase, and server actor:

| Command | Required phase/state | Required actor | Additional legality |
| --- | --- | --- | --- |
| `ROLL_DICE` | `ACTIVE` + `WAITING_FOR_ROLL` | current active player | no stored dice |
| `ENTER_PAWN` | `ACTIVE` + `WAITING_FOR_ACTION` | current active player | stored dice is 6 and exact legal action exists |
| `MOVE_PAWN` | `ACTIVE` + `WAITING_FOR_ACTION` | current active player | exact legal action exists for the named pawn |
| `SURRENDER` | `ACTIVE` | any active participant | ignores current-player/turn-phase checks |

`actorPlayerId` is authoritative server context, not client input.

## Coordinate and occupancy model

### Perimeter

The normalized clockwise 28-cell perimeter is canonical and fixed:

```text
(0,0)..(0,7), (1,7)..(7,7), (7,6)..(7,0), (6,0)..(1,0)
```

Player-relative `progress` maps to this ring with immutable seat/color offsets:

- RED: 0
- BLUE: 7
- YELLOW: 14
- GREEN: 21

`progress` is not a display index and does not wrap past 27.

### Physical occupancy

The engine uses one physical occupancy model for every coordinate that can be occupied:

- `PERIMETER` coordinates;
- `HOME(0..3)` coordinates.

`OFF_BOARD` and `REMOVED` have no physical coordinate.

The same physical coordinate can have two semantics only at the owner corner:

- initial perimeter entry point;
- post-lap home entry point `HOME(0)`.

That dual meaning is resolved by pawn state, not by changing the board geometry.

### Helpers

The engine must expose helpers for:

- `resolvePawnCoordinate(position, owner)`;
- `resolvePhysicalPath(state, pawnId, distance)`;
- `getOccupancy(state)`;
- `canMovePawn(state, pawnId, distance)`;
- `isWinningState(state, playerId)`;

`resolvePhysicalPath` returns every visited physical coordinate after the source, including the destination. Therefore `physicalPath.length === distance`.

## Movement algorithm

Movement is resolved as a deterministic step-by-step walk.

Rules:

- movement is always exact;
- every intermediate coordinate is checked;
- the destination is checked;
- no jumping over any pawn;
- no partial stop;
- no bounce;
- no overshoot past `HOME(3)`;
- `HOME(0)` participates in collision and blocking exactly like any other occupied physical coordinate.

For a single move, the path may continue from the perimeter into home without resetting the remaining steps. The engine must treat perimeter-to-home as one continuous route.

## Roll-6 semantics

When the stored roll is 6:

- `ENTER_PAWN` may place exactly one `OFF_BOARD` pawn on the player’s start corner, but only if that physical coordinate is completely free;
- alternatively, an eligible pawn may move exactly six cells;
- if the six enables multiple legal actions, the engine returns all of them in `getLegalActions`;
- if the six enables no legal action, the same player remains current and the resulting state returns to `WAITING_FOR_ROLL` with `diceValue = null`;
- there is no hidden automatic reroll value;
- the next roll is an explicit future `ROLL_DICE` command from the same current player.

The six-with-no-actions branch must preserve the current player and avoid turn rotation.

`SURRENDER` is always independently available and does not replace, suppress, or mutate the six no-action resolution branch.

## HOME semantics

Home is a four-cell diagonal path from each corner toward the center.

Rules:

- `HOME(0)` is the same physical corner as the owner’s perimeter corner, but only after the pawn has completed a full lap;
- `HOME(1)`, `HOME(2)`, and `HOME(3)` are the next diagonal cells toward the center;
- the transition from perimeter into home does not reset remaining steps;
- exact landing is required at every home cell;
- a move beyond `HOME(3)` is illegal;
- home cells obey the same physical occupancy model as the perimeter;
- a friendly pawn may block a home cell and makes that route illegal;
- home cells are owner-only; another player cannot legally enter `HOME(1..3)`;
- occupancy on `HOME(0)` blocks any path that would pass through the corner;
- an opponent physically occupying the corner may be captured only if the move resolves exactly to the owner’s `HOME(0)`;
- when the corner is occupied by a pawn and the route would continue past the corner toward `HOME(1..3)`, the move is illegal and capture does not occur.

The engine must distinguish:

- `PERIMETER(0)` as the start-corner entry point for the initial six;
- `HOME(0)` as the post-lap semantic state occupying the same physical coordinate.

## Capture semantics

Capture is allowed only on an exact final destination.

Rules:

- capture may occur only when the destination is occupied by an opposing pawn;
- capture never occurs on an intermediate step;
- capture never occurs on `ENTER_PAWN`;
- capture returns the opponent pawn to `OFF_BOARD` before the moving pawn’s resulting state is finalized;
- capture does not violate the single physical occupancy model in the persisted result.
- ordinary exact-destination capture of an opponent `PERIMETER` pawn remains allowed on the destination coordinate itself;
- capture legality is zone-sensitive:
  - a pawn occupying `PERIMETER` on the owner’s corner may be captured only by exact destination to the owner’s `HOME(0)`;
  - a pawn already occupying `HOME(0)` blocks all other players and is not a generic perimeter capture target;
  - `HOME(1..3)` are owner-only cells and are not capturable by another player’s legal move.

Special corner rule:

- an occupied start corner may be captured only when the destination is exactly that corner as `HOME(0)`;
- the same occupied corner cannot be captured while merely passing through toward deeper home cells.

## Surrender

Any active participant may surrender, regardless of whose turn it is.

Rules:

- surrender is a valid command only for `ACTIVE` participants;
- all of the player’s pawns become `REMOVED`;
- `REMOVED` pawns do not participate in occupancy, blocking, capture, legal actions, entry, or victory;
- the player becomes `SURRENDERED`;
- the player is removed from turn rotation;
- if the current player surrenders, any pending roll is discarded and the next active player starts at `WAITING_FOR_ROLL`;
- if a non-current player surrenders, the current player, phase, and stored dice remain unchanged until the next authoritative command is processed;
- disconnect is not surrender.

## Victory

The only win reasons are:

1. `HOME_DIAGONAL_COMPLETED` — one player occupies all four home cells with all four pawns;
2. `LAST_ACTIVE_PLAYER` — all other active players have surrendered.

Victory ends the match immediately.

The engine must not support:

- scores;
- timers;
- tiebreakers;
- pawn-count victories;
- draw states for MVP.

## Terminal-state projection

`PlayerMatchStatus.FINISHED` means the player completed the match without surrendering.

Terminal projection rules:

- on `HOME_DIAGONAL_COMPLETED`, the winner becomes `FINISHED`;
- on `LAST_ACTIVE_PLAYER`, the last active player becomes `FINISHED`;
- any non-surrendered player who is not the winner on a normal finish becomes `FINISHED`;
- surrendered players remain `SURRENDERED`;
- `FINISHED` players never re-enter turn rotation or legal-action generation;
- `winnerPlayerId` is set only on terminal winning states;
- terminal states clear `currentPlayerId`, `turnPhase`, and `diceValue`.

## Events

The engine emits deterministic domain events that describe authoritative transition facts produced by the pure engine.

Expected event families include:

- `diceRolled`;
- `pawnEntered`;
- `pawnMoved`;
- `pawnCaptured`;
- `extraRollGranted`;
- `turnChanged`;
- `playerSurrendered`;
- `pawnRemoved`;
- `gameWon`;
- lifecycle/version events required by the future backend layer only if they are explicitly modeled in the engine contract.

Event order must be stable and must reflect the authoritative result of the transition.

Event precedence is fixed:

1. action-committed facts (`diceRolled`, `pawnEntered`, `pawnMoved`, `pawnCaptured`, `playerSurrendered`, `pawnRemoved`);
2. turn/phase facts (`extraRollGranted`, `turnChanged`);
3. terminal fact (`gameWon`) last, when applicable.

After a terminal `gameWon`, the engine must not emit `turnChanged` or `extraRollGranted`.

Home-entry semantics must be explicit in the event stream:

- every `PERIMETER -> HOME` transition must emit `pawnEnteredHome`;
- a move that crosses from the perimeter into the home diagonal may additionally emit `pawnMoved` with a physical path that includes the corner and interior home coordinates;
- if the move ends on `HOME(0)`, that is a legal capture-capable terminal destination when occupied by an opponent;
- if the move ends on deeper home cells, any occupied intermediate corner blocks the move and no capture event is emitted for that corner.

Events must not describe instructions to the client. They describe what the server already committed.

## Error model

The engine must return structured, typed command failures.

At minimum the error model must distinguish:

- unauthorized actor;
- wrong turn/current player;
- stale state version;
- invalid command type for the current phase;
- illegal pawn movement;
- no legal action available;
- illegal entry on occupied corner;
- illegal capture / occupied destination;
- overshoot past home;
- surrendered/removed pawn misuse;
- finished/abandoned match misuse.

Domain error names are authoritative and domain-specific:

- `PLAYER_NOT_IN_MATCH`;
- `PLAYER_NOT_ACTIVE`;
- `NOT_CURRENT_PLAYER`;
- plus the other command-legality errors listed above.

Errors must be deterministic and not depend on caller timing.

The engine must not emit nondeterministic or transport-specific error details.

## Immutability and determinism

The engine is a pure function boundary:

- no mutation of the input state;
- no hidden global state;
- no random number generation inside the engine;
- no Date/time access inside the engine;
- no I/O;
- no persistence;
- no side effects outside the returned transition payload.

The same state, command, and context must always produce the same transition.

## Package boundaries

`packages/game-engine` owns:

- the canonical state machine for gameplay;
- movement and occupancy helpers;
- legal action generation;
- transition logic;
- domain events and error types;
- unit/property test helpers for game rules.

`packages/game-engine` must not import or depend on:

- Fastify;
- Prisma;
- PostgreSQL;
- Redis;
- Socket.IO;
- Telegram;
- React;
- browser APIs;
- UI code;
- persistence/idempotency logic;
- realtime delivery logic.

`packages/shared` may export shared DTOs and schemas that describe engine-facing state, commands, events, and errors, but it does not own the transition logic.

## Testing strategy

Testing must be heavier than a normal utility package because this epic defines the core rule system.

Required tests:

- table-driven tests for all canonical examples in `docs/GAME_RULES.md`;
- property-based tests for exact movement, blocking, capture, and immutability;
- deterministic tests for every command type and guard failure;
- tests for 2/3/4-player seat-color templates;
- tests for perimeter normalization and player-relative offsets;
- tests for shared-corner `PERIMETER(0)` / `HOME(0)` semantics;
- tests for `HOME(0)` blocking and legal capture only on the exact destination;
- tests for six semantics, including the no-action branch;
- tests for non-six no-action turn advancement;
- tests for surrender from current and non-current players;
- tests for both victory reasons;
- tests for helper functions and path length invariants;
- tests for deterministic event ordering;
- tests for immutability and repeatability of `transition`.

Property-based coverage should specifically look for:

- path length equals distance;
- no path step skips an occupied coordinate;
- no home overshoot;
- no capture on intermediate steps;
- no mutation of original state;
- no nondeterministic output for repeated runs.

## Acceptance criteria

EPIC-03 is ready only when:

- the engine is implemented as a pure deterministic TypeScript package;
- the canonical rule set from `docs/GAME_RULES.md` is reflected in tests;
- `transition`, `getLegalActions`, and coordinate/path helpers exist and are covered;
- 2/3/4-player seat templates work;
- capture, home entry, surrender, and victory work exactly as specified;
- six semantics are exact, including the no-action branch;
- `HOME(0)` corner semantics are correct;
- no hidden reroll exists;
- no input mutation or nondeterminism exists;
- the package remains isolated from transport, persistence, and UI concerns.

## Risks and ambiguities

- The engine must keep the owner-corner dual meaning for `PERIMETER(0)` and `HOME(0)` precise enough that path walking and occupancy never disagree.
- `ENTER_PAWN` on six is only legal when the start corner is completely free; this must be enforced consistently with the unified physical occupancy model.
- `HOME(0)` capture is only legal on exact landing, never during a pass-through toward deeper home cells.
- The engine should not infer any automatic reroll or auto-turn behavior beyond the explicit six semantics.
- The package must remain pure; any pressure to add persistence, locking, or transport concerns belongs to later epics.

## Review checklist

Independent review of this spec must confirm:

- no contradiction with `docs/GAME_RULES.md`;
- no hidden auto-rerolls;
- no ambiguous physical occupancy at the corner;
- no off-by-one movement errors in perimeter-to-home transitions;
- no illegal capture semantics;
- no mutation or nondeterminism;
- no architecture leakage into API/persistence/UI layers;
- enough property-based coverage to catch path/blocking regressions.

## Result

EPIC-03 SPEC
READY_PENDING_HUMAN_REVIEW

blockers: none
key decisions:

- one pure authoritative TypeScript engine boundary;
- unified physical occupancy across perimeter and home;
- `HOME(0)` shares the corner physical coordinate with the perimeter start cell but not the same semantic state;
- six with no legal action returns the same player to `WAITING_FOR_ROLL` with `diceValue = null`;
- surrender removes all pawns by setting them to `REMOVED`;
- victory is only `HOME_DIAGONAL_COMPLETED` or `LAST_ACTIVE_PLAYER`.
