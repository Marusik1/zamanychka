# Epic Index

The project is delivered sequentially. An epic starts only after explicit approval following the previous epic report.

- [EPIC-00 Foundation](./epics/EPIC-00-FOUNDATION.md)
- [EPIC-01 Telegram Auth](./epics/EPIC-01-TELEGRAM-AUTH.md)
- [EPIC-02 Design System](./epics/EPIC-02-DESIGN-SYSTEM.md)
- [EPIC-03 Game Engine](./epics/EPIC-03-GAME-ENGINE.md)
- [EPIC-04 Single Persistent Game Room](./epics/EPIC-04-ROOMS.md)
- [EPIC-05 Realtime](./epics/EPIC-05-REALTIME.md)
- [EPIC-06 Game UI](./epics/EPIC-06-GAME-UI.md)
- [EPIC-07 Chat](./epics/EPIC-07-CHAT.md)
- [EPIC-08 Profile](./epics/EPIC-08-PROFILE.md)
- [EPIC-09 Board Skins](./epics/EPIC-09-BOARD-SKINS.md)
- [EPIC-10 Tutorial](./epics/EPIC-10-TUTORIAL.md)
- [EPIC-11 Extra Roll After Capture](./epics/EPIC-11-EXTRA-ROLL-AFTER-CAPTURE.md)
- [EPIC-12 Inactive Corner Rule](./epics/EPIC-12-INACTIVE-CORNER.md) — decision required before implementation
- [EPIC-13 Match Timer and Winner Presentation](./epics/EPIC-13-MATCH-TIMER-WINNER.md)
- [EPIC-15 Gameplay UI Cleanup](./epics/EPIC-15-GAMEPLAY-UI-CLEANUP.md)
- [EPIC-17 Responsive Gameplay Shell](./epics/EPIC-17-RESPONSIVE-GAMEPLAY-SHELL.md)
- [EPIC-16 Room and Match Lifecycle Hardening](./epics/EPIC-16-ROOM-MATCH-LIFECYCLE.md)

## Completion roadmap

The remaining delivery order is strictly:

1. EPIC-11 — Extra Roll After Capture
2. EPIC-12 — Inactive Corner Rule (only after its explicit product decision)
3. EPIC-13 — Match Timer and Winner Presentation
4. EPIC-15 — Gameplay UI Cleanup
5. EPIC-17 — Responsive Gameplay Shell
6. EPIC-16 — Room and Match Lifecycle Hardening
7. Final product acceptance

EPIC-14 Sounds is **DEFERRED**. It requires selected and approved sound assets before a separate integration specification exists.

Each epic is an isolated checkpoint: inspect the current implementation, document any rule delta, add regression tests, make the minimal change, run relevant gates and manual smoke, review the diff, commit once, and stop. Reuse the existing game engine, multi-room backend, room API, realtime client, presentation controller/FIFO, board renderer, pawn/die components, chat, and result/profile systems. Do not create parallel versions of those systems.

## Execution checklist

- EPIC-11: engine transition and shared event reason; API journal, realtime presentation, regression and two-client capture smoke.
- EPIC-12: obtain the explicit inactive-corner decision before any implementation.
- EPIC-13: use authoritative match lifecycle for timer and winner presentation.
- EPIC-15: remove only approved user-facing remnants; retain current gameplay systems.
- EPIC-17: validate mobile and desktop composition with the existing gameplay shell.
- EPIC-16: harden room/match lifecycle through the existing multi-room contracts and integration tests.

Current authorization: implement EPIC-11 only, verify, report, and stop. EPIC-12 remains blocked on its explicit product decision.
