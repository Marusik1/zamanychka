# EPIC-02 Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved EPIC-02 design system and responsive application shell for Zamanushka, migrate the EPIC-01 auth shell into it without changing auth semantics, and produce the required visual-QA evidence.

**Architecture:** EPIC-02 implementation should keep presentation concerns split cleanly between `packages/ui` and `apps/web`. `packages/ui` owns tokens, foundation CSS, reusable primitives, and shell-safe layout components. `apps/web` owns route composition, placeholder shell pages, and the auth-shell migration. The generic `DesktopAppShell` and specialized future `DesktopGameLayout` are separate concepts; EPIC-02 implements only the generic shell and preserves hooks for the future gameplay layout.

**Tech Stack:** React, TypeScript, Vite, Vitest, existing Telegram adapter/auth bootstrap, CSS via `packages/ui/src/foundation.css`, Playwright/browser screenshot QA, ESLint, Prettier.

---

## File Structure

### Existing files to modify

- `packages/ui/src/foundation.css`
  - replace provisional EPIC-00/01 tokens with approved semantic tokens, spacing, typography, radius, border, elevation, motion, and responsive CSS variables
- `packages/ui/src/app-frame.tsx`
  - evolve minimal frame into a shell-safe root layout primitive or replace with a clearer shell boundary
- `packages/ui/src/index.ts`
  - export new primitives and shell components
- `packages/ui/src/app-frame.test.tsx`
  - update or replace tests to reflect real shell behavior
- `apps/web/src/styles.css`
  - remove provisional auth-only styling and connect page-level styles to the new design system
- `apps/web/src/app.tsx`
  - replace the current single auth-frame composition with route-aware shell composition while preserving EPIC-01 auth behavior
- `apps/web/src/app.test.tsx`
  - update app-level tests for the new shell and auth state coverage
- `apps/web/src/auth/auth-shell.tsx`
  - restyle the auth presentation for the approved shell without changing auth semantics
- `apps/web/src/auth/auth-shell.test.tsx`
  - update coverage for all auth presentation states after migration
- `apps/web/src/main.tsx`
  - include any new shell providers or route wrappers only if necessary
- `apps/web/package.json`
  - add test-only or UI-safe dependencies only if the existing stack is insufficient
- `docs/DESIGN_SYSTEM.md`
  - update the concise canonical design-system contract after EPIC-02 implementation is complete

### New files to create

- `packages/ui/src/tokens.ts`
  - typed export of semantic token names/constants if useful for tests and component APIs
- `packages/ui/src/shell/app-shell.tsx`
  - generic responsive shell root for mobile and desktop
- `packages/ui/src/shell/app-shell.css` or use `foundation.css` only if kept centralized
  - shell-specific structural styles if they would otherwise bloat foundation CSS
- `packages/ui/src/navigation/top-nav.tsx`
  - desktop navigation primitive
- `packages/ui/src/navigation/bottom-nav.tsx`
  - mobile navigation primitive
- `packages/ui/src/navigation/navigation.test.tsx`
  - state and accessibility coverage for shell navigation
- `packages/ui/src/primitives/button.tsx`
  - unified button primitive with variants and states
- `packages/ui/src/primitives/button.test.tsx`
  - button state coverage
- `packages/ui/src/primitives/icon-button.tsx`
  - icon-button primitive
- `packages/ui/src/primitives/panel.tsx`
  - reusable elevated surface/panel primitive
- `packages/ui/src/primitives/field.tsx`
  - text input/textarea wrapper primitives if useful
- `packages/ui/src/primitives/tabs.tsx`
  - tabs or segmented-control primitive
- `packages/ui/src/primitives/dialog.tsx`
  - modal/dialog primitive
- `packages/ui/src/primitives/bottom-sheet.tsx`
  - mobile-oriented bottom sheet primitive
- `packages/ui/src/primitives/status.tsx`
  - inline status / empty-state / toast-safe status surface
- `packages/ui/src/primitives/primitives.test.tsx`
  - focused state and a11y coverage for shared primitives
- `apps/web/src/shell/routes.tsx`
  - route definitions for shell-safe placeholder destinations
- `apps/web/src/shell/placeholder-page.tsx`
  - constrained placeholder composition for non-implemented sections
- `apps/web/src/shell/shell-layout.test.tsx`
  - route, shell, and responsive composition coverage
- `apps/web/src/dev/ui-showcase.tsx`
  - development-only component showcase if implementation confirms it is needed
- `apps/web/src/dev/ui-showcase.test.tsx`
  - dev-only route guard and rendering coverage if showcase exists
- `artifacts/visual-qa/epic-02/README.md`
  - visual evidence manifest produced during implementation, not before

