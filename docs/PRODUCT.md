# Product

## Purpose

Zamanushka is a premium Russian-language online board game for 2–4 players, delivered first as a Telegram Mini App and also as a responsive web app. It is a working product, not a landing page or a static concept.

## Product scope

The complete product includes authentication, home, matchmaking, public/private rooms, realtime matches, global and room chat, profiles, history, statistics, rating, board skins, rules/onboarding, and victory results.

## MVP principles

- Mobile-first, Telegram-first, desktop supported as a distinct composition.
- Server-authoritative gameplay with durable recovery.
- Calm, adult, premium presentation based on `/references`.
- Clean 8x8 board with temporary action overlays only.
- Russian interface copy.

## Success scenario

A Telegram user authenticates, creates or joins a 2–4 player room, completes a synchronized match under the canonical rules, sees the result saved to history/statistics, uses chat, and retains a selected board skin. Web and desktop layouts remain fully usable.

## Sources of truth

- Rules: [GAME_RULES.md](./GAME_RULES.md)
- Engine semantics: [GAME_ENGINE.md](./GAME_ENGINE.md)
- Match lifecycle: [MATCH_STATE_MACHINE.md](./MATCH_STATE_MACHINE.md)
- Visual requirements: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)
- Delivery scope: [`epics/`](./epics/)
