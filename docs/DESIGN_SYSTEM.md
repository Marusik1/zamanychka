# Design System

## Reference priority

1. relevant image in `/references`;
2. this document;
3. [PRODUCT.md](./PRODUCT.md);
4. existing project components;
5. original design decisions only where references are silent.

Rules and valid board states always come from [GAME_RULES.md](./GAME_RULES.md), even when a generated reference depicts an impossible state.

## Visual language

- Dark navy/graphite surfaces, warm restrained gold accents, premium wood materials.
- Gold is limited to CTA, selection, thin borders, and small status details.
- Board is the primary visual object: central on desktop and nearly full-width on mobile.
- Volumetric classic pawns are centered precisely in cells and read as physical board pieces.
- Cards are rounded, restrained, and only present when functionally needed.
- Mobile and desktop share tokens but use distinct compositions.

## Board rendering

The board is a programmatic 8x8 grid. Materials use layered base colors, subtle grain/fibers, brightness variation, and frame treatment. Never stretch source photographs across the board. At rest the board has no routes, arrows, dots, or permanent service markings.

Temporary overlays are translucent, brief, and preserve material visibility. Animation is driven only by confirmed server events. A newer snapshot interrupts stale animation and reconciles to truth.

## Prohibited outcomes

UI fails visual acceptance if the board is secondary; the product resembles casino, fantasy, gacha, Ludo, or generic AI gaming; gold covers large surfaces; routes/arrows persist; pawns are flat tokens; gradients/glow/blur are decorative or excessive; desktop is stretched mobile; unnecessary cards compete with play; a board texture looks like a pasted photograph; or composition differs materially from the master reference without a functional reason.

## Visual QA gate

Before closing every UI epic:

1. open the implementation in a browser;
2. capture 390x844, 430x932, 1440x900, and 1920x1080;
3. compare composition, board scale, spacing, typography, density, hierarchy, colors, borders, shadows, navigation, pawns, and overlays to relevant references;
4. iterate until material differences have a documented functional reason.

## Reference inventory

- `ChatGPT Image 18 авг. 2026 г., 20_57_18.png`: primary multi-screen mobile composition and gameplay reference.
- `ChatGPT Image 18 авг. 2026 г., 20_57_40.png`: primary mobile flow, board, pawn, and screen-density reference.
- `photo_2026-08-17_21-22-39.jpg`: warm brown/cream board material reference.
- `photo_2026-08-17_21-22-41.jpg`: black-and-white material reference.
- `photo_2026-08-17_21-22-42.jpg`: high-contrast dark/cream framed board reference.
- `photo_2026-08-17_21-22-46.jpg`: tactile cloth/painted-grid material reference only; stone pieces are not applicable.
- `photo_2026-08-17_21-22-47.jpg`: burgundy classic palette reference.
- `photo_2026-08-17_21-22-49.jpg`: wood grain and framed-board construction reference.

Screenshots, watermarks, coordinate labels, source-site controls, and copyrighted source assets are never copied into the product.
