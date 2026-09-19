# EPIC-18 — Home Mobile Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Do not continue to EPIC-19 without human acceptance.

**Goal:** Rebuild the authenticated mobile Home screen around real identity, real profile statistics, and existing navigation.

**Architecture:** Keep `App` as the owner of authentication/profile loading and pass read-only Home summary data into `PlayableBetaPage`. Render a dedicated Home information hierarchy and isolate its CSS with `.beta-home-page`/non-game shell selectors.

**Tech Stack:** React, TypeScript, shared profile DTOs, Vitest, CSS.

## Objective

Match the approved banking-style Home reference without adding fictional product capabilities.

## Authoritative visual reference

`ChatGPT Image 9 сент. 2026 г., 17_48_34.png`, phone 1. Presentation is authoritative; current APIs remain authoritative for behavior and data.

## Current state problems

The current Home is a promotional hero plus secondary advertising card. It duplicates session identity, omits real statistics, and lacks compact functional rows.

## Product truth / constraints

Use only authenticated display name, `ProfileResponseDto.stats`, Rooms navigation, and Rules navigation. No PRO, rating, tournaments, matchmaking, achievements, streaks, fake users, or fake counts. Do not touch gameplay.

## Exact mobile information architecture

1. Compact brand header.
2. Welcome/summary surface: player name, supporting text, three real values (games, win rate, wins).
3. Gold `Открыть комнаты` CTA with explanatory subtext.
4. Flat functional rows: `Комнаты`, `Правила игры`.
5. Existing three-item bottom navigation.

## Visual specification

Use locked palette, 14–18px responsive gutters, 56px header, 64px bottom nav, radii no larger than 16px, 50px primary action, system UI type, serif only for brand/major editorial heading, and touch targets at least 44px.

## Components reused

`App`, `PlayableBetaPage`, `ProfileApi`, `AppShell`, `BottomNav`, `Button`, approved `game-table-v1.png`.

## Components changed

- `apps/web/src/app.tsx`: load/reuse profile summary on Home and pass it down.
- `apps/web/src/playable-beta/page.tsx`: Home-only structure.
- `apps/web/src/styles.css`: Home-scoped mobile styling.
- `apps/web/src/playable-beta/app-playable.test.tsx`: Home behavior/data regression coverage.
- `apps/web/src/ui-polish.test.mjs`: visual contract.

## Out of scope

Rooms list/lobby redesign, Profile redesign, gameplay, board, dice, pawns, sounds, engine, backend, new APIs.

## Implementation steps

- [ ] Add a failing Home test for real player name/stats, Rooms and Rules links, and absent fictional labels.
- [ ] Run the focused test and confirm expected failure.
- [ ] Reuse the existing profile request in `App` for Home.
- [ ] Replace the promotional Home structure with welcome/stats, primary CTA, and functional rows.
- [ ] Scope the locked visual layer to Home so Rooms/Profile/gameplay are unchanged.
- [ ] Run focused tests, full web tests, typecheck, build, and `git diff --check`.
- [ ] Capture 390×844 and 430×932 evidence and stop for review.

## Test plan

Assert the real name and API statistics render, Rooms CTA changes route, Rules row changes route, fictional labels are absent, and gameplay selectors/files are unchanged. Run `pnpm -C apps/web test`, typecheck, and build.

## Responsive matrix

- 390×844: header, summary, CTA, first functional row, and bottom nav visible without horizontal overflow.
- 430×932: all primary Home content comfortably spaced.
- Desktop: existing layout remains usable.

## Acceptance criteria

Real data only; no duplicated giant session card; primary CTA and functional rows work; no overflow; locked palette/type/spacing; gameplay unchanged.

## Human review checklist

Compare hierarchy, density, color, typography, dividers, button size, safe areas, and bottom nav at both target viewports.

## Commit policy

Do not commit before explicit human visual acceptance. Stop before EPIC-19.

## Locked implementation constants

Palette: backgrounds `#081015/#060C10`; surfaces `#0D171D/#111D24/#16232B`; border/divider `rgba(221,231,235,.10/.08)`; text `#F2EFE8/#A8B0B3/#727E83`; gold `#D7A955/#E7BC6B/#C7974B`; success/danger `#4FC77B/#E05252`. Gutters: 14px ≤374, 16px at 375–409, 18px ≥410. Header/nav: 56/64px plus safe areas. Primary/secondary: 50/46px. Radii: 8/10/14/16px. Targets: ≥44px. Tests explicitly reject PRO, rating, tournaments, and fake quick matchmaking and exercise Rooms, Rules, and bottom navigation. The old promo/image card is removed; no giant dead zone is accepted.
