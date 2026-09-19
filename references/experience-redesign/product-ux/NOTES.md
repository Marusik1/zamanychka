# Reference

Board Game Arena and Lichess

## URL

- https://boardgamearena.com/
- https://lichess.org/

## What is valuable

These are product UX references, not art references. They show how real multiplayer games keep joining, status, return-to-game, and board focus understandable under live state.

For Zamanushka, the lesson is that the new art direction must not reduce room/lobby usability. A room list still needs real status, counts, readiness, and current-match recovery.

## Specific screens / interactions inspected

- Room/game discovery patterns.
- Player presence/status patterns.
- Board-first gameplay expectation.
- Fast return to active game.

Screenshot capture was not available in this environment. No screenshot files were fabricated.

## Motion patterns

- Product transitions are short and utilitarian.
- Gameplay state should never wait for decorative animation.
- Return-to-game should be immediate and obvious.

## Layout patterns

- Rooms must remain scannable.
- Player status must be close to the room/game it affects.
- Board dominates gameplay.
- Secondary panels can scroll independently.

## Hover / touch patterns

- Rows and game entries need clear hit areas.
- Active/current game should be visually distinct.
- Mobile touch targets must not shrink because of decorative scenes.

## What Zamanushka should borrow

- Reliable room list structure.
- Active/current room recovery.
- Clear player status.
- Board dominance and minimal gameplay distractions.
- No hidden critical actions.

## What Zamanushka must NOT copy

- Dense utilitarian art direction.
- Desktop-first table density on Telegram mobile.
- Generic dashboard feeling.

## Technical observations

- Keep product state server-authoritative.
- The redesign should wrap real data, not invent fake rooms or profiles.
- Animation should never block match recovery, join, ready, start, or command submission.

## Relevance score

8/10

