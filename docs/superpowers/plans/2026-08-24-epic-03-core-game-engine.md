# EPIC-03 Core Game Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, immutable `packages/game-engine` rules engine for Zamanushka, including authoritative state, movement, legal actions, surrender, victory, and tests that fully trace `docs/GAME_RULES.md`.

**Architecture:** Keep game rules in a pure TypeScript engine with no transport, persistence, UI, or browser dependencies. Make `packages/game-engine` the canonical owner of the gameplay domain model, event/error contracts, transition logic, occupancy resolution, and legal-action generation. Let `packages/shared` consume and re-export those contracts as API-facing schemas where needed, rather than mirroring them independently. Design the engine around pure helpers and a single deterministic `transition(state, command, context)` boundary.

**Tech Stack:** TypeScript, `packages/game-engine`, `packages/shared`, Vitest, table-driven tests, property-based tests where appropriate.

---

### Task 1: Canonical domain contracts and active-state factory

**Files:**
- Create: `packages/game-engine/src/domain/types.ts`
- Create: `packages/game-engine/src/domain/contracts.ts`
- Create: `packages/game-engine/src/domain/create-active-game-state.ts`
- Modify: `packages/game-engine/src/index.ts`
- Test: `packages/game-engine/src/domain/create-active-game-state.test.ts`
- Test: `packages/game-engine/src/domain/contracts.test.ts`
- Modify: `packages/shared/src/index.ts` only to re-export canonical engine contracts if the package surface needs them

- [ ] **Step 1: Write the failing test**

```ts
it('creates the canonical initial ACTIVE snapshot', () => {
  const state = createActiveGameState({
    playerCount: 4,
    firstPlayerId: 'p1',
    seatOrder: ['p1', 'p2', 'p3', 'p4'],
  });

  expect(state.stateVersion).toBe(0);
  expect(state.turnNumber).toBe(1);
  expect(state.status).toBe('ACTIVE');
  expect(state.turnPhase).toBe('WAITING_FOR_ROLL');
  expect(state.diceValue).toBeNull();
  expect(state.winnerPlayerId).toBeNull();
  expect(state.currentPlayerId).toBe('p1');
  expect(state.pawns.every((pawn) => pawn.position.zone === 'OFF_BOARD')).toBe(true);
});
```

```ts
type ExpectTrue<T extends true> = T;
type _ContractsStayCanonical = ExpectTrue<
  typeof gameEngineContracts extends {
    GameEvent: infer GameEvent;
    GameTransitionError: infer GameTransitionError;
    GameTransitionResult: infer GameTransitionResult;
  }
    ? [GameEvent, GameTransitionError, GameTransitionResult] extends [never, never, never]
      ? false
      : true
    : false
>;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- create-active-game-state`
Expected: FAIL because the factory, contracts, and types are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement the canonical domain types, `GameEvent`, `GameTransitionError`, `GameTransitionResult`, player-color templates, match/pawn state, and `createActiveGameState(config)` with deterministic seat assignment and four `OFF_BOARD` pawns per player. Keep `packages/shared` as a consumer/re-export layer only. Do not define duplicate canonical gameplay contracts in `packages/shared`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- create-active-game-state`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/domain/types.ts packages/game-engine/src/domain/contracts.ts packages/game-engine/src/domain/create-active-game-state.ts packages/game-engine/src/index.ts packages/game-engine/src/domain/create-active-game-state.test.ts packages/game-engine/src/domain/contracts.test.ts packages/shared/src/index.ts
git commit -m "feat(game-engine): add canonical domain types"
```

### Task 2: Perimeter coordinates and player-relative mapping

**Files:**
- Create: `packages/game-engine/src/board/perimeter.ts`
- Modify: `packages/game-engine/src/domain/types.ts`
- Test: `packages/game-engine/src/board/perimeter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('maps each color to the correct 28-cell clockwise perimeter offset', () => {
  expect(resolvePerimeterCoord('RED', 0)).toEqual({ row: 0, col: 0 });
  expect(resolvePerimeterCoord('BLUE', 0)).toEqual({ row: 0, col: 7 });
  expect(resolvePerimeterCoord('YELLOW', 0)).toEqual({ row: 7, col: 7 });
  expect(resolvePerimeterCoord('GREEN', 0)).toEqual({ row: 7, col: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- perimeter`
