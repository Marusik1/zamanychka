# EPIC-15 — Gameplay UI Cleanup

## Goal

Keep gameplay information useful, human-readable, and subordinate to the board.

## Scope

- remove the large “О комнате” gameplay block, move count, turn timer, technical win-reason headline, and raw backend error codes;
- retain compact rules, history, settings, and chat controls;
- show human event history without IDs, sequences, state versions, or UUIDs;
- settings contain real room code, players/status, copy code, and context-safe leave behavior;
- use Telegram photo URL when available, otherwise initials.

No gameplay, room, realtime, or auth behavior changes. Check rules/history/settings/chat/finished UI and raw-error regressions.

Checkpoint: `ui: simplify gameplay information hierarchy`.
