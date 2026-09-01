# EPIC-12 — Inactive Corner Rule

## Status

**BLOCKED — product decision required before implementation.**

## Defined behavior

For 2–3 player matches, an exact landing on a corner owned by an absent participant invokes the inactive-corner rule. Passing through such a corner does nothing. Landing on an active corner uses normal occupancy and capture rules. Four-player matches have no inactive corners.

## Decision gate

The phrase “the pawn leaves the board” is not implementation-ready. Choose one:

- **A:** the pawn returns to `OFF_BOARD` and needs a six to enter again;
- **B:** the pawn enters a separately specified state/route.

Do not change engine, persistence, events, or UI until this choice is explicit.

## Required coverage after a decision

2-player exact landings on BLUE/GREEN corners; passing without landing; 3-player unused corner; 4-player regression; occupancy/capture, six, no-jumping, and HOME-entry regressions.
