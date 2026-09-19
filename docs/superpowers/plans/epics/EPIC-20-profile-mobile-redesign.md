# EPIC-20 — Profile Mobile Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Implement only after EPIC-19 human acceptance.

**Goal:** Turn existing profile statistics and history into a calm account/activity screen using only EPIC-08 data.

**Architecture:** Keep `ProfileApi` and `App` loading/cursor ownership. Recompose `ProfilePage`, `HistoryPage`, and `ResultCard`; do not introduce a second store or API.

**Tech Stack:** React, TypeScript, shared profile DTOs, Vitest, CSS.

## Objective

Deliver the approved compact profile/history hierarchy with real identity, statistics, and results.

## Authoritative visual reference

Approved collage phone 3 and locked Profile specification.

## Current state problems

Identity hierarchy is repetitive, statistics feel like separate chunky cards, and result rows expose too much secondary structure.

## Product truth / constraints

Use display name, avatar/fallback, games, wins, losses, win rate, and real history only. No rating, rank, achievements, streaks, level, subscription, raw terminal enum, or prominent UUID.

## Exact mobile information architecture

Profile title; compact identity row; integrated 2×2 stats surface; recent matches heading/All link; flat activity rows; paginated history; bottom nav.

## Visual specification

Locked palette/metrics, 56px avatar, 2×2 surface with internal dividers, result rows at least 70px, semantic color only on tiny dot/label.

## Components reused

`ProfilePage`, `HistoryPage`, `ResultCard`, `ProfileApi`, shared DTOs, `EmptyState`, `StatItem`.

## Components changed

- `apps/web/src/profile/profile-page.tsx`
- `apps/web/src/profile/history-page.tsx`
- `apps/web/src/profile/result-card.tsx`
- `apps/web/src/styles.css`
- existing profile/App tests

## Out of scope

Home, Rooms, gameplay, backend, new profile fields or features.

## Implementation steps

- [ ] Add failing tests for exact real data and forbidden labels/codes.
- [ ] Verify RED.
- [ ] Recompose identity/stats and activity rows.
- [ ] Preserve pagination/navigation and empty/error states.
- [ ] Run focused/full gates and viewport review.
- [ ] Stop for human review.

## Test plan

Verify real stats/history, history navigation/pagination, empty/error states, no fictional fields, no raw backend codes, and no prominent match IDs.

## Responsive matrix

390×844 and 430×932 without horizontal overflow; desktop remains usable.

## Acceptance criteria

Real data only, integrated statistics, scannable neutral activity rows, correct semantic dots, and working history navigation.

## Human review checklist

Review identity alignment, grid separators, date/result hierarchy, truncation, empty state, and bottom safe area.

## Commit policy

No commit before explicit human acceptance.

## Locked implementation constants

Use the exact EPIC-18 palette/metrics scoped under `.profile-page`. Each ≥70px activity row shows result, opponent or winner, date/time, and optionally player count. Victory uses green; loss/surrender uses red only on the small dot/result label. Exact tests live in `apps/web/src/app.test.tsx` and `apps/web/src/ui-polish.test.mjs` and reject rating, achievements, raw terminal codes, and prominent match IDs. Run `pnpm -C apps/web typecheck`, `pnpm -C apps/web test`, `pnpm -C apps/web build`, and `git diff --check`; provide 390×844 and 430×932 screenshots.
