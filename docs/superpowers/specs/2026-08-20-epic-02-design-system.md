# EPIC-02 - Design System / Responsive App Shell

## Status

EPIC_02_DESIGN_SPEC_APPROVED

## Scope

EPIC-02 defines the visual system and responsive shell for Zamanushka on top of the accepted EPIC-00 foundation and merged EPIC-01 authentication flow.

This epic is design-system and shell work only. It establishes the reusable tokens, primitives, layout rules, responsive breakpoints, shell composition, and visual QA gates required for later UI epics. It does not implement gameplay, matchmaking, chat, profile features, history, rating, board skins, or the final interactive board.

The output of this spec must be implementation-ready enough that EPIC-02 implementation can build the shell and primitives without re-deciding the product's visual language.

## Out of Scope

This spec does not authorize or require:

- game-engine work
- matchmaking or room behavior
- Socket.IO gameplay
- global or room chat functionality
- profile, history, rating, or tutorial features
- functional board rendering for live matches
- pawns, dice RNG, or gameplay animations
- production board-skin functionality
- EPIC-03+ product screens beyond shell-safe placeholders
- an implementation plan
- a worktree
- UI implementation

## Current Project State

Current relevant implementation state:

- `apps/web` contains the EPIC-01 auth bootstrap shell and Telegram safe-area integration.
- `packages/ui` contains only a minimal dark foundation stylesheet and a simple frame component.
- `packages/config` already provides shared TypeScript config boundaries.
- The current auth shell is intentionally functional but visually provisional and must not be mistaken for the final product language.

EPIC-02 must preserve EPIC-01 auth behavior while replacing its presentation with the approved design-system and responsive shell.

## Canonical References

### Inspected Master Files

The following master references were visually inspected before writing this spec:

- desktop master source: `references/ui/MASTER_DESKTOP.png` (`1672x941`)
- mobile master source: `references/ui/MASTER_MOBILE.png` (`1055x1491`)

Approved interpretation:

- logical `MASTER_DESKTOP` authority: `references/ui/MASTER_DESKTOP.png`
- logical `MASTER_MOBILE` authority: `references/ui/MASTER_MOBILE.png`
- `PRODUCT_CONCEPT_OVERVIEW` remains the secondary supporting sheet stored as `references/ui/secondary/PRODUCT_CONCEPT_OVERVIEW.png`

For EPIC-02 review and implementation, the exact artifacts to compare against are fixed as:

- desktop comparison artifact: `references/ui/MASTER_DESKTOP.png`
- mobile comparison artifact: `references/ui/MASTER_MOBILE.png`

No other file may substitute for those two artifacts unless a later human-approved reference-policy update explicitly replaces them.

### Desktop Master

`MASTER_DESKTOP` is the primary desktop visual authority for:

- top navigation
- three-column composition
- left player/status panel
- central board dominance
- right action/dice/chat panel
- relative column proportions
- desktop UI density
- graphite / wood / restrained-gold balance
- border, panel, and CTA character

Interpretation correction:

- permanent dots, arrows, colored routes, and decorative central markings shown on the image are not part of the final resting UI
- the board at rest remains a clean 8x8 board with frame and pawns only
- transient overlays appear only during interaction, hints, tutorial, or animation
- gameplay legality comes from `docs/GAME_RULES.md`, not from any non-canonical board state depicted in the image
- the desktop composition still remains authoritative even where the depicted board state is mechanically incorrect

### Mobile Master

`MASTER_MOBILE` is the primary mobile visual authority for:

- vertical shell composition
- bottom navigation
- card density
- header behavior
- button hierarchy
- mobile spacing rhythm
- mobile board emphasis
- graphite / wood / restrained-gold balance

### Secondary Reference

`PRODUCT_CONCEPT_OVERVIEW` is supporting-only. It may refine:

- overall visual language
- game screen treatment details
- chat examples
- profile examples
- history examples
- room examples
- dark / wood / gold balance

It may not redefine either master composition.

### Material References

Board-material images are material-only references. They may inform:

- wood tone
- grain character
- cell contrast
- frame character
- matte / gloss balance

They may not be used directly as production board assets and may not contribute marketplace UI, watermarks, foreign coordinates, or borrowed labels to the product.

## Reference Hierarchy

Source-of-truth order:

1. `docs/GAME_RULES.md`
2. `MASTER_DESKTOP` / `MASTER_MOBILE`
3. `docs/DESIGN_SYSTEM.md`
4. secondary references
5. developer judgment only when all higher sources are silent

Conflict rules:

