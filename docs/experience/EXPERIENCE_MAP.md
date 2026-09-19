# Experience Map

```text
START
  |
  v
INTRO
  |
  v
HOME
  |
  v
ROOMS
  |
  v
LOBBY
  |
  v
GAME
  |
  v
RESULT
```

Branches:

```text
HOME -> PROFILE
HOME -> CURRENT MATCH
ROOMS -> CURRENT ROOM
RESULT -> ROOM
```

## Spatial Continuity

### Start -> Intro

The user enters a small physical board-game world. The first visible elements are not menus; they are pawns, die, and board fragment.

### Intro -> Home

The Play press causes the camera to travel across the board fragment. The capture action teaches the game language, then the scene resolves into Home. Home should feel like the same table viewed from a clearer product angle.

### Home -> Rooms

Rooms is "find a table." The transition should feel like moving from the personal table/world into a list of available tables. The list remains real and scannable.

### Rooms -> Lobby

The selected room row becomes the source of the Lobby. Either the row expands or its table visual grows into the lobby table. This preserves the relationship between the chosen room and the next screen.

### Lobby -> Game

The lobby mini board/table becomes the gameplay board. Controls recede and the board grows. This is the second signature transition.

### Game -> Result

The final gameplay animation remains the source. Result appears after the final board state, not as a disconnected modal.

## Branches

### Home -> Profile

Profile is the calmest branch. It shares materials, typography, and motion tokens, but does not need 3D spectacle.

### Home -> Current Match

Current match recovery should use the fastest path. If a current match exists, Continue should take the user directly to Game with minimal transition.

### Rooms -> Current Room

If the user already belongs to a room, the current room state must stay distinct from the room currently being viewed. Visual polish must not hide conflict/return behavior.

### Result -> Room

Return should feel like pulling back from the finished board to the room table, preserving the sense that the match happened inside that room.

