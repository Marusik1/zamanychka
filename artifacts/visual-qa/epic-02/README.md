# EPIC-02 visual QA

Date: Sunday, August 23, 2026

Implementation under review:

- authenticated shell with placeholder home route
- references:
  - mobile: `references/ui/MASTER_MOBILE.png`
  - desktop: `references/ui/MASTER_DESKTOP.png`

Reference pairing:

- `390x844.png` → `MASTER_MOBILE.png`
- `430x932.png` → `MASTER_MOBILE.png`
- `1024x768.png` → transition check against both masters
- `1440x900.png` → `MASTER_DESKTOP.png`
- `1920x1080.png` → `MASTER_DESKTOP.png`

Notes:

- EPIC-02 intentionally does not implement gameplay board state, pawns, dice, rooms, chat, history, rating, or board skins.
- Placeholder scaffolds are evaluated only for shell hierarchy, density, spacing, and responsive behavior.
- The `1920x1080.png` capture includes the host machine Windows activation watermark in the lower-right corner. This is an environment artifact, not product UI.

## 390x844

- Evidence: `390x844.png`
- Reference: `MASTER_MOBILE.png`
- Result: approved with minor intentional deviation

Comparison notes:

- mobile shell reads as a distinct mobile composition with large display brand, stacked content, and fixed bottom navigation
- graphite/navy base and restrained gold accents are preserved
- session card is now visible and no longer disappears below bottom navigation
- bottom navigation no longer causes horizontal overflow
- density is simpler than the master because EPIC-02 uses placeholder content rather than the full gameplay/dashboard surfaces in the reference

Intentional deviations:

- no gameplay board or CTA stack from the master, by EPIC scope
- placeholder scaffold blocks replace feature content

## 430x932

- Evidence: `430x932.png`
- Reference: `MASTER_MOBILE.png`
- Result: approved with minor intentional deviation

Comparison notes:

- hierarchy remains stable versus `390x844`
- spacing and typography scale cleanly
- bottom navigation remains contained without overflow
- dark surface / gold-outline treatment stays consistent with the approved visual system

Intentional deviations:

- same EPIC-02 placeholder-only limitation as above

## 1024x768

- Evidence: `1024x768.png`
- Reference: transitional check against `MASTER_MOBILE.png` and `MASTER_DESKTOP.png`
- Result: approved

Comparison notes:

- composition has switched to desktop navigation while keeping content stacked, which is acceptable at the breakpoint boundary
- typography, card surfaces, border character, and color balance remain consistent
- authenticated session panel remains visible and does not overlap navigation

Intentional deviations:

- no dedicated gameplay desktop layout yet; EPIC-02 delivers the generic desktop app shell, not the later specialized gameplay composition

## 1440x900

- Evidence: `1440x900.png`
- Reference: `MASTER_DESKTOP.png`
- Result: approved with known scope-driven simplification

Comparison notes:

- top navigation, wide content field, and separate right-side session panel clearly read as desktop
- palette, border/radius character, and restrained gold usage align with the master direction
- whitespace is calmer and more minimal than the gameplay master, but still within the approved shell/design-system scope

Intentional deviations:

- no dominant board in the center, because EPIC-02 does not implement gameplay surfaces
- right rail contains session proof rather than gameplay/chat controls

## 1920x1080

- Evidence: `1920x1080.png`
- Reference: `MASTER_DESKTOP.png`
- Result: approved with environment artifact

Comparison notes:

- composition remains consistent with `1440x900`
- large-screen spacing stays balanced without accidental mobile stretching
- navigation and panel density remain controlled and visually calm

Environment artifact:

- the lower-right Windows activation watermark is outside product scope and comes from the host OS capture environment

## Visual fixes made during QA

1. adjusted mobile authenticated-shell layout so the session card no longer falls below the bottom navigation
2. reduced mobile placeholder density to avoid excess vertical crowding
3. tightened mobile bottom-navigation label sizing and overflow behavior to eliminate horizontal scrolling
4. corrected screenshot capture framing to remove browser title-bar artifacts from non-fullscreen captures

## Final visual assessment

- mobile shell: acceptable and clearly reference-aligned at the design-system level
- desktop shell: acceptable as a generic desktop shell, with deliberate simplification relative to the gameplay master
- no blocker visual drift into SaaS dashboard / casino / fantasy / gacha aesthetics
- remaining differences are primarily scope-driven and expected before gameplay/layout epics
