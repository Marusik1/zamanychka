# EPIC-06 Game Screen and Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the actual gameplay screen for Zamanushka with a clean board, physical pawns, dice, legal-action hints, deterministic committed-event animation, responsive mobile/desktop compositions, accessibility, and visual QA.

**Architecture:** The web app remains a presentation layer only. Authoritative gameplay truth comes from EPIC-05 snapshots, events, and sync/reconnect data; EPIC-03 remains the sole game-rule authority; EPIC-04 remains the sole room lifecycle authority. The implementation should introduce a narrow web/domain presentation adapter around canonical game-engine legal actions, then layer board rendering, presentation state, committed-event animation, and responsive composition on top of that adapter.

**Tech Stack:** React, TypeScript, DOM/CSS, existing `apps/web` routing/auth/realtime code, `packages/game-engine` legal-action API, `packages/shared` realtime contracts, browser visual QA tooling already used in the repository.

---

## Repository inspection checkpoints

Before implementation begins, inspect these existing files and patterns:

- `apps/web/src/app.tsx`
- `apps/web/src/app.test.tsx`
- `apps/web/src/auth/*`
- `apps/web/src/shell/*`
- `apps/web/src/styles.css`
- `apps/web/src/main.tsx`
- `apps/web/src/telegram/*`
- `apps/web/src/test-setup.ts`
- `packages/game-engine/src/actions/legal-actions.ts`
- `packages/game-engine/src/domain/*`
- `packages/game-engine/src/movement/*`
- `packages/game-engine/src/events/*`
- `packages/shared/src/realtime.ts`
- `packages/shared/src/index.ts`
- `docs/GAME_RULES.md`
- `docs/GAME_ENGINE.md`
- `docs/MATCH_STATE_MACHINE.md`
- `docs/REALTIME_PROTOCOL.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/TESTING.md`
- `docs/superpowers/specs/2026-08-25-epic-06-game-screen-animation.md`
- `references/ui/MASTER_DESKTOP.png`
- `references/ui/MASTER_MOBILE.png`

This inspection is required before each task group if the boundary changes or if repository evidence contradicts the plan.

## Task 1: Game-screen presentation domain and legal-action adapter

**Files:**
- Create: `apps/web/src/game/domain.ts`
- Create: `apps/web/src/game/domain.test.ts`
- Create: `apps/web/src/game/legal-action-adapter.ts`
- Create: `apps/web/src/game/legal-action-adapter.test.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/shell/routes.tsx` if route selection needs to route into the gameplay screen
- Modify: `apps/web/src/app.test.tsx` if the authenticated shell now mounts gameplay surfaces

**Dependencies:** None. This is the first EPIC-06 task.

**Objective:** Establish the presentation-side domain boundary for gameplay. Define canonical board-coordinate projection, local-player projection, visual state selectors, and a narrow adapter from authoritative EPIC-05 snapshot data to canonical `packages/game-engine` legal actions. The adapter must be the only place where web code consumes legal actions.

**Invariants:**
- React must not reimplement movement legality, capture legality, HOME legality, dice outcome, or victory logic.
- The adapter consumes authoritative EPIC-05 snapshot data and the current local player identity, then projects canonical `LegalAction` hints.
- The presentation model is read-only and disposable.
- If repository evidence shows `apps/web` cannot safely consume `packages/game-engine` directly for legal actions, the task must stop and raise a blocker rather than inventing a second legality source.

**Tests required:**
- canonical coordinate projection
- frozen corner mapping
- frozen HOME mapping
- local-player / participant projection
- legal-action adapter happy path
- legal-action adapter rejects copied rule logic in UI-facing code

**Verification commands:**
- `pnpm -C packages/game-engine test`
- `pnpm -C packages/game-engine typecheck`
- `pnpm -C apps/web test`
- `pnpm -C apps/web typecheck`

**Forbidden scope:**
- board rendering
- animation
- realtime socket changes
- UI composition beyond data projection
- any duplicate gameplay legality in React

**Independent review requirements:**
- spec review against EPIC-06 and EPIC-05 boundaries
- quality review for boundary leakage and duplicated logic

**Commit checkpoint:** Commit the adapter + selector foundation only.

**STOP:** Do not start Task 2 until Task 1 is reviewed and committed.

## Task 2: Gameplay board and physical pawn primitives

