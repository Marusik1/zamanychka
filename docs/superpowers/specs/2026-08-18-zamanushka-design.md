# Zamanushka Approved Design

The MVP product design is frozen as of 2026-08-18. The canonical specification is split by concern to avoid duplication:

- Product: `docs/PRODUCT.md`
- Rules: `docs/GAME_RULES.md`
- Engine: `docs/GAME_ENGINE.md`
- State machine: `docs/MATCH_STATE_MACHINE.md`
- Architecture: `docs/ARCHITECTURE.md`
- Persistence: `docs/DATABASE.md`
- Realtime: `docs/REALTIME_PROTOCOL.md`
- Visual system: `docs/DESIGN_SYSTEM.md`
- Testing: `docs/TESTING.md`
- Telegram boundary: `docs/TELEGRAM.md`
- Delivery: `docs/EPICS.md` and `docs/epics/`

These documents together are the approved design. If they conflict, `GAME_RULES.md` controls mechanics, reference images control visual composition, and architectural authority/integrity constraints control persistence and transport behavior. Current execution authorization ends after EPIC-00.
