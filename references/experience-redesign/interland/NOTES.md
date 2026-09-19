# Reference

Interland: Be Internet Awesome

## URL

- https://www.awwwards.com/sites/interland-be-internet-awesome-game
- https://beinternetawesome.withgoogle.com/en_us/interland
- https://www.svepstudios.se/work/google-interland
- https://www.adriaverdaguer.com/projects/google-interland-be-internet-awesome/

## What is valuable

Interland is valuable because it makes navigation feel like movement through a place. The user does not begin with a dashboard; they begin with a world. The scene explains where attention should go through scale, motion, depth, and object placement. Text supports the world instead of carrying the full interface.

For Zamanushka, the transferable idea is not the island/character art. The transferable idea is that a first session can start as an object-driven scene: pawns, die, board fragment, and camera movement establish the game before conventional UI appears.

## Specific screens / interactions inspected

- Awwwards case entry for project context and framing.
- Public Interland product entry.
- Production/case-study references from Svep Studios and Adria Verdaguer.
- Entry/reveal behavior and the way the experience uses scene composition instead of dense text.

Screenshot capture was not available in this environment. No screenshot files were fabricated.

## Motion patterns

- Scene reveal happens through camera movement and scale changes, not only opacity.
- Objects are staged so that the next interaction is visually discoverable.
- Transitions connect states spatially: the camera travels toward a destination instead of swapping pages.
- Idle motion is subtle; it keeps the world alive without requiring user action.
- Feedback is local to the object being touched or hovered.

## Layout patterns

- The primary layout is a navigable world, not a page grid.
- Text sits as a guide layer, while the scene is the primary comprehension layer.
- Clear focal hierarchy: one main object group, then secondary details.

## Hover / touch patterns

- Hover/pointer feedback reads as object responsiveness: lift, focus, gentle movement.
- Interaction does not depend on hover; hover is an enhancement.
- The scene itself carries affordance: objects that matter are placed and lit as usable.

## What Zamanushka should borrow

- Intro as a small physical board-game scene.
- Camera push from Intro into Home.
- Minimal text; let pawn/die/board explain the product.
- A short, memorable first action: press Play, pawn moves, capture impact, camera continues into the app.
- Spatial continuity between Intro, Home, Rooms, Lobby, Game, and Result.

## What Zamanushka must NOT copy

- Google colors.
- Islands.
- Children/education tone.
- Characters.
- Cartoon scale exaggeration.
- Any literal Interland geography.

## Technical observations

- The reference implies a mounted scene for entry and transition, not a permanent heavy 3D layer under every screen.
- Zamanushka should use WebGL only where it earns the cost: Intro and possibly a very lightweight Lobby transition.
- After transition, the scene should dispose/unmount on Telegram mobile.
- Reduced motion must keep the same information with cross-fades and short object state changes.

## Relevance score

10/10