- gameplay legality always comes from `docs/GAME_RULES.md`
- master references control composition and hierarchy
- secondary references may refine local detail only
- if a reference shows an impossible board state, mechanics win and composition survives

## Visual Principles

The product must feel like a modern digital edition of a classic adult board game.

It must not resemble:

- SaaS dashboards
- casino UI
- fantasy / RPG UI
- gacha or mobile monetization UI
- generic AI gaming mockups
- Ludo-like route-heavy boards

Non-negotiable principles:

- on gameplay or board-facing screens, the board is the dominant object
- on non-board screens, the primary page content is dominant while retaining the same visual system
- gold is an accent only
- the interface stays calm, premium, and restrained
- board materials must feel authored, not pasted photographs
- desktop and mobile use one system with different compositions
- the board remains clean at rest

## Fidelity Requirement

EPIC-02 implementation must be reference-driven and composition-close, not merely mood-adjacent.

It must reproduce as closely as practical:

- major block placement
- navigation placement
- relative board size
- column proportions
- interface density
- card hierarchy
- CTA prominence
- border character
- graphite / wood / gold balance

It must not literally copy:

- incorrect AI text
- impossible pawn positions
- decorative route markings
- central decorative board overlays
- generation artifacts

## Color System

EPIC-02 must derive semantic tokens from the approved masters instead of hardcoding random visual literals across components.

Required semantic token groups:

- canvas background
- surface background
- elevated surface background
- primary text
- secondary text
- muted text
- default border
- active border
- accent
- accent hover / pressed
- success
- warning
- danger
- focus ring

Direction:

- background: very dark graphite / navy
- surfaces: slightly lighter graphite
- text: warm off-white primary with restrained muted neutrals
- accent: restrained warm gold / brass

Gold usage budget:

- may fill the primary CTA
- may highlight selected navigation or active state
- may be used for thin accent borders and small status values
- must not dominate the page background
- must not turn the UI into a gold-heavy interface

Player colors are separate game identity colors and must not become general-purpose UI accents.

## Typography

Typography must support Cyrillic cleanly.

System requirement:

- primary UI type: neutral sans-serif suitable for dense Russian UI
- optional display serif: limited to logo / wordmark or rare display use only

Required text styles:

- display
- h1
- h2
- h3
- body
- body-small
- caption
- button
- numeric

Each style must be defined in implementation with:

- family
- size
- weight
- line-height
- letter-spacing

Typography must not drift into editorial luxury or fantasy branding. Core UI remains practical and readable.

## Spacing

Use a constrained spacing scale only:

- 4
- 8
- 12
- 16
- 20
- 24
- 32
- 40
- 48
- 64

Tokenize the scale and avoid random local spacing values.

## Radius

Radius direction:

- compact controls: 8-10
- buttons: 10-12
- cards and panels: 12-16
- large modal or sheet: 16-20
- pill-only for chips or explicit segmented elements

Avoid bubbly, over-rounded UI.

## Borders and Elevation

Borders:

- default: thin, subtle, neutral
- active / selected: thin restrained warm-gold border

Elevation:

- UI panels remain mostly flat
- board may receive a stronger material shadow than ordinary UI
- avoid glowing borders, heavy neon shadows, or decorative blur stacks

## Materials

Board and UI must feel like different materials:

- UI: graphite, structured, restrained
- board: warm, natural, premium wood

The board must be rendered from authored materials, not stretched screenshots. EPIC-02 should define the contract boundary for future board-skin rendering but must not implement the skins themselves.

## Iconography

Use one coherent icon system across shell and primitives, preferably a restrained line-icon set already suitable for React usage.

Requirements:

- one icon family only
- no emoji-based UI
- no mixed 3D / filled / random SVG families
- game pieces and dice are product-specific objects, not ordinary app icons

## Motion

EPIC-02 defines only motion primitives, not gameplay animation.

Required tokens:

- fast
- normal
- slow
- standard easing
- emphasized easing

Motion principles:

- functional
- short
- restrained
- reduced-motion compliant

Gameplay-specific animations stay out of scope for this epic.

## Accessibility

Minimum accessibility contract:

- semantic HTML
- buttons are real buttons
- labels for controls and fields
- keyboard navigation
- focus-visible
- adequate contrast
- reduced-motion support
- touch-target sanity on mobile

Visual fidelity must not break baseline usability.

## Responsive System

Define a small number of layout ranges, not dozens of breakpoints.

Recommended ranges:

- compact mobile
- mobile
- tablet / intermediate
- desktop
- large desktop

The implementation may choose exact breakpoint values, but the spec requires stable responsive behavior rather than ad hoc media queries.

