# Reference

SUGOROCKS

## URL

- https://www.awwwards.com/inspiration/mobile-sugorocks-corporate-site
- https://sugorocks.com/

## What is valuable

SUGOROCKS is valuable for its board-game personality: physical dice, playful transitions, and object-led page identity. It demonstrates that a website can feel like a game object without turning every screen into a literal game board.

For Zamanushka, it supports the idea that navigation elements can inherit board-game behavior: dice roll, pawn travel, small object shifts, selected row expansion, and table/seat metaphors.

## Specific screens / interactions inspected

- Mobile inspiration entry on Awwwards.
- Live site entry and object-driven presentation direction.

Screenshot capture was not available in this environment. No screenshot files were fabricated.

## Motion patterns

- Dice and game objects can act as transition anchors.
- Short playful motion works best when it is tied to a real navigation or state change.
- Rotations and lifts should be small enough to remain tactile, not theatrical.
- Scene changes can be explained by object movement before text updates.

## Layout patterns

- Strong first object signal.
- Playful identity is concentrated into a few memorable objects, not spread as random decoration.
- Dense copy is avoided in favor of clear objects and compact labels.

## Hover / touch patterns

- Physical object hover can use lift, rotation, and shadow changes.
- Touch equivalents should fire on touch-down with a small press/lift response.
- No important path should require hover.

## What Zamanushka should borrow

- Die as a signature physical object.
- Pawn/die-based transitions.
- Room row hover/touch as a tactile surface, not a plain list row.
- A small amount of personality in empty/loading states.

## What Zamanushka must NOT copy

- Literal SUGOROCKS composition.
- Decorative object overload.
- Motion that delays important gameplay actions.
- Novelty controls that make rooms/lobby harder to scan.

## Technical observations

- Most personality can be implemented with CSS transforms, shadows, and existing assets before adding heavy 3D.
- Dice/pawn assets should be reused across Intro, Lobby, Result, and lightweight UI states.
- Rotational motion should be compositor-only where possible.

## Relevance score

8/10