### Existing files to inspect during implementation

- `docs/superpowers/specs/2026-08-20-epic-02-design-system.md`
- `docs/GAME_RULES.md`
- `docs/DESIGN_SYSTEM.md`
- `references/README.md`
- `references/ui/MASTER_DESKTOP.png`
- `references/ui/MASTER_MOBILE.png`
- `references/ui/secondary/PRODUCT_CONCEPT_OVERVIEW.png`
- `apps/web/src/auth/api.ts`
- `apps/web/src/auth/bootstrap.ts`
- `apps/web/src/telegram/adapter.ts`

## Task 1: Freeze EPIC-02 Reference and Shell Boundaries

**Files:**

- Inspect: `docs/superpowers/specs/2026-08-20-epic-02-design-system.md`
- Inspect: `references/README.md`
- Test: `packages/ui/src/navigation/navigation.test.tsx`

- [ ] **Step 1: Write failing shell-boundary tests**

Cover:

- generic desktop shell renders non-game pages without gameplay-only left/right rails
- no requirement for player/status, dice/actions, or chat columns on non-game pages
- a future gameplay layout is not created in this task

- [ ] **Step 2: Run the focused shell-boundary tests**

Run: `pnpm -C packages/ui test -- navigation.test.tsx`
Expected: FAIL because the boundary is not yet encoded through tests and API shape

- [ ] **Step 3: Encode the boundary in shell API/tests**

Freeze the boundary through test names, component props, and minimal comments where necessary:

- `DesktopAppShell` is generic
- `DesktopGameLayout` is future work
- gameplay-only three-column structure is forbidden in EPIC-02 generic shell code

- [ ] **Step 4: Re-run the shell-boundary tests**

Run: `pnpm -C packages/ui test -- navigation.test.tsx`
Expected: PASS

## Task 2: Replace Provisional Foundation Tokens

**Files:**

- Modify: `packages/ui/src/foundation.css`
- Create: `packages/ui/src/tokens.ts`
- Test: `packages/ui/src/primitives/primitives.test.tsx`

- [ ] **Step 1: Write the failing token-usage test**

Add a test that renders a minimal primitive tree and asserts the expected semantic classes/variables are present rather than provisional `foundation-*` assumptions.

- [ ] **Step 2: Run the focused test to see it fail**

Run: `pnpm -C packages/ui test -- primitives.test.tsx`
Expected: FAIL because the new tokenized primitives do not exist yet

- [ ] **Step 3: Replace foundation CSS with approved semantic groups**

Implement semantic CSS variables for:

- backgrounds
- text roles
- accent roles
- spacing scale
- typography roles
- radius
- borders
- elevation
- motion
- z-index layers

Do not add gameplay-specific visual rules here.

- [ ] **Step 4: Add optional typed token exports**

Create `tokens.ts` only if it materially helps component tests and prevents string drift.

- [ ] **Step 5: Re-run the focused UI token test**

Run: `pnpm -C packages/ui test -- primitives.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the token foundation**

Run:

```bash
git add packages/ui/src/foundation.css packages/ui/src/tokens.ts packages/ui/src/primitives/primitives.test.tsx
git commit -m "feat(ui): add EPIC-02 semantic foundation tokens"
```

## Task 3: Build Shared Primitives

**Files:**

- Create: `packages/ui/src/primitives/button.tsx`
- Create: `packages/ui/src/primitives/icon-button.tsx`
- Create: `packages/ui/src/primitives/panel.tsx`
- Create: `packages/ui/src/primitives/field.tsx`
- Create: `packages/ui/src/primitives/tabs.tsx`
- Create: `packages/ui/src/primitives/dialog.tsx`
- Create: `packages/ui/src/primitives/bottom-sheet.tsx`
- Create: `packages/ui/src/primitives/status.tsx`
- Create: `packages/ui/src/primitives/primitives.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write failing tests for button, tabs, field, and dialog states**

Cover minimum approved states:

- default
- hover-safe class presence where applicable
- selected
- disabled
- loading
- error
- focus-visible semantics

- [ ] **Step 2: Run the focused primitive tests**

Run: `pnpm -C packages/ui test -- primitives.test.tsx`
Expected: FAIL because the primitives do not exist yet

- [ ] **Step 3: Implement the minimal primitive set**

Build only the primitives listed in the spec. Keep them presentation-focused and avoid feature logic.

- [ ] **Step 4: Export primitives from the UI package**

Update `packages/ui/src/index.ts` so `apps/web` can consume them without deep imports.

- [ ] **Step 5: Re-run the primitive tests**

