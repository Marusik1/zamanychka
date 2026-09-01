# EPIC-11 — Extra Roll After Capture

## Goal

Add one canonical gameplay rule: after a successful exact-landing `MOVE_PAWN` capture, the attacking player receives one explicit additional `ROLL_DICE`.

## Canonical rule

```text
pawnMoved
→ pawnCaptured
→ extraRollGranted
→ same current player, WAITING_FOR_ROLL
```

`rolledSix || capturedPawn` grants one next roll, never two. `ENTER_PAWN` is never a capture. A non-capturing move on 1–5 still changes turn; six without a capture retains its current behavior.

## Boundaries

- Implement the rule in `packages/game-engine`; the web client never decides capture or extra-roll eligibility.
- Reuse the existing event journal, shared event schema, command processor, transition FIFO, `GameDie`, and extra-roll presentation.
- Preserve server RNG, idempotency, state-version semantics, and existing capture/off-board behavior.

## Required tests

- capture with 1 and 5 grants an extra roll;
- capture with 6 grants exactly one extra roll;
- ordinary 1–5 move changes turn;
- six without capture retains the old extra-roll behavior;
- `ENTER_PAWN` is not capture;
- captured pawn is `OFF_BOARD`.

## Acceptance and checkpoint

Two-player smoke: Player A captures Player B after a normal roll, B returns to reserve, and A can roll again. Run focused engine/shared tests, relevant API/realtime tests, package gates, and manual smoke before committing:

```text
game: grant extra roll after capture
```