Required behavior by range:

- compact mobile: single-column flow, bottom navigation visible, page content stacked, shell padding minimized for Telegram WebView
- mobile: same core structure as compact mobile with slightly more breathing room; bottom navigation remains visible
- tablet / intermediate: still not the final desktop shell; top navigation may appear, but the layout must remain either one-column or two-column only; bottom navigation must be removed once top navigation takes over; on board-facing screens the board must dominate, and on non-board screens the primary content region must dominate above secondary panels
- desktop: the generic desktop shell becomes available; pages may use either a general desktop content layout or the specialized future gameplay layout where board-facing gameplay requires it
- large desktop: the same desktop shell families expand in spacing and stage size, not in information architecture count

Collapse rules:

- the future gameplay-specific three-column layout may collapse to two columns before it collapses to one, but the central stage must remain visually dominant
- the right contextual column collapses before the central stage shrinks below comfortable prominence
- the board may never be reduced to make room for secondary side panels

## Mobile Shell

The mobile shell must derive from `MASTER_MOBILE`.

Required characteristics:

- stacked vertical composition
- persistent bottom navigation
- narrow, dense, premium cards
- header that respects Telegram safe areas
- content width and padding tuned for Telegram WebView
- board or page focal object near full-width when relevant

The shell should support authenticated placeholder routes without implying EPIC-03+ functionality exists.

## Desktop App Shell

The generic desktop shell must derive from `MASTER_DESKTOP`, but it is not the same thing as the future specialized gameplay layout.

Required characteristics:

- top navigation
- wide horizontal composition
- premium graphite / wood / restrained-gold balance
- shared panel, border, spacing, and navigation language
- reusable desktop page container and content regions
- support for both board-facing and non-board pages without forcing one single page topology

Desktop must not be a stretched mobile layout. It needs its own composition primitives while reusing the same token system.

## Desktop Game Layout

The future gameplay-specific desktop layout is a specialized composition that inherits the desktop shell but is not mandatory for non-game pages.

`DesktopGameLayout` is the pattern that derives from the gameplay interpretation of `MASTER_DESKTOP`.

It defines:

- left player / room-status column
- central dominant board stage
- right action / dice / contextual chat column
- game-screen-specific relative proportions
- board-first gameplay hierarchy

This three-column gameplay composition belongs only to board-facing screens such as the future live match and closely related game-room states. It must not become a mandatory layout for profile, history, collection, chat, settings, or other non-game screens.

## Navigation

EPIC-02 should define:

- mobile bottom navigation pattern
- desktop top navigation pattern
- active / hover / selected states
- icon + label treatment
- shell-safe placeholder destinations

Navigation items may exist visually, but they must not imply unfinished product screens are implemented. Where destination features do not exist yet, routes must remain clearly placeholder-safe within EPIC-02 scope.

Allowed EPIC-02 placeholder destinations only:

- authenticated home shell placeholder
- placeholder rooms shell
- placeholder chat shell
- placeholder collection shell
- placeholder profile shell

These placeholder destinations may demonstrate layout only. They may not contain fake feature logic, fake histories, fake matchmaking state, fake board interactivity, or mock flows that imply EPIC-03+ implementation is present.

## Component Inventory

EPIC-02 implementation must cover the minimum reusable inventory needed for future UI epics:

- app shell frame
- desktop top nav
- mobile bottom nav
- page container
- content section wrapper
- panel / card
- primary button
- secondary button
- tertiary or ghost button
- icon button
- segmented control
- tabs
- text input
- textarea
- select or menu trigger
- list row / settings row
- badge / chip
- avatar or user-chip identity visual limited to shell/auth presentation only
- stat item
- empty state shell
- modal / dialog
- bottom sheet
- divider
- toast or inline status pattern

## Component State Matrix

Critical states that must be defined at spec level:

- default
- hover
- active / pressed
- selected
- focused
- disabled
- loading where applicable
- error where applicable
- empty where applicable

The state system must be visually coherent and must preserve the restrained premium tone.

At minimum, the following primitives require explicit state treatment in EPIC-02 implementation:

- top-nav item: default, hover, active, selected, focus-visible
- bottom-nav item: default, active, selected, focus-visible
- button: default, hover, pressed, disabled, loading, focus-visible
- icon button: default, hover, pressed, disabled, focus-visible
- tabs / segmented control: default, hover, selected, focus-visible, disabled
- text input / textarea: default, focus, filled, disabled, error
- panel / card: default and selected where applicable
- modal / dialog: open, closing if animated, focus-trapped
- bottom sheet: closed, opening, open, dismissing
- toast / inline status: info, success, warning, danger