**Files:**
- Create: `apps/web/src/game/board.tsx`
- Create: `apps/web/src/game/board.test.tsx`
- Create: `apps/web/src/game/pawns.tsx`
- Create: `apps/web/src/game/pawns.test.tsx`
- Create: `apps/web/src/game/board.css`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/styles.css` if the global layout needs board-scene styles

**Dependencies:** Task 1.

**Objective:** Render the clean 8×8 board and static pawn presentation primitives. Support canonical physical placement for `OFF_BOARD`, `PERIMETER`, `HOME`, and `REMOVED` without adding permanent route markings.

**Invariants:**
- board is exactly 8×8
- no permanent arrows, routes, tracks, or numbered movement overlays
- OFF_BOARD is a player reserve, not a fake board cell
- REMOVED pawns are not active on the board
- physical placement must match canonical engine coordinates
- no duplicate coordinate model in UI

**Tests required:**
- exactly 64 rendered cells
- canonical corner positions
- canonical HOME positions
- OFF_BOARD reserve presentation
- REMOVED state not rendered as active play
- pawn ownership readability states

**Verification commands:**
- `pnpm -C apps/web test`
- `pnpm -C apps/web typecheck`

**Forbidden scope:**
- realtime animation
- legal action logic
- command submission behavior
- snapshot reconciliation

**Independent review requirements:**
- spec review for board/visual fidelity
- quality review for geometry and state mapping

**Commit checkpoint:** Commit only board and pawn primitives.

**STOP:** Do not start Task 3 until Task 2 is reviewed and committed.

## Task 3: Authoritative/presentation controller and FIFO animation queue

**Files:**
- Create: `apps/web/src/game/presentation-controller.ts`
- Create: `apps/web/src/game/presentation-controller.test.ts`
- Create: `apps/web/src/game/transition-queue.ts`
- Create: `apps/web/src/game/transition-queue.test.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/game/domain.ts` if presentation selectors need refinement

**Dependencies:** Tasks 1–2.

**Objective:** Separate authoritative state from presentation state and implement deterministic FIFO transition queueing. Normal contiguous committed transitions enqueue; duplicates ignore; gaps/unsafe transitions defer to EPIC-05 recovery; snapshot fallback invalidates stale presentation history.

**Invariants:**
- presentation state is disposable and never authoritative
- a normal committed transition must not cancel a valid in-flight animation
- duplicate/already-applied transitions do not animate twice
- unsafe/gap transitions stop incremental presentation and invoke the existing EPIC-05 recovery path
- authoritative snapshot fallback immediately invalidates stale presentation queue and reconciles to snapshot

**Tests required:**
- FIFO ordering
- duplicate transition suppression
- multiple envelopes while animation runs
- snapshot during animation
- stale queue invalidation
- authoritative state can advance ahead of visual state
- no backward presentation after reconciliation

**Verification commands:**
- `pnpm -C apps/web test`
- `pnpm -C apps/web typecheck`

**Forbidden scope:**
- network protocol changes
- sync protocol redesign
- game-rule duplication
- animation timing coupled to command processing

**Independent review requirements:**
- spec review for queue semantics
- quality review for deterministic ordering and stale-state handling

**Commit checkpoint:** Commit the presentation controller + queue only.

**STOP:** Do not start Task 4 until Task 3 is reviewed and committed.

## Task 4: Dice, turn controls, legal hints, and input locking

**Files:**
- Create: `apps/web/src/game/dice.tsx`
- Create: `apps/web/src/game/dice.test.tsx`
- Create: `apps/web/src/game/turn-controls.tsx`
- Create: `apps/web/src/game/turn-controls.test.tsx`
- Create: `apps/web/src/game/legal-hints.tsx`
- Create: `apps/web/src/game/legal-hints.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/game/domain.ts`

**Dependencies:** Tasks 1–3.

**Objective:** Build the interactive gameplay surface: roll button, committed dice presentation, legal-action hints, pawn selection, ENTER affordance, MOVE submission, command-pending behavior, duplicate-click prevention, waiting-for-opponent presentation, extra-roll handling, and terminal disabling.

**Invariants:**
- `ROLL_DICE` sends intent only
- client animation ends on the committed server dice value
- legal hints derive only from the canonical legal-action adapter
- React does not copy legality rules
- UI locking prevents duplicate local intent only; it is not gameplay authority

**Tests required:**
- roll availability
- no client-selected dice value
- legal vs illegal pawn actions
- ENTER legality presentation
- duplicate-click prevention
- current / waiting state presentation
- terminal control lock

**Verification commands:**
- `pnpm -C apps/web test`
- `pnpm -C apps/web typecheck`

**Forbidden scope:**
- command pipeline changes
- realtime protocol changes
- server RNG changes
- new legal-action protocol

**Independent review requirements:**
- spec review for legality source correctness
- quality review for interaction locking and hint fidelity

**Commit checkpoint:** Commit the interaction surface only.

**STOP:** Do not start Task 5 until Task 4 is reviewed and committed.

## Task 5: Committed-event animation

**Files:**
- Create: `apps/web/src/game/event-animation.ts`
- Create: `apps/web/src/game/event-animation.test.ts`
- Create: `apps/web/src/game/animation-timeline.ts`
- Create: `apps/web/src/game/animation-timeline.test.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/game/presentation-controller.ts`

**Dependencies:** Tasks 1–4.

**Objective:** Map ordered committed EPIC-05 events to deterministic presentation. `pawnMoved` owns spatial motion. `pawnEnteredHome` is semantic only. Capture, removal, surrender, extra roll, turn change, and victory must all animate deterministically from committed event order.

**Invariants:**
- `pawnMoved` is the only spatial pawn movement event
- `pawnEnteredHome` never replays movement
- capture occurs only at exact committed destination
- `ENTER` never captures
- `HOME(0)` visually stops on the shared corner
- `HOME(1..3)` continues along canonical diagonal exactly once
- deterministic pawn removal order on surrender

**Tests required:**
- `diceRolled` animation
- `pawnEntered` animation
- `pawnMoved` animation
- `pawnCaptured` animation
- `pawnEnteredHome` semantic cue only
- `playerSurrendered` / `pawnRemoved` order
- `extraRollGranted` / `turnChanged`
- `gameWon` terminal presentation
- `pawnMoved + pawnEnteredHome` in same transition animates spatially once

**Verification commands:**
- `pnpm -C apps/web test`
- `pnpm -C apps/web typecheck`
- targeted visual smoke if the animation is visible in test harness

**Forbidden scope:**
- duplicate legality logic
- changing committed event semantics
- altering realtime contract fields

**Independent review requirements:**
- spec review for event-to-animation mapping
- quality review for double-animation / double-move regressions

**Commit checkpoint:** Commit committed-event animation only.

**STOP:** Do not start Task 6 until Task 5 is reviewed and committed.

## Task 6: Realtime recovery integration

**Files:**
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/game/presentation-controller.ts`
- Modify: `apps/web/src/game/event-animation.ts`
- Create: `apps/web/src/game/realtime-reconciliation.ts`
- Create: `apps/web/src/game/realtime-reconciliation.test.ts`

