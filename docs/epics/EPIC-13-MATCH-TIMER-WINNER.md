# EPIC-13 — Match Timer and Winner Presentation

## Goal

Present server-derived match duration and a human winner summary without introducing client authority.

## Authority

Duration derives from durable `Match.createdAt` (the actual `START_MATCH` transaction timestamp) and `Match.finishedAt` (the terminal transaction timestamp). The realtime `MatchSnapshot` exposes these as `startedAt` and `finishedAt`. During ACTIVE play the UI may tick locally from `startedAt`; FINISHED duration is fixed. Reconnect, reload, and surrender must not reset it.

## UI

- compact “game time” indicator during play;
- winner sees their name and “Ты победил(а)!”;
- other participants see the winner name;
- technical win reason remains in history/data, not the headline.

## Coverage

Start only at `START_MATCH`; persisted duration is identical for participants; reconnect/reload preserve it; surrender finishes it; winner and loser copy are correct.

Checkpoint: `game: add match timer and winner summary`.
