# References Manifest

This directory contains visual references for Zamanushka.

## Source hierarchy

1. `docs/GAME_RULES.md`
2. canonical UI master references in `references/ui/`
3. `docs/DESIGN_SYSTEM.md`
4. secondary supporting UI references
5. material-only board references

If a reference image conflicts with game mechanics or valid board state, `docs/GAME_RULES.md` wins.

If a secondary UI reference conflicts with a master UI reference, the master reference wins.

## Canonical UI references

### `references/ui/MASTER_DESKTOP.png`

Role:

- primary desktop visual authority

Authority:

- top navigation
- generic desktop shell language
- future gameplay-specific desktop composition
- relative desktop proportions
- graphite / wood / restrained-gold balance
- desktop density and hierarchy

Interpretation constraints:

- permanent routes, dots, arrows, and decorative center markup shown in the image are not part of the final resting UI
- the board at rest must remain a clean 8x8 board with frame and pawns only

### `references/ui/MASTER_MOBILE.png`

Role:

- primary mobile visual authority

Authority:

- mobile shell composition
- bottom navigation
- card density
- header behavior
- mobile spacing and hierarchy
- graphite / wood / restrained-gold balance

### `references/ui/secondary/PRODUCT_CONCEPT_OVERVIEW.png`

Role:

- secondary supporting UI reference

Allowed use:

- overall visual language
- supporting examples for game, chat, profile, history, room, and dark / wood / gold balance

Forbidden use:

- overriding `MASTER_DESKTOP`
- overriding `MASTER_MOBILE`
- acting as sole desktop composition authority

## Material-only references

The remaining raw board-material images in `references/` are material-only references.

They may inform:

- wood tone
- grain character
- cell contrast
- frame character
- matte / gloss balance

They are not part of the canonical tracked UI set and are not authoritative for shell or page composition.
