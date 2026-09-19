# Motion Storyboard

## 1. Intro Idle

- Starting visual: board fragment on a physical tabletop, Pawn A, Pawn B, die, soft environment.
- User action: none.
- Animation: tiny pawn breathing/lift, die micro-rotation, lighting drift, restrained parallax on pointer movement.
- Duration: continuous loop with 4-7 second variation, low amplitude.
- Ending state: unchanged.
- Reduced-motion fallback: static scene with subtle light state only.

## 2. Intro Hover / Touch

- Starting visual: idle scene.
- User action: pointer over pawn/die/play, or touch-down.
- Animation: pawn lifts 2-4px, path marker brightens; die rotates 5-10 degrees; Play press slightly compresses and camera anticipates forward.
- Duration: MICRO, 120-180ms.
- Ending state: object returns or remains highlighted while hovered/pressed.
- Reduced-motion fallback: opacity/outline state change.

## 3. Play Press

- Starting visual: Intro with text and Play.
- User action: press Play.
- Animation: text fades/moves aside, camera starts to orient toward board path.
- Duration: UI, 220-320ms.
- Ending state: scene is clear for pawn movement.
- Reduced-motion fallback: text fades out, board path highlights.

## 4. Pawn A Movement

- Starting visual: Pawn A at start cell.
- User action: follows Play press.
- Animation: Pawn A lifts, moves one cell, settles lightly, then moves second cell.
- Duration: 350-500ms within cinematic sequence.
- Ending state: Pawn A near Pawn B.
- Reduced-motion fallback: two highlighted cells, pawn appears at second cell.

## 5. Pawn B Capture

- Starting visual: Pawn A approaches Pawn B.
- User action: none.
- Animation: Pawn A reaches Pawn B; physical impact; Pawn B tilts and slides/moves away; Pawn A settles. No explosion.
- Duration: 180-280ms impact + settle.
- Ending state: Pawn A owns destination; Pawn B displaced/removed.
- Reduced-motion fallback: Pawn B fades/slides minimally; destination highlights.

## 6. Camera -> Home

- Starting visual: capture has settled.
- User action: none.
- Animation: camera continues toward destination; board/world fills screen; scene morphs into Home interface.
- Duration: SPATIAL/CINEMATIC, complete first-time Intro total 1200-1800ms.
- Ending state: Home.
- Reduced-motion fallback: cross-fade from scene to Home with scale hint.

Fast returning-user version: same story compressed to 600-900ms, skip idle build-up and reduce pawn movement to one readable beat.

## 7. Home -> Rooms

- Starting visual: Home scene with contextual UI.
- User action: Rooms.
- Animation: table/board fragment shifts sideways or forward; room-list panel materializes from the world plane.
- Duration: NAVIGATION, 300-500ms.
- Ending state: Rooms list.
- Reduced-motion fallback: Home fades to Rooms with active nav state.

## 8. Room Hover / Touch

- Starting visual: room row.
- User action: hover/touch room row.
- Animation: row surface lifts 1-2px, status pawn/table mark brightens, arrow/edge moves slightly.
- Duration: MICRO, 120-180ms.
- Ending state: highlighted row.
- Reduced-motion fallback: border/background state.

## 9. Room -> Lobby

- Starting visual: selected room row.
- User action: open room.
- Animation: row expands or small table visual grows into Lobby scene; surrounding rows recede.
- Duration: 250-450ms.
- Ending state: Lobby.
- Reduced-motion fallback: instant route with row-selected flash.

## 10. Player Joins Lobby

- Starting visual: Lobby table with empty seat anchor.
- User action: join/take seat.
- Animation: pawn/avatar arrives to seat anchor; seat label resolves from empty to player.
- Duration: UI, 220-320ms.
- Ending state: seat occupied.
- Reduced-motion fallback: seat content cross-fades and ready control appears.

## 11. Ready

- Starting visual: occupied seat, not ready.
- User action: ready.
- Animation: seat marker flips/brightens; pawn receives small settled glow; ready count updates.
- Duration: MICRO/UI, 160-260ms.
- Ending state: ready state.
- Reduced-motion fallback: color/text update only.

## 12. Lobby -> Game

- Starting visual: lobby mini board/table with players around it.
- User action: start match or server start event.
- Animation: controls recede; camera pushes toward mini board; board scales; actual GameBoard becomes full interactive board.
- Duration: SPATIAL, 500-900ms.
- Ending state: Game.
- Reduced-motion fallback: short cross-fade to GameBoard with active match header.

## 13. Result

- Starting visual: final gameplay animation has finished.
- User action: none or final command resolution.
- Animation: short pause; camera pulls back slightly; winner piece/lighting appears; score/result controls materialize.
- Duration: NAVIGATION/SPATIAL, 500-900ms after final animation.
- Ending state: Result.
- Reduced-motion fallback: result panel fades in after final board state.

