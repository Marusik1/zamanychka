# Design System

## Reference priority

1. [GAME_RULES.md](./GAME_RULES.md) for gameplay legality and canonical board behavior.
2. Canonical master references in `/references/ui`.
3. This document for reusable tokens, states, and composition rules.
4. Secondary references in `/references/ui/secondary`.
5. Existing project components.
6. Original design decisions only where references are silent.

If a reference image depicts an impossible board state, gameplay rules win. If a secondary reference conflicts with a canonical master reference, the canonical master reference wins.

## Visual language

- Dark navy/graphite surfaces, warm restrained gold accents, premium wood materials.
- Gold is limited to CTA, selection, thin borders, and small status details.
- On gameplay and board-facing screens, the board is the primary visual object: central on desktop and nearly full-width on mobile.
- On non-board screens, the primary page content is dominant while retaining the same visual system.
- Volumetric classic pawns are centered precisely in cells and read as physical board pieces.
- Cards are rounded, restrained, and only present when functionally needed.
- Mobile and desktop share tokens but use distinct compositions.

## Board rendering

The board is a programmatic 8x8 grid. Materials use layered base colors, subtle grain or fibers, brightness variation, and frame treatment. Never stretch source photographs across the board. At rest the board has no routes, arrows, dots, or permanent service markings.

Temporary overlays are translucent, brief, and preserve material visibility. Animation is driven only by confirmed server events. A newer snapshot interrupts stale animation and reconciles to truth.

## Prohibited outcomes

UI fails visual acceptance if the board is secondary on gameplay screens; the product resembles casino, fantasy, gacha, Ludo, or generic AI gaming; gold covers large surfaces; routes or arrows persist; pawns are flat tokens; gradients, glow, or blur are decorative or excessive; desktop is stretched mobile; unnecessary cards compete with play; a board texture looks like a pasted photograph; or composition differs materially from the master reference without a functional reason.

## Canonical UI references

- `references/ui/MASTER_MOBILE.png`: primary mobile authority for shell hierarchy, navigation density, spacing rhythm, and overall mobile composition.
- `references/ui/MASTER_DESKTOP.png`: primary desktop authority for desktop gameplay-facing composition, panel proportions, board dominance, and desktop navigation character.
- `references/ui/secondary/PRODUCT_CONCEPT_OVERVIEW.png`: supporting reference for secondary screen families, wood/graphite/gold balance, and local component details. It cannot override either master reference.

Raw material board photos remain material-only references. They inform wood tone, grain, cell contrast, frame character, and finish, but they are never copied directly into production UI and never become canonical composition sources.

## Visual QA gate

Before closing every UI epic:

1. open the implementation in a browser;
2. capture 390x844, 430x932, 1024x768, 1440x900, and 1920x1080;
3. compare composition, board scale, spacing, typography, density, hierarchy, colors, borders, shadows, navigation, pawns, and overlays to the relevant master reference and any allowed supporting references;
4. iterate until material differences have a documented functional reason.

Screenshots, watermarks, coordinate labels, source-site controls, and copyrighted source assets are never copied into the product.
