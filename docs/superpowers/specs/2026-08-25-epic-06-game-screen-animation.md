# EPIC-06 — Game Screen and Animation

## Status and boundary

This document defines EPIC-06 only. It adds the actual gameplay screen, board presentation, pawn/dice animation, legal-action hints, committed-event reconciliation, responsive compositions, accessibility, and visual QA requirements for Zamanushka.

It does not modify gameplay rules, room lifecycle, realtime transport semantics, idempotency, or server authority. EPIC-03, EPIC-04, and EPIC-05 remain authoritative for rules, room lifecycle, and committed realtime truth.

The screen may present authoritative gameplay state and animate committed events, but it must never become a second game engine or a second source of truth.

## Canonical sources

EPIC-06 must be implemented against the existing repository canon, not against recreated assumptions:

- `docs/EPICS.md`
- `docs/GAME_RULES.md`
- `docs/GAME_ENGINE.md`
- `docs/MATCH_STATE_MACHINE.md`
- `docs/ARCHITECTURE.md`
- `docs/REALTIME_PROTOCOL.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/TESTING.md`
- the approved EPIC-05 realtime spec
- current `packages/game-engine` API
- current `packages/shared` realtime contracts
- current `apps/web` structure

Visual masters:

- `references/ui/MASTER_DESKTOP.png`
- `references/ui/MASTER_MOBILE.png`

If a master reference conflicts with frozen game rules, the rules win. If a secondary reference conflicts with a master reference, the master wins.

## Product intent

The gameplay screen must feel like a restrained premium board-game surface: adult, tactile, dark graphite / deep navy, warm wood, muted gold accents, classic physical pawns, calm and deliberate rather than casino-like.

The screen must not resemble:

- cartoon UI
- fantasy UI
- neon gaming UI
- casino or gacha surfaces
- glassmorphism-heavy dashboards
- toy-like or oversized pawn styling
- a generic SaaS board
- a Ludo or chess clone with imported route markings

## Authority model

EPIC-06 is presentation only.

### Authoritative game state

Authoritative state comes from committed server truth delivered by EPIC-05:

- match snapshot
- stateVersion
- sequence / event order
- current player
- turn phase
- dice value
- pawn positions
- winner and terminal state
- committed event envelopes

This state drives eligibility, content, and animation order.

### Presentation / animation state

Presentation state is temporary, local, and disposable:

- running animation queues
- interpolation progress
- transient visual selection
- temporary dice roll motion
- temporary pawn motion
- temporary capture exit motion
- temporary victory presentation

Presentation state must never determine gameplay legality, generate dice, infer captures, or mutate the authoritative state.

Presentation may lag behind server truth. A normal contiguous committed transition must enqueue into the deterministic FIFO presentation queue and must not cancel an earlier valid animation merely because authoritative state has advanced. Stale animation is cancelled only when an authoritative snapshot fallback arrives or when an incoming transition is unsafe to present in order.

## Scope

EPIC-06 includes:

- the actual gameplay screen
- the board surface
- physical pawn rendering
- dice presentation and roll animation
- legal-action hints derived from canonical game data
- deterministic animation of committed event envelopes
- capture animation
- home entry and home completion presentation
- victory presentation
- responsive desktop and mobile compositions
- reduced-motion behavior
- accessibility behavior for gameplay interactions
- visual QA against canonical masters

## Out of scope

EPIC-06 does not implement or redesign:

- game rules
- server RNG
- Match command processing
- idempotency
- Match transaction processing
- Outbox
- Socket.IO protocol
- Redis transport architecture
- Room lifecycle
- multi-room support
- matchmaking
- chat
- profiles
- ratings
- economy
- shop
- skins marketplace
- spectators
- bots
- sound system unless it already exists as an approved canonical product decision
- any new victory rule
- any general frontend rewrite
- any gameplay rule duplicated in React components

The screen may consume canonical legal-action projections, but it must not recompute movement legality, capture legality, home-entry legality, or victory on its own.

Legal-action source is singular: authoritative EPIC-05 snapshot data feeds the pure `packages/game-engine` legal-action API through a narrow web/domain presentation adapter, and that adapter feeds React hints. The UI may consume only canonical `LegalAction` projections and must not copy the rules into components. If repository evidence later shows the engine package cannot be safely consumed this way from `apps/web`, that is a blocker and the spec must be revisited instead of introducing a second source.