**Dependencies:** Tasks 1–5.

**Objective:** Integrate EPIC-06 presentation with EPIC-05 recovery: reconnect, `game:sync`, continuous catch-up, snapshot fallback, duplicate envelope handling, gap handling, and terminal match recovery.

**Invariants:**
- EPIC-05 reconciliation remains authoritative
- EPIC-06 only integrates presentation with existing EPIC-05 mechanisms
- snapshot fallback cancels stale presentation and reconciles to truth
- continuous trusted ranges may animate deterministically in order
- no fabricated historical animation on snapshot fallback

**Tests required:**
- reconnect during movement
- continuous catch-up
- snapshot during dice animation
- snapshot during pawn animation
- stale queue cancellation
- duplicate transition after reconnect
- sequence gap handling
- final visible position matches authoritative snapshot

**Verification commands:**
- `pnpm -C apps/web test`
- `pnpm -C apps/web typecheck`
- reuse existing EPIC-05 realtime tests as needed if the integration layer changes shared behavior

**Forbidden scope:**
- redefining sync protocol
- changing Socket.IO authority
- changing watchdog semantics
- changing server-side replay rules

**Independent review requirements:**
- spec review for realtime compatibility
- quality review for recovery correctness

**Commit checkpoint:** Commit realtime recovery integration only.

**STOP:** Do not start Task 7 until Task 6 is reviewed and committed.

## Task 7: Responsive compositions, accessibility, and polish

