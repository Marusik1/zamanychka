# Testing Strategy

## Engine

Table-driven and property-based tests cover every rule in [GAME_RULES.md](./GAME_RULES.md), including route enumeration/rotation, seat templates, every traversed coordinate, globally unique occupancy, the shared-corner friendly/opponent matrix, residual perimeter-to-home steps, `HOME(0)` blocking/capture, occupied home intermediates, `HOME(3)` overrun, exact home entry, capture, six handling, surrender, `REMOVED`, terminal-field invariants, both win reasons, immutability, and determinism.

The six-with-no-actions test asserts preservation of the current player and return to `WAITING_FOR_ROLL`. It must not expect a hidden automatic dice generation.

Tests cover unbiased RNG adapter boundaries, deterministic injected RNG, every command guard and error precedence, cyclic next-active-seat selection, turn-number increments, initial version/sequence values, partial pre-match seat occupancy, every join/leave/readiness version and event, and every lifecycle snapshot invariant.

## API and database

Integration tests cover concurrent commands, `FOR UPDATE`, two commands at one expected version, surrender racing roll/move, durable idempotency, identical simultaneous retries, same action ID with a different actor/type/payload/version, original ACK replay without client regression, atomic snapshot/event/action/result/outbox persistence, immutable per-version snapshot retention/fallback, unique continuous per-match sequence, exactly-once terminal ledgers, rollback behavior, and commit-before-publication.

## Realtime

Tests cover 2–4 clients, duplicates, gaps, out-of-order multi-instance delivery, ranges spanning state versions, reconnect by transition batches, snapshot fallback, missing-match/unauthorized ACK shape, broadcast-before-ACK races, crash after commit/before ACK or publish, missed final broadcast with no later traffic, version-watchdog recovery, and recovery after API restart.

## UI and E2E

UI tests separate authoritative state from presentation queues and verify snapshot cancellation. Product flows receive browser E2E coverage. Every UI epic must pass the visual gate in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## Epic verification

Each epic runs lint, typecheck, relevant unit/integration/E2E tests, build, smoke checks, and any epic-specific infrastructure verification before its completion report.