## Board

The resting board is a clean normal 8×8 checkerboard.

It must not permanently show:

- perimeter route lines
- arrows
- numbered paths
- movement traces
- colored lanes
- destination markers
- legal-action highlights

Those may appear only as temporary interaction feedback or committed-event animation.

Board coordinate mapping must exactly match the canonical engine coordinate system.

Frozen corners:

- RED → `(0,0)`
- BLUE → `(0,7)`
- YELLOW → `(7,7)`
- GREEN → `(7,0)`

Frozen home diagonals:

- RED: `(0,0)`, `(1,1)`, `(2,2)`, `(3,3)`
- BLUE: `(0,7)`, `(1,6)`, `(2,5)`, `(3,4)`
- YELLOW: `(7,7)`, `(6,6)`, `(5,5)`, `(4,4)`
- GREEN: `(7,0)`, `(6,1)`, `(5,2)`, `(4,3)`

The board must not introduce a coordinate model different from the engine. If visual labels are shown, they must remain presentation-only and must not become an alternate coordinate system.

## Pawns

Each participant has four classic volumetric pawns.

Pawn presentation must visually distinguish:

- `OFF_BOARD`
- `PERIMETER(progress)`
- `HOME(homeIndex)`
- `REMOVED`

`OFF_BOARD` pawns need an intentional reserve/holding presentation associated with their player. They must not be rendered as fake board cells.

`REMOVED` pawns must not remain active on the board.

Pawn ownership must be unmistakable without making the board loud.

Define at least these visual states:

- default
- hover / focus
- selectable
- selected
- legal-action candidate
- temporarily disabled
- moving
- captured
- home-completed

Physical pawn appearance should use restrained depth, shadow, and highlight. It must feel tactile, not photorealistic or cartoonish.

## Dice

The die must feel like a physical object consistent with the board.

States:

- roll available
- command pending
- rolling animation
- committed server result received
- result presentation
- disabled / waiting for another player
- terminal match

The client does not choose the dice value.

`ROLL_DICE` sends intent only. The visual roll must resolve to the server-authoritative committed dice value. Decorative roll variation is allowed only if it cannot affect timing, order, or state semantics.

## Legal-action hints

The UI must not duplicate movement legality.

Legal hints must be derived from the canonical `packages/game-engine` legal-action API through the narrow presentation adapter described above. The UI may not rewrite rules such as:

- occupied-path blocking
- exact landing
- HOME overshoot
- HOME(0) blocking
- capture legality
- `ENTER` legality
- six behavior

The visual hints should be subtle:

- the currently selectable pawn may receive restrained emphasis
- a legal `ENTER` option may be indicated at the reserve/start area
- a legal destination may receive a temporary marker
- illegal pawns remain visually quiet

Hints disappear when they are no longer relevant.

## Event-driven animation

Animation is driven by ordered committed EPIC-05 transition envelopes.

Event ordering from persistence must be preserved in presentation.

The screen must define a deterministic visual mapping for at least:

- `diceRolled`
- `pawnEntered`
- `pawnMoved`
- `pawnCaptured`
- `pawnEnteredHome`
- `playerSurrendered`
- `pawnRemoved`
- `extraRollGranted`
- `turnChanged`
- `gameWon`

Do not invent gameplay events.

### `diceRolled`

Presentation:

- start a physical roll animation
- end on the committed dice value
- deterministic final face
- no client RNG affects the result

### `pawnEntered`

Presentation:

- animate `OFF_BOARD` to the canonical corner / perimeter start
- never visually remove an enemy pawn on `ENTER`
- never treat `ENTER` as capture

### `pawnMoved`

Presentation must follow the canonical engine path:

- animate through every intermediate coordinate in the committed physical path
- respect clockwise perimeter movement
- respect perimeter → HOME traversal
- respect HOME-only progression

The UI must consume or derive the canonical path from the committed transition data. It must not invent a second path algorithm in presentation components.

`pawnMoved` is the single event responsible for pawn spatial motion. If `pawnMoved` includes a physical path, the UI must animate exactly that path once, including perimeter cells, the shared corner, and HOME coordinates. `pawnEnteredHome` must never move the pawn again or replay any portion of `pawnMoved.physicalPath`.

### `pawnCaptured`

Capture presentation must happen only after the committed destination move is shown.

