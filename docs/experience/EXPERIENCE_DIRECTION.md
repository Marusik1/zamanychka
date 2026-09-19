# Zamanushka Experience Direction

## Thesis

Zamanushka should feel like entering and moving through a small physical board-game world.

It should not feel like a dashboard with a board attached.

The application should move through scenes:

INTRO -> HOME -> ROOMS -> LOBBY -> GAME -> RESULT

Each scene should feel spatially related to the previous one. The user should understand that they are moving closer to the table, not switching between unrelated screens.

## Core Experience

The first impression is a lightweight environment with two pawns, a die, and a board fragment. The game announces itself through objects. Text is secondary.

The signature moment is a short pawn movement and capture transition after Play:

- Pawn A moves.
- Pawn B is visible ahead.
- Pawn A reaches Pawn B.
- Pawn B reacts physically and moves/tilts away.
- Camera continues toward the board.
- The board/world fills the screen.
- The experience becomes Home.

This teaches the game language before the user reads rules.

## First Screen Concept

Required scene objects:

- Pawn A.
- Pawn B.
- Die.
- Board fragment.
- Lightweight physical environment.

Suggested copy:

```text
ЗАМАНУШКА
Один ход может всё изменить.
[ Играть ]
```

The text should not be the main object. The scene is the main object.

## Scene Responsibilities

### Intro

Purpose: create memory and teach object language.

Intro is the only scene that may use cinematic timing. It should run once in full for first-time users and in shortened form for returning users.

### Home

Purpose: orient and route.

Home is a continuation of Intro, not a card dashboard. It exposes real actions:

- Continue if real membership/current match exists.
- Rooms.
- Rules.
- Profile/navigation.

The scene may show a board fragment or table object, but UI clarity comes first.

### Rooms

Purpose: find a table.

Rooms must remain a usable list. It may use small pawn/table/die identity, but real data dominates:

- room code
- status
- members
- seated
- ready

### Lobby

Purpose: gather around a table.

Lobby uses a central small board/table and four seat anchors. It still clearly shows room code, seats, ready, start, leave.

When a player joins, their pawn/avatar arrives at a seat. When ready, the seat state changes visibly. These animations must not block actions.

### Game

Purpose: play.

The current board remains authoritative. The redesign can change presentation later, but mechanics and backend do not move into the frontend.

### Result

Purpose: resolve the match emotionally and clearly.

Result begins after final gameplay animation, pauses briefly, pulls camera back slightly, and presents winner/loser state with physical pieces and lighting. No casino confetti and no particle explosion.

## Art Direction

The previous dark graphite + gold direction is no longer visually authoritative.

Explore:

- Warm daylight board game.
- Soft dusk / muted atmospheric.
- Light editorial / physical tabletop.

Recommended baseline: Light editorial / physical tabletop, because it most clearly separates the next direction from the previous beta shell while preserving physical quality.

## Material Direction

Recommended:

- Painted wood pawns.
- Matte ceramic die.
- Wood + painted board fragment.

Acceptable alternative:

- Soft enamel pawns if painted wood loses clarity on small mobile screens.

Avoid:

- glossy plastic
- black luxury chrome
- fantasy metal
- casino gold

## Asset List

Required assets:

- `pawn-red.glb`
- `pawn-blue.glb`
- `pawn-green.glb`
- `pawn-yellow.glb`
- `die.glb`
- `intro-board-fragment.glb`

Optional:

- small modular environment pieces reused from Intro/Lobby

Do not create dozens of unique models. Reuse reduced versions in Lobby and Result.

## Performance Strategy

Telegram Mini App is a hard constraint.

- Load WebGL only for Intro and major spatial transition prototypes.
- Dispose/unmount Intro scene after transition.
- Keep Home/Rooms/Profile primarily CSS and lightweight transforms.
- Lobby may use a lightweight scene only if it proves valuable.
- Do not run a permanent giant WebGL scene under all pages.
- Target compressed 3D assets and textures.
- Keep initial scene small enough to load quickly on mobile.
- Provide non-WebGL fallback: rendered board fragment, pawn sprites, CSS transforms.
- Respect `prefers-reduced-motion`.

## Motion Tokens

| Token | Duration | Use |
| --- | ---: | --- |
| MICRO | 120-180ms | press, hover, chip feedback |
| UI | 220-320ms | panel/sheet open, row reveal |
| NAVIGATION | 300-500ms | Home -> Rooms, row -> Lobby |
| SPATIAL | 500-900ms | Lobby -> Game, camera push |
| CINEMATIC | 900-1800ms | first-time Intro |

Recommended curves:

- Micro: `cubic-bezier(0.2, 0, 0, 1)`
- UI: `cubic-bezier(0.22, 1, 0.36, 1)`
- Navigation: `cubic-bezier(0.16, 1, 0.3, 1)`
- Spatial: spring-like critical damping, no decorative bounce
- Capture impact: short squash/tilt with damped settle

## Reduced Motion Strategy

Reduced motion does not remove feedback.

Replace:

- camera push with cross-fade + scale hint
- pawn travel with two or three discrete highlighted positions
- capture impact with color/lighting change and static before/after
- row expansion with instant layout plus opacity reveal

Never hide state transitions from reduced-motion users.