Run: `pnpm -C packages/ui test -- primitives.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the primitive layer**

Run:

```bash
git add packages/ui/src/primitives packages/ui/src/index.ts
git commit -m "feat(ui): add EPIC-02 shell primitives"
```

## Task 4: Build Generic Responsive Shell Navigation

**Files:**

- Create: `packages/ui/src/shell/app-shell.tsx`
- Create: `packages/ui/src/navigation/top-nav.tsx`
- Create: `packages/ui/src/navigation/bottom-nav.tsx`
- Create: `packages/ui/src/navigation/navigation.test.tsx`
- Modify: `packages/ui/src/app-frame.tsx`
- Modify: `packages/ui/src/app-frame.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write failing shell/navigation tests**

Cover:

- desktop top-nav rendering
- mobile bottom-nav rendering
- selected/active states
- keyboard focus
- shell region landmarks
- no bottom-nav / top-nav coexistence after desktop takeover

- [ ] **Step 2: Run the focused shell tests**

Run: `pnpm -C packages/ui test -- navigation.test.tsx app-frame.test.tsx`
Expected: FAIL because the responsive shell components do not exist yet

- [ ] **Step 3: Replace the minimal frame with a real generic app shell**

Implement a shell that supports:

- mobile-first layout
- desktop top navigation
- safe content container
- non-game page composition

Do not implement `DesktopGameLayout` here.

Explicitly forbidden in this task:

- gameplay-only left player/status column
- gameplay-only right dice/action/chat column
- any component whose only purpose is future live-match orchestration

- [ ] **Step 4: Re-run shell/navigation tests**

Run: `pnpm -C packages/ui test -- navigation.test.tsx app-frame.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the generic shell**

Run:

```bash
git add packages/ui/src/shell packages/ui/src/navigation packages/ui/src/app-frame.tsx packages/ui/src/app-frame.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add responsive app shell navigation"
```

## Task 5: Add Web Shell Routes and Safe Placeholders

**Files:**

- Create: `apps/web/src/shell/routes.tsx`
- Create: `apps/web/src/shell/placeholder-page.tsx`
- Create: `apps/web/src/shell/shell-layout.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write failing route/shell tests**

Cover:

- authenticated home placeholder
- rooms placeholder
- chat placeholder
- collection placeholder
- profile placeholder
- shell navigation state
- placeholders remain feature-empty and layout-only
- non-game placeholders do not render gameplay-only three-column topology

- [ ] **Step 2: Run the focused shell-layout tests**

Run: `pnpm -C apps/web test -- shell-layout.test.tsx`
Expected: FAIL because route-aware placeholders do not exist yet

- [ ] **Step 3: Implement route-safe placeholder composition**

Build page placeholders that demonstrate only shell/layout behavior. Do not add fake history lists, fake matchmaking flows, fake gameplay, or fake profile features.

Allowed placeholder content only:

- page title
- short shell-safe explanatory copy
- inert layout scaffolding needed for spacing and navigation QA
- presentation primitives without feature behavior

- [ ] **Step 4: Integrate the generic `AppShell` into `app.tsx`**

Authenticated UI should move into the new shell without changing auth behavior.

- [ ] **Step 5: Re-run the shell-layout tests**

Run: `pnpm -C apps/web test -- shell-layout.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the placeholder shell surfaces**

Run:

```bash
git add apps/web/src/shell apps/web/src/app.tsx apps/web/src/styles.css
git commit -m "feat(web): add EPIC-02 shell placeholder routes"
```

## Task 6: Migrate the Auth Shell Without Changing Auth Semantics

**Files:**

- Modify: `apps/web/src/auth/auth-shell.tsx`
- Modify: `apps/web/src/auth/auth-shell.test.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Inspect: `apps/web/src/auth/bootstrap.ts`
- Inspect: `apps/web/src/auth/api.ts`

- [ ] **Step 1: Extend the auth-shell tests to cover all required presentation states**

Cover:

- bootstrapping
- authenticating
- authenticated
- development chooser
- unauthenticated browser fallback
- recoverable error
- logout return path
- `/api/me`-first bootstrap remains intact
- Telegram-versus-browser branching remains intact
- development-auth gating remains intact

- [ ] **Step 2: Run the focused auth-shell tests**

Run: `pnpm -C apps/web test -- auth-shell.test.tsx app.test.tsx`
Expected: FAIL because the new shell presentation and state coverage are not in place yet

- [ ] **Step 3: Restyle and restructure `AuthShell` into the approved design system**

Keep:

- `/api/me`-first bootstrap
- Telegram/browser branching
- dev chooser semantics
- logout behavior
- post-logout bootstrap behavior

Change:

- typography
- panel hierarchy
- action placement
- responsive presentation