Expected: FAIL because the mapping helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement normalized perimeter ordering, color offsets, `progress -> coord` resolution, and any helper needed to convert owner-relative progress to physical board coordinates.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- perimeter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/board/perimeter.ts packages/game-engine/src/board/perimeter.test.ts packages/game-engine/src/domain/types.ts
git commit -m "feat(game-engine): add perimeter coordinate mapping"
```

### Task 3: Physical occupancy and HOME coordinate resolution

**Files:**
- Create: `packages/game-engine/src/board/occupancy.ts`
- Create: `packages/game-engine/src/board/home.ts`
- Test: `packages/game-engine/src/board/occupancy.test.ts`
- Test: `packages/game-engine/src/board/home.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('treats the owner corner as shared physical space with distinct PERIMETER and HOME semantics', () => {
  const coord = resolvePawnCoordinate({ zone: 'HOME', homeIndex: 0 }, { color: 'RED' });
  expect(coord).toEqual({ row: 0, col: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- occupancy`
Expected: FAIL because occupancy/home resolution is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement `resolvePawnCoordinate`, `getOccupancy`, and home-corner resolution for `HOME(0..3)` with unified physical occupancy and `REMOVED`/`OFF_BOARD` exclusion.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- occupancy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/board/occupancy.ts packages/game-engine/src/board/home.ts packages/game-engine/src/board/occupancy.test.ts packages/game-engine/src/board/home.test.ts
git commit -m "feat(game-engine): add occupancy and home resolution"
```

### Task 4: Turn rotation helper and player selection

**Files:**
- Create: `packages/game-engine/src/turns/turn-rotation.ts`
- Test: `packages/game-engine/src/turns/turn-rotation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('selects the next active player cyclically and skips surrendered players', () => {
  const next = getNextActivePlayerId(state, 'p1');
  expect(next).toBe('p3');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- turn-rotation`
Expected: FAIL because turn-rotation helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement the deterministic turn-order helper used by `ROLL_DICE`, no-action resolution, surrender rotation, and terminal projection. Keep it pure and reusable by transitions.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- turn-rotation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/turns/turn-rotation.ts packages/game-engine/src/turns/turn-rotation.test.ts
git commit -m "feat(game-engine): add turn rotation helper"
```

### Task 5: Physical path and movement legality

**Files:**
- Create: `packages/game-engine/src/movement/path.ts`
- Create: `packages/game-engine/src/movement/move-legality.ts`
- Test: `packages/game-engine/src/movement/path.test.ts`
- Test: `packages/game-engine/src/movement/move-legality.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('returns a physical path containing every visited coordinate after source, including destination', () => {
  const path = resolvePhysicalPath(state, pawnId, 3);
  expect(path).toHaveLength(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- path`
Expected: FAIL because path resolution and movement legality are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement exact-step path walking, no jumping, intermediate blocking, exact destination checks, overshoot rejection, and `physicalPath.length === distance`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- path`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/movement/path.ts packages/game-engine/src/movement/move-legality.ts packages/game-engine/src/movement/path.test.ts packages/game-engine/src/movement/move-legality.test.ts
git commit -m "feat(game-engine): add physical path resolution"
```

### Task 6: Legal-action generation

**Files:**
- Create: `packages/game-engine/src/actions/legal-actions.ts`
- Test: `packages/game-engine/src/actions/legal-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('returns phase-aware turn actions and broad actions with surrender separated', () => {
  const turnActions = getLegalTurnActions(state, 'p1');
  const broadActions = getLegalActions(state, 'p1');
  expect(turnActions.map((action) => action.type)).toContain('ROLL_DICE');
  expect(turnActions.map((action) => action.type)).not.toContain('SURRENDER');
  expect(broadActions.map((action) => action.type)).toContain('SURRENDER');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- legal-actions`
Expected: FAIL because legal action generation does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `getLegalTurnActions()` and `getLegalActions()` with phase-aware logic, including `ROLL_DICE` in the turn-action projection and `SURRENDER` only in the broader projection.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- legal-actions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/actions/legal-actions.ts packages/game-engine/src/actions/legal-actions.test.ts
git commit -m "feat(game-engine): add legal action generation"
```

### Task 7: ROLL_DICE transition, no-action semantics, and victory precheck

**Files:**
- Create: `packages/game-engine/src/transitions/roll-dice.ts`
- Modify: `packages/game-engine/src/transitions/transition.ts`
- Test: `packages/game-engine/src/transitions/roll-dice.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('keeps the same player and returns to WAITING_FOR_ROLL when a six has no legal action', () => {
  const result = transition(state, rollDiceCommand, { actorPlayerId: 'p1', diceValue: 6 });
  expect(result).toEqual({
    ok: true,
    state: expect.objectContaining({
      stateVersion: 1,
      currentPlayerId: 'p1',
      turnPhase: 'WAITING_FOR_ROLL',
      diceValue: null,
    }),
    events: [
      expect.objectContaining({ type: 'diceRolled' }),
      expect.objectContaining({ type: 'extraRollGranted' }),
    ],
    legalActions: expect.arrayContaining([
      expect.objectContaining({ type: 'ROLL_DICE' }),
      expect.objectContaining({ type: 'SURRENDER' }),
    ]),
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- roll-dice`
Expected: FAIL because the transition and no-action semantics are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement `ROLL_DICE` as a pure authoritative transition, including `1..5` no-action turn changes, `6` extra-roll/no-action behavior, explicit dice consumption, and `stateVersion += 1` exactly once on success. Make the transition consult victory conditions before pawn-action transitions so a winning board state terminalizes immediately when relevant.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- roll-dice`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/transitions/roll-dice.ts packages/game-engine/src/transitions/transition.ts packages/game-engine/src/transitions/roll-dice.test.ts
git commit -m "feat(game-engine): add roll dice transition"
```

### Task 8: ENTER_PAWN / MOVE_PAWN / capture / HOME transitions and victory completion

**Files:**
- Create: `packages/game-engine/src/transitions/pawn-actions.ts`
- Test: `packages/game-engine/src/transitions/pawn-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('emits pawnEnteredHome on every perimeter-to-home move and terminalizes on capture or victory when applicable', () => {
  const result = transition(state, movePawnCommand, { actorPlayerId: 'p1' });
  expect(result).toEqual({
    ok: true,
    state: expect.any(Object),
    events: [
      expect.objectContaining({ type: 'pawnMoved' }),
      expect.objectContaining({ type: 'pawnEnteredHome' }),
    ],
    legalActions: expect.any(Array),
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- pawn-actions`
Expected: FAIL because pawn actions and home transitions are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement `ENTER_PAWN`, `MOVE_PAWN`, exact capture rules, `HOME(0)` blocking, owner-only `HOME(1..3)`, mandatory `pawnEnteredHome` emission on every perimeter-to-home transition, and terminal victory detection inside the pawn-transition path so a finishing move ends the match in the same transition.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- pawn-actions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/transitions/pawn-actions.ts packages/game-engine/src/transitions/pawn-actions.test.ts
git commit -m "feat(game-engine): add pawn transitions"
```

### Task 9: Surrender, turn rotation, and terminal victory

**Files:**
- Create: `packages/game-engine/src/transitions/surrender.ts`
- Create: `packages/game-engine/src/transitions/victory.ts`
- Test: `packages/game-engine/src/transitions/surrender.test.ts`
- Test: `packages/game-engine/src/transitions/victory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('marks the last active player as the winner and terminalizes the match', () => {
  const result = transition(state, surrenderCommand, { actorPlayerId: 'p2' });
  expect(result).toEqual({
    ok: true,
    state: expect.objectContaining({
      status: 'FINISHED',
      winnerPlayerId: 'p1',
      currentPlayerId: null,
      turnPhase: null,
      diceValue: null,
    }),
    events: [
      expect.objectContaining({ type: 'playerSurrendered' }),
      expect.objectContaining({ type: 'pawnRemoved', pawnId: 'p2-pawn-1' }),
      expect.objectContaining({ type: 'pawnRemoved', pawnId: 'p2-pawn-2' }),
      expect.objectContaining({ type: 'pawnRemoved', pawnId: 'p2-pawn-3' }),
      expect.objectContaining({ type: 'pawnRemoved', pawnId: 'p2-pawn-4' }),
      expect.objectContaining({ type: 'gameWon' }),
    ],
    legalActions: [],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- surrender`
Expected: FAIL because surrender and terminal victory are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement surrender from current/non-current players, turn rotation that skips surrendered players, `HOME_DIAGONAL_COMPLETED` and `LAST_ACTIVE_PLAYER`, and terminal-state projection for `FINISHED` players. Keep victory detection available to pawn transitions as well, but ensure this task covers surrender-driven terminalization and turn rotation.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- surrender`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/transitions/surrender.ts packages/game-engine/src/transitions/victory.ts packages/game-engine/src/transitions/surrender.test.ts packages/game-engine/src/transitions/victory.test.ts
git commit -m "feat(game-engine): add surrender and victory"
```

### Task 10: Deterministic runtime event/error helpers

**Files:**
- Create: `packages/game-engine/src/events/events.ts`
- Create: `packages/game-engine/src/errors/errors.ts`
- Test: `packages/game-engine/src/events/events.test.ts`
- Test: `packages/game-engine/src/errors/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('returns domain errors without mutating state on illegal commands', () => {
  const result = transition(state, illegalCommand, { actorPlayerId: 'p2' });
  expect(result).toEqual({
    ok: false,
    error: {
      code: 'NOT_CURRENT_PLAYER',
      message: expect.any(String),
    },
  });
  expect(state).toEqual(originalState);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/game-engine test -- events`
Expected: FAIL because event and error contracts are not finalized yet.

- [ ] **Step 3: Write minimal implementation**

Implement fixed runtime event helpers and `GameTransitionError` codes, plus failure behavior with no mutation, no events, and no version increments. Canonical gameplay unions remain owned by Task 1; Task 10 only owns runtime event/error helper implementations.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/game-engine test -- events`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/events/events.ts packages/game-engine/src/errors/errors.ts packages/game-engine/src/events/events.test.ts packages/game-engine/src/errors/errors.test.ts
git commit -m "feat(game-engine): add events and errors"
```

### Task 11: Property-based hardening and final engine verification

**Files:**
- Modify: `packages/game-engine/src/**/*.ts`
- Test: `packages/game-engine/src/**/*.test.ts`
- Potentially modify shared contracts in `packages/shared` if engine-facing types need to be exported

- [ ] **Step 1: Write the failing property-based tests**

Cover at least:

```ts
it('preserves path-length invariant', () => {});
it('rejects occupied-step blocking', () => {});
it('rejects intermediate capture', () => {});
it('rejects HOME overshoot', () => {});
it('keeps transition immutable', () => {});
it('remains deterministic for repeated runs', () => {});
```

- [ ] **Step 2: Run focused package tests**

Run: `pnpm -C packages/game-engine test`
Expected: PASS before expanding outward.

- [ ] **Step 3: Tighten implementation if any property fails**

Fix the engine only within `packages/game-engine` and `packages/shared` if a shared contract needs adjustment.

- [ ] **Step 4: Run final engine verification**

Run:

```bash
pnpm -C packages/game-engine test
pnpm -C packages/game-engine typecheck
pnpm -C packages/shared test
pnpm -C packages/shared typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine packages/shared
git commit -m "feat(game-engine): harden rules engine"
```

---

## Verification policy

Use focused package tests first for each task. Reserve full repo verification for the EPIC-03 final gate unless a cross-package contract change forces broader validation earlier.

---

## Epic-level risks to watch

- `HOME(0)` corner semantics must stay physically unified but semantically distinct from the initial perimeter corner state.
- `ENTER_PAWN` must never capture and must only allow a totally free start coordinate.
- `ROLL_DICE` no-action semantics must not accidentally suppress surrender.
- `stateVersion` must increment exactly once on every successful command and never on failure.
- `turnNumber` must change only on real turn changes.
- Property-based tests must keep catching blocking and capture regressions, not just happy paths.
