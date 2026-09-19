# EPIC-19 — Rooms Mobile Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Implement only after EPIC-18 human acceptance.

**Goal:** Present actual rooms and lobby membership as compact banking-style rows while preserving the full lifecycle contract.

**Architecture:** Keep `PlayableBetaPage` and `RoomApi` ownership unchanged. Restyle/recompose list and lobby branches only; keep request ownership, AbortControllers, membership projection, and commands intact.

**Tech Stack:** React, TypeScript, Room API/shared DTOs, Vitest, CSS.

## Objective

Redesign Rooms list and room detail as dense, legible mobile flows using only authoritative room data.

## Authoritative visual reference

Approved collage phone 2 plus the locked Rooms specification. No reference categories may become product features.

## Current state problems

Rooms and seats remain visually card-heavy, controls compete for space, and lobby rows are not sufficiently flat or scannable.

## Product truth / constraints

Show only actual API rooms/status/counts. Preserve create, refresh, open, join, seat, ready, start, leave, active-match conflict, `currentMembershipRoom`, route ownership, and stale-response guards. No backend changes or fictional room categories.

## Exact mobile information architecture

Title/subtitle; primary create and compact refresh; real-status filters; flat room rows; detail header/status; flat player/empty-seat rows; contextual lifecycle action; bottom nav.

## Visual specification

Locked palette and metrics; one row per room; 72px minimum rows; subtle dividers; tiny semantic status dot; counts and chevron; no giant outer card or two-column mobile cards.

## Components reused

`PlayableBetaPage`, `RoomApi`, shared room DTOs, `Button`, `Panel`, current lifecycle helpers.

## Components changed

- `apps/web/src/playable-beta/page.tsx`: Rooms/lobby-only markup.
- `apps/web/src/styles.css`: Rooms-scoped mobile styles.
- `apps/web/src/playable-beta/app-playable.test.tsx`: lifecycle and presentation assertions.

## Out of scope

Home, Profile, gameplay, engine, backend, matchmaking, generated categories.

## Implementation steps

- [ ] Add failing deterministic tests for real rows, filters, and lifecycle actions.
- [ ] Verify RED.
- [ ] Recompose list with existing data and commands.
- [ ] Recompose lobby as flat rows without changing handlers.
- [ ] Verify focused/full gates and both viewports.
- [ ] Stop for human review.

## Test plan

Cover create, refresh, open, filters, join, seat, ready, start, leave, membership conflict, late responses, and absence of fictional categories.

## Responsive matrix

390×844 and 430×932 must have no horizontal overflow; desktop remains usable.

## Acceptance criteria

All lifecycle behavior remains authoritative and tested; actual rooms only; compact rows and actions match the visual family.

## Human review checklist

Review list density, truncation, status dots, divider rhythm, action reachability, lobby states, and bottom safe area.

## Commit policy

No commit before explicit acceptance. Do not begin EPIC-20 automatically.

## Locked implementation constants

Use the exact EPIC-18 palette and 14/16/18px breakpoint gutters, 56px header, 64px nav, 50/46px actions, 8/10/14/16px radii, and ≥44px targets. Every room row is wholly tappable. Explicitly forbid `Новички`, `Любители`, and `Профи`. Run `pnpm -C apps/web typecheck`, `pnpm -C apps/web test`, `pnpm -C apps/web build`, and `git diff --check`; provide 390×844 and 430×932 screenshots.
