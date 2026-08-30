# Beta UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing beta interface denser, calmer, and more coherent on Telegram-sized mobile viewports without changing product behavior.

**Architecture:** Keep the current React structure and UI package. Add a small presentation contract test, tune existing foundation tokens, and add responsive screen-specific styles for auth, home, lobby, match, profile, and rules.

**Tech Stack:** React, TypeScript, CSS, Vitest, Vite.

---

### Task 1: Compact responsive presentation

**Files:**

- Create: `apps/web/src/ui-polish.test.ts`
- Modify: `packages/ui/src/foundation.css`
- Modify: `apps/web/src/styles.css`
- Modify only if required for semantic grouping: `apps/web/src/playable-beta/page.tsx`

- [ ] Add a failing presentation-contract test for responsive lobby, board-first match layout, compact shell chrome, and reduced-motion feedback.
- [ ] Run the focused test and confirm it fails for missing polish selectors.
- [ ] Implement the smallest token and CSS changes that satisfy the approved design.
- [ ] Run focused and full web tests plus typecheck.
- [ ] Inspect 390x844, 430x932, and 1440x900 against the approved references.
- [ ] Run build and `git diff --check`.
- [ ] Commit as `beta: polish mobile UI and spacing`.
- [ ] Create the clean deployment folder from committed HEAD.
