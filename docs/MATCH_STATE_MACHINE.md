# Match State Machine

```ts
type MatchStatus = 'WAITING_FOR_PLAYERS' | 'READY' | 'ACTIVE' | 'FINISHED' | 'ABANDONED';

type TurnPhase = 'WAITING_FOR_ROLL' | 'WAITING_FOR_ACTION';
```

`turnPhase` is null unless the match is `ACTIVE`. `ANIMATING` is never a server state.

## Lifecycle

- A newly created match is `WAITING_FOR_PLAYERS` with a fixed seat-slot template, `stateVersion = 0`, `lastSequence = 0`, `turnNumber = 0`, null current player/phase/dice/winner, and zero or more occupied seats. Joined participants are marked `ACTIVE` for participation eligibility.
- `WAITING_FOR_PLAYERS -> READY` when the configured seats are filled and every participant is ready.
- `READY -> WAITING_FOR_PLAYERS` if a participant leaves or becomes unready before start.
- `READY -> ACTIVE` through the room start operation. The server uniformly selects one active seat as starting player, sets `turnNumber = 1`, `turnPhase = WAITING_FOR_ROLL`, and clears dice/winner.
- `WAITING_FOR_PLAYERS | READY -> ABANDONED` when the lobby is cancelled. `ABANDONED` is terminal and has no turn phase, current player, dice, or winner.
- `ACTIVE -> FINISHED` only through one of the two canonical victory reasons.

Every successful lifecycle mutation after creation—including join, leave, and readiness change even when status does not change—is an authoritative transition: it increments state version once, writes an immutable version snapshot, and emits its membership/readiness event followed by an applicable status event (`matchReady` or `matchWaiting`) when the status changes. Start and cancellation emit `matchStarted` or `matchAbandoned`. `READY -> ACTIVE` initializes `turnNumber = 1`; it does not add a second turn increment.

Active snapshots obey: current player is an `ACTIVE` participant; winner is null; `WAITING_FOR_ROLL` implies `diceValue = null`; `WAITING_FOR_ACTION` implies a stored dice value and at least one recomputed legal action. Non-active snapshots have `turnPhase = null` and `diceValue = null`.

`WAITING_FOR_PLAYERS` and `READY` also require `currentPlayerId = null`, `winnerPlayerId = null`, and every joined participant to be `ACTIVE`. `WAITING_FOR_PLAYERS` may contain empty slots; `READY` requires all configured slots occupied and ready. `ABANDONED` preserves participant/seat history but has null current player/phase/dice/winner.

## Commands

- `ROLL_DICE(matchId, actionId, expectedStateVersion)`
- `ENTER_PAWN(matchId, actionId, expectedStateVersion, pawnId)`
- `MOVE_PAWN(matchId, actionId, expectedStateVersion, pawnId)`
- `SURRENDER(matchId, actionId, expectedStateVersion)`

Normative guards, checked after replay/collision lookup:

- `ROLL_DICE`: match `ACTIVE`; actor is an active member and the current player; phase `WAITING_FOR_ROLL`; no stored dice.
- `ENTER_PAWN`: match `ACTIVE`; actor is active/current; phase `WAITING_FOR_ACTION`; stored dice is 6; the named pawn belongs to the actor; recomputed legal actions contain that exact intent.
- `MOVE_PAWN`: match `ACTIVE`; actor is active/current; phase `WAITING_FOR_ACTION`; the named pawn belongs to the actor; recomputed legal actions contain that exact intent.
- `SURRENDER`: match `ACTIVE`; actor is an `ACTIVE` participant. Current-player and turn-phase checks do not apply.

Guard failures do not mutate game state. Authorization is checked before rule-specific errors so private match state is not disclosed.

Before a match, leaving is room behavior (`LEAVE_ROOM`). During a match, disconnect changes no game state. Explicit permanent exit is `SURRENDER`.

## Roll transition

`ROLL_DICE` is a complete authoritative transition and increments `stateVersion` once.

- Legal actions exist: persist dice and enter `WAITING_FOR_ACTION`.
- No actions with 1–5: emit `diceRolled`, then `turnChanged`; next player enters `WAITING_FOR_ROLL`.
- No actions with 6: emit `diceRolled`, then `extraRollGranted`; same player enters `WAITING_FOR_ROLL`. A future explicit command generates the next roll.

Both no-action branches clear `diceValue` in their resulting snapshot.

`turnNumber` counts current-player turn opportunities. It begins at 1 and increments exactly when a `turnChanged` event changes `currentPlayerId`. Extra rolls for the same player do not increment it. The next player is selected cyclically through immutable match seat order, skipping every non-`ACTIVE` participant.

## Action transition

`ENTER_PAWN` and `MOVE_PAWN` consume the stored roll. On success:

- victory: match becomes `FINISHED`;
- stored roll 6: same player returns to `WAITING_FOR_ROLL`, with `diceValue = null`;
- stored roll 1–5: next active player enters `WAITING_FOR_ROLL`.

## Surrender transition

Surrender does not require the sender to be current. Event order is `playerSurrendered`, one `pawnRemoved` per pawn, then `turnChanged` or `gameWon` when applicable. If one active player remains, the match finishes with `LAST_ACTIVE_PLAYER`. On normal completion, remaining active players become `FINISHED`; earlier surrendered players remain `SURRENDERED`.

Every `FINISHED` snapshot has `winnerPlayerId` set, `currentPlayerId = null`, `turnPhase = null`, and `diceValue = null`. The winner and every non-surrendered participant are `FINISHED`; surrendered participants remain `SURRENDERED`.

## Client presentation

Client presentation may be `IDLE`, `ROLLING_DICE`, `ANIMATING_MOVE`, `ANIMATING_CAPTURE`, `ANIMATING_HOME_ENTRY`, or `SHOWING_RESULT`. It consumes events in sequence. A newer authoritative snapshot cancels stale animation, clears incompatible queued events, and reconciles directly.
