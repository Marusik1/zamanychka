# Testing Strategy

## Engine

Table-driven and property-based tests cover every rule in [GAME_RULES.md](./GAME_RULES.md), including four-player route rotations, every traversed coordinate, `HOME(0)` blocking, exact home entry, capture, six handling, surrender, `REMOVED`, both win reasons, immutability, and determinism.

The six-with-no-actions test asserts preservation of the current player and return to `WAITING_FOR_ROLL`. It must not expect a hidden automatic dice generation.

## API and database

Integration tests cover concurrent commands, `FOR UPDATE`, durable idempotency, original ACK replay, atomic snapshot/event/action/result persistence, continuous per-match sequence, rollback behavior, and commit-before-broadcast.

## Realtime

Tests cover 2–4 clients, duplicates, gaps, out-of-order delivery, reconnect by events, snapshot fallback, and recovery after API restart.

## UI and E2E

UI tests separate authoritative state from presentation queues and verify snapshot cancellation. Product flows receive browser E2E coverage. Every UI epic must pass the visual gate in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## Epic verification

Each epic runs lint, typecheck, relevant unit/integration/E2E tests, build, smoke checks, and any epic-specific infrastructure verification before its completion report.
