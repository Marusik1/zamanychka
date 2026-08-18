# Match State Machine

```ts
type MatchStatus =
  | "WAITING_FOR_PLAYERS"
  | "READY"
  | "ACTIVE"
  | "FINISHED"
  | "ABANDONED";

type TurnPhase = "WAITING_FOR_ROLL" | "WAITING_FOR_ACTION";
```

`turnPhase` is null unless the match is `ACTIVE`. `ANIMATING` is never a server state.

## Commands

- `ROLL_DICE(matchId, actionId, expectedStateVersion)`
- `ENTER_PAWN(matchId, actionId, expectedStateVersion, pawnId)`
- `MOVE_PAWN(matchId, actionId, expectedStateVersion, pawnId)`
- `SURRENDER(matchId, actionId, expectedStateVersion)`

Before a match, leaving is room behavior (`LEAVE_ROOM`). During a match, disconnect changes no game state. Explicit permanent exit is `SURRENDER`.

## Roll transition

`ROLL_DICE` is a complete authoritative transition and increments `stateVersion` once.

- Legal actions exist: persist dice and enter `WAITING_FOR_ACTION`.
- No actions with 1–5: emit `diceRolled`, then `turnChanged`; next player enters `WAITING_FOR_ROLL`.
- No actions with 6: emit `diceRolled`, then `extraRollGranted`; same player enters `WAITING_FOR_ROLL`. A future explicit command generates the next roll.

## Action transition

`ENTER_PAWN` and `MOVE_PAWN` consume the stored roll. On success:

- victory: match becomes `FINISHED`;
- stored roll 6: same player returns to `WAITING_FOR_ROLL`, with `diceValue = null`;
- stored roll 1–5: next active player enters `WAITING_FOR_ROLL`.

## Surrender transition

Surrender does not require the sender to be current. Event order is `playerSurrendered`, one `pawnRemoved` per pawn, then `turnChanged` or `gameWon` when applicable. If one active player remains, the match finishes with `LAST_ACTIVE_PLAYER`. On normal completion, remaining active players become `FINISHED`; earlier surrendered players remain `SURRENDERED`.

## Client presentation

Client presentation may be `IDLE`, `ROLLING_DICE`, `ANIMATING_MOVE`, `ANIMATING_CAPTURE`, `ANIMATING_HOME_ENTRY`, or `SHOWING_RESULT`. It consumes events in sequence. A newer authoritative snapshot cancels stale animation, clears incompatible queued events, and reconciles directly.
