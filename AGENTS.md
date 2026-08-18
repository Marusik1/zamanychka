# Zamanushka Repository Rules

## Product

1. This product is **Zamanushka**, not chess, Ludo, or a generic board-game UI.
2. `docs/GAME_RULES.md` is the canonical rules source.
3. Normal movement uses only the 8x8 board perimeter, clockwise.
4. All pieces are classic pawns: red, blue, green, and yellow.
5. A six can enter a pawn or move an eligible pawn and preserves the turn for another `ROLL_DICE` command.
6. If a six has no legal actions, keep the same player and return to `WAITING_FOR_ROLL`; never generate a hidden automatic roll.
7. Jumping over any physically occupied coordinate is forbidden.
8. Capture, home entry, surrender, and victory are server-authoritative.
9. Victory is either completing `HOME(0..3)` or being the last active player.

## UI

1. Mobile-first and Telegram Mini App first, with a separately composed desktop layout.
2. References in `/references` have the highest priority for visual composition.
3. The board is always the primary visual object and remains clean at rest.
4. Route hints and action overlays are temporary, soft, and translucent.
5. Gold is an accent only. Avoid casino, fantasy, gacha, cartoon, excessive glow, blur, and random gradients.
6. Pawns are volumetric board objects centered on cells, never flat tokens or UI icons.
7. Board materials are constructed layers, not stretched reference photographs.
8. Every UI epic requires browser screenshots at 390x844, 430x932, 1440x900, and 1920x1080 and comparison with its reference.

## Engineering

1. PostgreSQL is the durable authoritative source. Redis is acceleration/ephemeral infrastructure only.
2. Game rules live in the pure TypeScript `packages/game-engine` package, separate from UI, Fastify, databases, and realtime transport.
3. Shared contracts are validated and exported from `packages/shared`.
4. TypeScript strict mode is mandatory.
5. Commands for one match are serialized and persisted with idempotency.
6. Commit before Socket.IO ACK/broadcast. Reconnect and snapshot recovery are mandatory.
7. Rules, concurrency, idempotency, and recovery require tests.

## Current execution boundary

Only EPIC-00 may be implemented in the current run. Stop after its verification and report. Do not implement Telegram auth, game rules, multiplayer gameplay, chat, profiles, or board-skin functionality without explicit user approval.
