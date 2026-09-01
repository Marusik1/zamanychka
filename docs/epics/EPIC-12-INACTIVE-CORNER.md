# EPIC-12 — Inactive Corner Rule

## Status

**COMPLETE — decision A implemented and verified.**

## Defined behavior

For 2–3 player matches, an exact landing on a corner owned by an absent participant invokes the inactive-corner rule. Passing through such a corner does nothing. Landing on an active corner uses normal occupancy and capture rules. Four-player matches have no inactive corners.

## Decision gate

Decision A is canonical: when a pawn lands exactly on a corner whose owner color is absent from the immutable match roster, its final position becomes `OFF_BOARD`. It returns only by the ordinary six/`ENTER_PAWN` flow. Passing through an inactive corner does nothing. Active corners preserve normal occupancy and capture behavior. No new pawn state or frontend rule is introduced.

## Required coverage after a decision

2-player exact landings on BLUE/GREEN corners; passing without landing; active YELLOW capture; 3-player unused YELLOW corner; 4-player regression; occupancy/capture, six, no-jumping, and HOME-entry regressions. The journal preserves the physical landing coordinate in `pawnMoved` and then emits `pawnRemoved(INACTIVE_CORNER_EXIT)` for presentation reconciliation.
