# EPIC-06 visual animation hooks

This patch adds **presentation-only** motion hooks. They do not decide gameplay, path, capture, HOME, dice values, or victory.

## Pawn hooks

`GamePawn` accepts:

```ts
motion:
  | 'idle'
  | 'selected'
  | 'entering'
  | 'moving'
  | 'captured'
  | 'home-cue'
  | 'home-complete'
  | 'removed'
```

Use them later from the committed-event animation director:

- `pawnEntered` → `entering`
- each canonical `pawnMoved.physicalPath` step → `moving`
- `pawnCaptured` → captured pawn `captured`; attacking pawn is already at committed destination
- `pawnEnteredHome` → `home-cue` only; **never spatially move again**
- completed HOME diagonal / pre-victory presentation → stagger `home-complete` by canonical HOME index
- `pawnRemoved` → `removed`

The Task 3 generation/epoch invalidation must still own cancellation of stale callbacks.

## Die hook

`GameDie` accepts:

```ts
rolling?: boolean
```

The rendered face is always the committed `value`. `rolling` only adds the decorative visual motion.

## Recommended later Task 5 timings

```ts
diceRoll: 620
pawnEnter: 420
pawnStep: 155
captureImpact: 100
captureExit: 360
homeCue: 260
homeCompletePerPawn: 120
victoryReveal: 500
```

These timings are presentation defaults, not protocol/game constants.

## Capture choreography

1. Animate the moving pawn through the canonical `physicalPath`.
2. Settle on the committed destination.
3. Brief destination impact cue.
4. Captured pawn uses `captured`.
5. Reconcile the captured pawn to canonical OFF_BOARD presentation after the visual exit.
6. Never capture on an intermediate crossed cell.

## HOME completion choreography

When the committed state already has all four pawns in canonical HOME(0..3), do not rearrange them. Apply `home-complete` in HOME-index order with a small stagger:

`HOME(0) → HOME(1) → HOME(2) → HOME(3)`

Then show the committed `gameWon` presentation.

## Reduced motion

The CSS already collapses these animations under `prefers-reduced-motion: reduce`. The eventual Task 5 director should also abbreviate its timers and reconcile directly to committed positions.
