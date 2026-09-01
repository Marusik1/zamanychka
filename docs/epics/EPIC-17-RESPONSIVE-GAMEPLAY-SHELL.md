# EPIC-17 — Responsive Gameplay Shell

## Goal

Make the existing gameplay surface usable at 390×844, 430×932, 768×1024, 1366×768, 1440×900, and 1920×1080.

## Constraints

- Reuse the current board, presentation queue, controls, chat sheet, and bottom navigation.
- Board remains width-driven, square, and `flex-shrink: 0`; never size it from `100vh` or arbitrary desktop pixels.
- Mobile uses a compact status, square board, secondary content, and a sticky game-action bar above bottom navigation.
- Pawn selection remains on board/reserve; no scroll-to-action workaround.
- Desktop retains the players | board | actions composition; rails may scroll independently.

## Acceptance

No horizontal overflow (`scrollWidth <= clientWidth`), board remains square, action bar remains reachable, navigation does not overlap actions, and existing animation invariants have no layout shift or giant pawns.

Checkpoint: `ui: add responsive gameplay shell`.
