# EPIC-01 authentication verification evidence

Captured on 2026-08-20 from the development-only browser fallback at
`http://127.0.0.1:5174`, backed by the API at `http://127.0.0.1:3101`. Each capture shows the
stable authenticated `Player One` state after chooser selection, logout, and a second login.
The smoke also asserted that the document width matched the viewport width and that no board or
canvas was present.

## Captures

| Viewport  | Evidence             |
| --------- | -------------------- |
| 390x844   | `auth-390x844.png`   |
| 430x932   | `auth-430x932.png`   |
| 1440x900  | `auth-1440x900.png`  |
| 1920x1080 | `auth-1920x1080.png` |

## Fresh verification

- `docker compose --env-file .env -f infra/docker-compose.yml up -d postgres redis postgres_test`
  and `docker compose ... ps`: PostgreSQL, isolated test PostgreSQL, and Redis healthy; no reset or
  volume deletion was performed.
- `pnpm prisma:generate` and `pnpm prisma:validate`: generated successfully; schema valid.
- Prisma `migrate deploy` with `prisma.config.ts` and guarded `prisma.test.config.ts`: two committed
  migrations applied/current in both databases.
- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`: passed.
- `pnpm test`: 16 test files passed and 138 tests passed (API 85, web 40, shared 12, UI 1; the
  intentionally empty game-engine package passed with no tests).
- `node --test scripts/epic-01-auth-smoke.test.mjs`: 6 smoke-contract tests passed, including exact
  replaced-session semantics and separation of Telegram and application IDs.
- `pnpm --filter @zamanushka/api test:integration`: 2 files and 18 tests passed.
- `pnpm build`: all workspace builds passed; Vite transformed 105 modules.
- `/health`: `200` with `status: ok`; `/ready`: `200` with PostgreSQL and Redis up.
- `pnpm smoke:auth -- --mode=development --base-url=http://127.0.0.1:3101
--origin=http://127.0.0.1:5174`: passed.
- Telegram-mode API on `127.0.0.1:3102` with a local fake smoke token matching
  `TELEGRAM_SMOKE_BOT_TOKEN`; `pnpm smoke:auth -- --mode=telegram ...`: passed.
- `pnpm smoke:production-guard`: passed.
- Browser smoke: development chooser, login, authenticated state, logout, re-login, overflow check,
  and four viewport captures passed. The in-app browser runtime was unavailable because required
  sandbox-policy metadata was absent, so repository-local Playwright Chromium was used as the
  documented fallback.

## Reference comparison and scope

Compared without modifying the canonical reference files:

- `references/photo_2026-08-17_21-22-39.jpg`
- `references/photo_2026-08-17_21-22-41.jpg`
- `references/photo_2026-08-17_21-22-42.jpg`
- `references/photo_2026-08-17_21-22-46.jpg`
- `references/photo_2026-08-17_21-22-47.jpg`
- `references/photo_2026-08-17_21-22-49.jpg`
- `references/ChatGPT Image 18 авг. 2026 г., 20_57_18.png`
- `references/ChatGPT Image 18 авг. 2026 г., 20_57_40.png`

The evidence preserves the references' restrained dark, premium foundation: near-black surfaces,
quiet gold accents, clear light typography, and generous negative space. The compact identity rows
and single outlined action keep hierarchy readable at both mobile sizes, while the separately
scaled desktop composition remains centered and deliberate at 1440 and 1920 widths. Spacing stays
stable, content remains inside safe viewport bounds, and no horizontal overflow appears.

This is intentionally the minimal EPIC-01 authentication shell. It does not reproduce the board,
pawns, gameplay, profile, navigation, or skin layouts visible in the product references; those are
outside this epic, and no EPIC-02 visual-system work is included.