Canonical visual sequence:

1. moving pawn reaches the committed destination
2. capture resolves
3. captured pawn exits the cell visually
4. captured pawn returns to its `OFF_BOARD` presentation state

Do not animate capture for an intermediate crossed cell.
Do not animate `ENTER` as capture.

### `pawnEnteredHome`

`pawnEnteredHome` is a semantic committed fact, not a second spatial animation. It may trigger only a restrained presentation cue such as home-entry emphasis, ownership cue, or a brief highlight/state accent.

If the committed destination is `HOME(0)`:

- the pawn spatially stops on the shared physical corner
- the semantic pawn state is `HOME(0)`
- the UI may distinguish home ownership/state without changing board geometry
- the pawn must not continue deeper into the diagonal

If the committed destination is `HOME(1..3)`:

- `pawnMoved.physicalPath` passes through the shared corner
- then continues into the owner-specific diagonal
- the animation follows that path exactly once

`pawnEnteredHome` must never move the pawn again or replay any portion of `pawnMoved.physicalPath`.

Exact `HOME(3)` completion must be clear, but not theatrical.

### `playerSurrendered` / `pawnRemoved`

Presentation:

- surrender should clearly identify the player leaving active contention
- removed pawns should animate out of active play in the canonical pawn-ID order
- removed pawns return to a non-board removed presentation

### `extraRollGranted` / `turnChanged`

Presentation:

- `extraRollGranted` should indicate the same player continues
- `turnChanged` should indicate the next active player becomes current

### `gameWon`

`gameWon` is terminal and appears after the preceding committed transition events.

The presentation must preserve the canonical win reason:

- `HOME_DIAGONAL_COMPLETED`
- `LAST_ACTIVE_PLAYER`

Victory presentation should be restrained:

- identify the winner clearly
- stop actionable controls
- keep the final board visible
- avoid confetti overload, slot-machine effects, or excessive particles

## Animation queue

Committed transition envelopes may arrive while a previous animation is still running.

The client must use a deterministic FIFO presentation queue with these properties:

- preserve committed order
- never visually animate event N+1 before N
- a duplicate envelope must not animate twice
- already reconciled sequence must not animate again
- the queue must not mutate authoritative state

Commands and authoritative updates remain independent of animation timing.

## Sync and reconnect interaction

EPIC-05 remains authoritative.

When `game:sync` returns a continuous trusted range:

- missing committed transitions may be presented in canonical order
- abbreviated catch-up animation is allowed if deterministic

When `game:sync` returns an authoritative snapshot fallback:

- the snapshot replaces stale presentation assumptions
- stale animation queue entries are cancelled or invalidated immediately
- the board reconciles to authoritative truth
- no fabricated historical animation may be invented for unproven state

If a normal committed transition arrives while a valid animation is still running, it must enqueue behind the current presentation item and not cancel it. The authoritative state may advance ahead of the presentation state while the queue drains in sequence.

If a snapshot arrives while a pawn animation is running, authoritative snapshot wins immediately and invalidates stale presentation history.

No presentation animation may move the visible state backward relative to authoritative truth.

## Input locking

The UI must prevent duplicate local submissions while a command is pending or while a local animation is still applying a committed transition.

This is UX behavior only. It is not gameplay authority and must not be treated as a server lock.

The UI should disable or gate local interactions during:

- command pending
- dice animation
- pawn animation
- capture animation
- reconnect / sync reconciliation
- terminal match

## Turn presentation

The UI must compactly indicate:

- current player
- local player's color
- `WAITING_FOR_ROLL`
- `WAITING_FOR_ACTION`
- extra roll
- waiting for opponent
- terminal state

Routine turn changes must remain calm and compact.

## Desktop composition

Desktop must be a distinct composition, not merely a scaled mobile screen.

The approved desktop reference is the visual authority.

Expected conceptual structure:

- left: players, active-turn status, compact match context
- center: dominant square board
- right: dice, contextual game actions, current roll/action state

Do not introduce chat merely to fill the right rail.

The board remains the dominant object on gameplay-facing desktop screens.

## Mobile composition

Mobile must be a distinct vertical composition.

The approved mobile reference is the visual authority.

Expected conceptual hierarchy:

- compact match / turn header
- dominant board
- contextual dice / action area
- existing app navigation where applicable

The board must remain comfortably playable on a phone.