- [ ] **Step 4: Re-run auth-shell tests**

Run: `pnpm -C apps/web test -- auth-shell.test.tsx app.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the auth migration**

Run:

```bash
git add apps/web/src/auth/auth-shell.tsx apps/web/src/auth/auth-shell.test.tsx apps/web/src/app.test.tsx
git commit -m "feat(web): migrate auth shell to EPIC-02 design system"
```

## Task 7: Optional Development-Only UI Showcase

**Files:**

- Create: `apps/web/src/dev/ui-showcase.tsx`
- Create: `apps/web/src/dev/ui-showcase.test.tsx`
- Modify: `apps/web/src/shell/routes.tsx`
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: Decide whether the showcase is necessary**

If the shell and primitives can be verified cleanly without a showcase, skip this task and note the decision in the final EPIC-02 report.

- [ ] **Step 2: If needed, write failing tests for dev-only routing**

Cover:

- route exists in development
- route is absent from production navigation
- route renders primitives only

- [ ] **Step 3: Run the focused dev-showcase tests**

Run: `pnpm -C apps/web test -- ui-showcase.test.tsx`
Expected: FAIL before implementation

- [ ] **Step 4: Implement the minimal development-only showcase**

It must expose primitives for visual QA only and must not become a fake product hub.

- [ ] **Step 5: Re-run showcase tests**

Run: `pnpm -C apps/web test -- ui-showcase.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the dev-only showcase if implemented**

Run:

```bash
git add apps/web/src/dev apps/web/src/shell/routes.tsx apps/web/src/app.tsx
git commit -m "feat(web): add dev-only UI showcase"
```

## Task 8: Update the Concise Canonical Design-System Contract

**Files:**

- Modify: `docs/DESIGN_SYSTEM.md`
- Inspect: `docs/superpowers/specs/2026-08-20-epic-02-design-system.md`

- [ ] **Step 1: Rewrite `docs/DESIGN_SYSTEM.md` as the concise contract**

Keep it shorter than the full spec. It should summarize the approved token system, shell model, board-at-rest rule, reference priority, and QA gates.

- [ ] **Step 2: Run a documentation diff sanity check**

Run: `git diff -- docs/DESIGN_SYSTEM.md`
Expected: concise contract update only

- [ ] **Step 3: Commit the design-system contract refresh**

Run:

```bash
git add docs/DESIGN_SYSTEM.md
git commit -m "docs: refresh canonical design system contract"
```

## Task 9: Run Verification and Produce Visual Evidence

**Files:**

- Create: `artifacts/visual-qa/epic-02/README.md`
- Create: `artifacts/visual-qa/epic-02/390x844.png`
- Create: `artifacts/visual-qa/epic-02/430x932.png`
- Create: `artifacts/visual-qa/epic-02/1024x768.png`
- Create: `artifacts/visual-qa/epic-02/1440x900.png`
- Create: `artifacts/visual-qa/epic-02/1920x1080.png`

- [ ] **Step 1: Run package and app tests**

Run:

```bash
pnpm -C packages/ui test
pnpm -C apps/web test
```

Expected: PASS

- [ ] **Step 2: Run workspace validation**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git diff --stat 52e7852
```

Expected: PASS

- [ ] **Step 3: Start the web app locally and capture screenshots**

Use the approved QA viewports:

- `390x844`
- `430x932`
- `1024x768`
- `1440x900`
- `1920x1080`

Compare:

- mobile viewports against `references/ui/MASTER_MOBILE.png`
- desktop viewports against `references/ui/MASTER_DESKTOP.png`
- `1024x768` against both masters for transition sanity

- [ ] **Step 4: Record deviations and fix major issues**

Do not close the epic while major issues remain in:

- hierarchy
- board dominance on board-facing placeholders
- non-board content dominance on non-board placeholders
- navigation composition
- spacing
- graphite / wood / gold balance

- [ ] **Step 5: Write the evidence manifest**

Document:

- reference used
- deviations found
- fixes made
- final assessment

- [ ] **Step 6: Commit the verification evidence**

Run:

```bash
git add artifacts/visual-qa/epic-02
git commit -m "test: verify EPIC-02 design system"
```

## Final Verification Checklist

Before reporting EPIC-02 complete during future execution, the implementing agent must freshly run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

and the focused EPIC-02 visual-QA capture flow.

## Execution Notes

- Future implementation should happen in a new isolated worktree created after explicit approval to execute EPIC-02.
- Do not let `DesktopGameLayout` leak into the generic desktop shell primitives.
- Do not let non-board placeholder pages borrow the gameplay-specific three-column layout unless a page is intentionally board-facing.
- Preserve all EPIC-01 security and auth semantics.