Visual behavior expectations:

- hover is subtle and desktop-only where appropriate
- focus-visible must be readable without breaking the premium tone
- disabled states must remain legible but clearly inactive
- loading states must preserve layout dimensions and avoid jitter
- selected states may use restrained gold emphasis, not full-surface gold flooding

## Package Boundaries

`packages/ui` owns:

- design tokens
- foundation CSS
- shell-safe UI primitives
- layout primitives
- presentation-only helpers

`apps/web` owns:

- route composition
- auth-shell migration
- app-specific shell assembly
- page-level placeholder composition

Business logic and feature behavior must not move into `packages/ui`.

## Auth-Shell Migration

EPIC-01 auth behavior remains authoritative and must be preserved.

EPIC-02 may:

- restyle the auth shell
- migrate it into the new shell and token system
- improve responsive presentation

EPIC-02 may not:

- rewrite authentication semantics
- alter server contracts
- change Telegram or session security behavior except to fix regressions

Required auth presentation states that must remain covered after shell migration:

- bootstrapping session check
- authenticating transition
- authenticated user state
- development-auth chooser state when server capability is enabled
- unauthenticated browser fallback state when no dev auth is available
- recoverable error state with retry

EPIC-02 implementation must preserve:

- `/api/me`-first bootstrap
- Telegram-versus-browser branching
- development-user chooser semantics
- logout affordance and post-logout return path

The epic may restyle these states, but it may not remove or merge them so aggressively that EPIC-01 behavior becomes ambiguous.

## Development-Only Design Preview

A development-only showcase route is allowed if it materially helps visual QA and component verification.

Constraints:

- development-only
- excluded from production navigation
- no Storybook unless later justified
- useful for primitive inspection, not as a fake product

## Testing

Expected implementation verification for EPIC-02:

- component tests for major interactive primitives
- shell behavior tests where practical
- keyboard/focus tests for dialogs, navigation, and disabled/loading states
- no pixel-by-pixel CSS unit micromanagement tests
- visual fidelity through screenshots rather than unit assertions

## Visual QA

EPIC-02 cannot close on lint/build/tests alone.

Required viewport gate:

- 390x844
- 430x932
- 1024x768
- 1440x900
- 1920x1080

For each viewport:

- capture implementation screenshot
- compare against relevant master reference
- record deviations
- fix major hierarchy / spacing / density / balance problems
- repeat until acceptable

Reference pairing for QA is fixed:

- `390x844` and `430x932` compare against the mobile comparison artifact
- `1440x900` and `1920x1080` compare against the desktop comparison artifact
- `1024x768` is the required intermediate-range checkpoint and compares against both masters for transition sanity: mobile density rules must be gone where desktop navigation has taken over, but the final three-column desktop shell may still be partially collapsed

Evidence must be stored under:

- `artifacts/visual-qa/epic-02/`

with a `README.md` documenting:

- reference used
- comparison notes
- intentional deviations
- fixes performed
- final assessment

## Acceptance Criteria

This spec is acceptable only if EPIC-02 implementation can later deliver:

- a reusable token system derived from the approved masters
- a responsive shell for mobile and desktop
- shell-safe primitives for future UI epics
- a migrated auth shell that matches the new system without auth regression
- clear scope boundaries that prevent EPIC-03+ leakage
- visual QA gates that enforce reference fidelity
- a clean-board-at-rest rule across all future board-facing UI

## Risks

- desktop drift toward generic dashboard layout if implementation weakens the board-dominance rule
- mobile drift if the temporary EPIC-01 auth shell is treated as final composition precedent
- overuse of gold causing casino tone
- material misuse if raw board photos leak directly into authored assets
- premature feature-page implementation under the shell epic
- accidental auth regression while migrating shell presentation
- path mismatch between logical canonical reference names and current on-disk reference filenames until storage policy is finalized

## Implementation Notes

- `docs/DESIGN_SYSTEM.md` should be updated after spec approval to become the concise canonical contract, not a duplicate of this full spec.
- The later EPIC-02 implementation should normalize current provisional foundation tokens in `packages/ui/src/foundation.css`.
- The shell should be built so later pages can be composed from primitives without redesigning the product each time.
- All board overlays remain temporary and must never redefine the resting board geometry.

## EPIC-02 Design Spec Output Status

Status:

EPIC_02_DESIGN_SPEC_APPROVED

Master references inspected:

- desktop: `references/ui/MASTER_DESKTOP.png`
- mobile: `references/ui/MASTER_MOBILE.png`

Blocking ambiguities requiring human decision:

- none