Avoid:

- squeezing desktop sidebars around the board
- tiny pawns
- tiny hit targets
- horizontal overflow

## Responsive behavior

Define explicit responsive behavior rather than relying on arbitrary scaling.

Specify:

- desktop breakpoint strategy
- mobile strategy
- board max-size logic
- square aspect-ratio preservation
- minimum pointer target size
- portrait handling
- short viewport handling

Do not require tablet-specific product behavior unless the repository already defines it.

## Accessibility

The UI must provide:

- keyboard-operable legal actions where practical
- visible focus states
- accessible names for dice and pawn actions
- non-color-only indication of selectable / current state
- reduced motion support
- readable turn/status text

Accessibility must not undermine the visual requirements; it should be implemented within them.

## Performance

Animation should preferentially use transform and opacity-based techniques.

Avoid layout thrashing on each animation frame.

Do not rerender the entire board unnecessarily for every interpolation frame.

Board and pawns should remain smooth on ordinary mobile hardware.

No requirement for WebGL or Canvas unless the repository’s architecture strongly justifies it.

## Visual QA

EPIC-06 is a UI epic. Visual QA is required before closure.

At minimum, capture and compare:

- 390×844
- 430×932
- 1024×768
- 1440×900
- 1920×1080

Compare implementation against:

- `references/ui/MASTER_DESKTOP.png`
- `references/ui/MASTER_MOBILE.png`

Review:

- hierarchy
- board scale
- spacing
- typography
- colors
- pawn physicality
- dice scale
- density
- responsive composition
- obvious AI-generated visual artifacts
- mobile usability

Visual acceptance is required before EPIC-06 closes.

## Testing requirements for later implementation

### Board

- exact 8×8 rendering
- canonical coordinate mapping
- correct player corners
- correct home cells
- correct pawn rendering from authoritative positions

### Interaction

- roll enabled only when appropriate
- legal pawn hints match canonical legal-action source
- illegal pawn cannot submit `MOVE`
- `ENTER` affordance only when canonical `ENTER` is legal
- repeated local click cannot produce accidental duplicate intent

### Animation

- dice resolves to committed server value
- pawn movement follows canonical path
- all intermediate cells represented in normal-motion mode
- capture only at exact committed destination
- `ENTER` does not capture
- perimeter → HOME animation correct
- HOME progression correct
- multiple events preserve committed order
- duplicate event does not animate twice
- `pawnMoved` plus `pawnEnteredHome` in the same transition produces spatial movement exactly once
- `pawnEnteredHome` does not cause any additional positional step

### Realtime recovery

- reconnect while animation is active
- `game:sync` continuous catch-up
- snapshot fallback during animation
- stale animation queue invalidated
- authoritative state never moves backward

### Victory

- `HOME_DIAGONAL_COMPLETED` presentation
- `LAST_ACTIVE_PLAYER` presentation
- controls disabled after terminal event
- final board remains visible

### Responsive

- desktop composition
- mobile composition
- no board overflow
- usable hit targets

### Accessibility

- keyboard / focus
- reduced motion

## Risks and ambiguities

The following choices are intentionally frozen:

1. authoritative vs presentation state separation
2. legal-hint source
3. exact event-to-animation mapping
4. animation queue semantics
5. sync/snapshot interruption behavior
6. duplicate event visual handling
7. capture ordering
8. perimeter → HOME visual transition
9. input locking policy
10. dice authoritative-result behavior
11. desktop layout
12. mobile layout
13. reduced-motion behavior
14. victory behavior
15. visual QA acceptance process

Nothing above is left as TBD unless repository evidence makes a decision impossible.

## Spec review checklist

After drafting, the implementation-ready review must confirm:

- no duplicated game logic in React
- UI is not authoritative over game state
- animation never blocks server semantics
- snapshot fallback cancels stale animation
- no permanent Ludo-like board markings
- desktop is not merely scaled mobile
- mobile is not squeezed desktop
- client-side dice randomness does not affect outcome
- capture never happens on crossed/intermediate cells
- `ENTER` never visually captures
- `HOME(0)` remains semantically correct
- duplicate Socket.IO events do not replay animation
- stale animation is cancelled after snapshot reconciliation
- color-only cues are not used as the only accessibility signal

If the review finds a genuine contradiction, fix the spec only. Do not implement EPIC-06 here.