**Files:**
- Create or modify: `apps/web/src/game/game-screen.tsx`
- Create or modify: `apps/web/src/game/game-screen.test.tsx`
- Create or modify: `apps/web/src/game/game-screen.css`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/styles.css`

**Dependencies:** Tasks 1–6.

**Objective:** Build the distinct desktop and mobile gameplay compositions and finalize accessibility, reduced-motion, and performance-safe presentation.

**Invariants:**
- desktop is not merely scaled mobile
- mobile is not squeezed desktop
- board remains the dominant object on gameplay screens
- hit targets remain usable
- color is not the only state cue
- reduced motion preserves comprehension

**Tests required:**
- responsive structural states
- keyboard and focus behavior
- reduced-motion behavior
- board overflow prevention
- pointer-target usability where testable

**Verification commands:**
- `pnpm -C apps/web test`
- `pnpm -C apps/web typecheck`
- targeted browser smoke / component QA if needed for responsive layout

**Forbidden scope:**
- chat
- unrelated widgets to fill layout space
- board rule changes
- animation semantics changes

**Independent review requirements:**
- spec review for desktop/mobile composition
- quality review for accessibility and responsive architecture

**Commit checkpoint:** Commit responsive compositions and accessibility polish only.

**STOP:** Do not start Task 8 until Task 7 is reviewed and committed.

## Task 8: Visual QA and final EPIC verification

**Files:**
- Modify only if required by visual fixes: `apps/web/src/game/*`, `apps/web/src/styles.css`, or directly related test/evidence files
- Create evidence under the approved visual-QA artifact path used by the repository

**Dependencies:** Tasks 1–7.

**Objective:** Run final EPIC-06 visual QA at the canonical viewports, compare against the master references, fix any remaining visual gaps, and perform final EPIC-level verification.

**Invariants:**
- no new product functionality
- no spec drift
- no permanent Ludo-like markings
- no duplicate game logic introduced to fix visuals
- visual acceptance is required before closure

**Tests required:**
- browser screenshots at 390×844, 430×932, 1024×768, 1440×900, 1920×1080
- compare against `MASTER_DESKTOP.png` and `MASTER_MOBILE.png`
- verify hierarchy, board scale, spacing, typography, colors, pawn physicality, dice scale, density, responsive composition, mobile usability, and obvious AI-generated artifacts

**Verification commands:**
- canonical UI visual QA steps from the repository
- repository final gates required by the current workflow for UI epics

**Forbidden scope:**
- changing gameplay semantics
- changing realtime semantics
- changing room semantics
- changing game rules

**Independent review requirements:**
- product/spec consistency review
- game-engine boundary review
- realtime compatibility review
- UI architecture review
- visual/design-system review
- accessibility review
- test-adequacy review

**Commit checkpoint:** Commit only the minimal visual-fix checkpoint needed to satisfy final EPIC-06 acceptance, then stop.

**STOP:** Do not start any later epic from this plan.

---

## Cross-task architectural invariants

1. EPIC-03 remains the sole gameplay-rule authority.
2. EPIC-05 committed server state remains authoritative.
3. React must not reimplement movement legality, path blocking, capture legality, HOME legality, or dice result logic.
4. LegalAction hints come from `packages/game-engine` through a narrow adapter.
5. Presentation state is temporary and disposable.
6. `pawnMoved` owns spatial motion.
7. `pawnEnteredHome` never repeats movement.
8. Committed transition order is preserved.
9. Snapshot fallback invalidates stale presentation history.
10. Normal contiguous transitions queue rather than cancel previous valid animations.
11. Server/realtime processing never waits for animation.
12. UI input locking is UX only.
13. No permanent Ludo-like board markings.
14. Desktop and mobile use distinct compositions.
15. Visual QA is mandatory.

## Contract review notes

The current repository evidence indicates that the existing EPIC-05 event envelopes already carry the data EPIC-06 needs for deterministic animation:

- `pawnMoved.physicalPath`
- `pawnId`
- `playerId`
- `from` / `to`
- capture identity
- `pawnEnteredHome`
- surrender/removal facts
- winner / reason

The plan intentionally does not add new realtime protocol fields unless implementation evidence proves that the web app cannot safely consume the existing canonical data. If that happens, the task must stop and re-open the spec rather than silently widening the protocol.

## Test strategy summary

- Unit: adapters, selectors, coordinate projections, presentation queue, animation mapping.
- Component: board, pawns, dice, legal hints, turn controls.
- Integration: realtime transition to presentation, reconnect, snapshot fallback, queue invalidation.
- Visual: canonical screenshot matrix and master comparison.
- Accessibility: keyboard, focus, reduced motion, non-color-only state cues.

## Execution contract

Each task must follow the repository’s standard loop:

1. implement the task
2. run focused tests
3. run affected typecheck
4. run independent spec review
5. run independent quality review
6. apply only task-local fixes if required
7. rerun focused verification
8. commit the checkpoint
9. STOP

Do not automatically begin the next task.
