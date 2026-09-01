# Canonical Game Rules

This file is the single canonical source for gameplay rules.

## Board and players

- 2–4 players; four pawns per player.
- Colors: red, blue, green, yellow. Each player owns one corner.
- The physical board is a normal 8x8 grid.
- Pawns begin `OFF_BOARD`.
- Internal coordinates are zero-based `{ row, col }` from the top-left. Chess-like labels are presentation-only.
- Fixed corners are RED `(0,0)`, BLUE `(0,7)`, YELLOW `(7,7)`, and GREEN `(7,0)`.
- Seat order is immutable after match start. Two players use RED/YELLOW; three use RED/BLUE/GREEN; four use RED/BLUE/YELLOW/GREEN. Players do not choose colors in MVP.

## Perimeter movement

- All normal movement is clockwise on the 28-cell outer perimeter.
- A pawn moves exactly the rolled number of cells.
- Every intermediate physical coordinate and the destination are validated.
- A pawn may not jump over any pawn, friendly or opposing.
- A pawn may not land on a friendly pawn.
- Landing exactly on an opposing perimeter pawn captures it and returns it to `OFF_BOARD`.
- A successful `MOVE_PAWN` capture grants the moving player one additional explicit roll, whether the consumed die was 1–5 or 6. A move that both rolls six and captures still grants exactly one additional roll.
- `ENTER_PAWN` is never a capture and never receives this capture bonus.
- In a two- or three-player match, exact landing on a corner owned by a color absent from the immutable match roster returns the moving pawn to `OFF_BOARD`. Passing through that corner does nothing. Active-player corners retain the normal occupancy and capture rules. The pawn re-enters only through the ordinary six/`ENTER_PAWN` rule.

## Rolling a six

- A six may enter one `OFF_BOARD` pawn on the player's start corner when that physical coordinate is completely free.
- Alternatively, an eligible pawn may move exactly six cells.
- `ENTER_PAWN` is not a capture and is illegal if any pawn occupies the start coordinate.
- After any successful action based on a six, the roll is consumed, the same player remains current, and phase becomes `WAITING_FOR_ROLL` for a new explicit `ROLL_DICE` command.
- If a six produces no legal action, no automatic dice result is generated. The same player remains current and phase returns to `WAITING_FOR_ROLL`.

## No action

- When 1–5 produces no legal action, the turn advances to the next active player.
- When 6 produces no legal action, the current player keeps the turn as described above.

## Home diagonal

- After one complete perimeter lap, a pawn returns to its owner corner and changes from `PERIMETER` to `HOME(0)`.
- The corner is one physical coordinate with two semantic uses: initial `PERIMETER(0)` and post-lap `HOME(0)`.
- `HOME(1)`, `HOME(2)`, and `HOME(3)` are the next three diagonal cells toward the center.
- Remaining steps are not reset on the perimeter-to-home transition. A single move may continue from the final perimeter cell through `HOME(0)` and onward.
- Exact movement is required. From `HOME(0)`, a roll of 2 reaches `HOME(2)` (for A1, physical C3).
- A pawn in `HOME(0)` physically blocks that corner for every pawn and every perimeter path.
- `HOME(1..3)` occupy interior cells and do not block the perimeter.
- Home cells obey physical occupancy and no-jumping rules.
- If an opponent in `PERIMETER` occupies the physical corner and the move ends exactly at `HOME(0)`, that opponent is captured and the moving pawn enters `HOME(0)`.
- If the occupied corner is an intermediate step toward `HOME(1..3)`, the move is illegal; capture never occurs on an intermediate step.
- A move beyond `HOME(3)` is illegal. There is no bounce, partial move, or forced stop.
- Every occupied intermediate home cell blocks movement. A friendly occupied destination is illegal; opposing pawns cannot normally enter `HOME(1..3)`.

## Victory

A player wins immediately by either:

1. occupying `HOME(0)`, `HOME(1)`, `HOME(2)`, and `HOME(3)` with all four pawns (`HOME_DIAGONAL_COMPLETED`); or
2. becoming the only remaining active player after all opponents surrender (`LAST_ACTIVE_PLAYER`).

No score, timer, tiebreak, or pawn-count victory exists in MVP.

## Surrender

- Any active participant may surrender regardless of whose turn it is.
- All their pawns become `REMOVED` and cease to participate in occupancy, blocking, capture, entry, legal actions, and victory calculation.
- The player becomes `SURRENDERED` and is removed from turn rotation.
- If the current player surrenders, any pending roll is discarded and the next active player starts in `WAITING_FOR_ROLL`.
- If a non-current player surrenders, `currentPlayerId`, `turnPhase`, and `diceValue` are unchanged; legality is recomputed when the next command is processed.
- Disconnect never implies surrender in MVP.
