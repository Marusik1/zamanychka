# Amvera beta deploy

Branch to deploy: `beta-demo-2026-08-29`

Build/start:

- build: `pnpm build`
- start: `pnpm start`

Migration command:

- `pnpm --filter @zamanushka/api exec prisma migrate deploy --config prisma.config.ts`

Required production env names:

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `APP_ORIGINS`
- `DEV_AUTH_ENABLED=false`
- `TELEGRAM_BOT_TOKEN`
- `SESSION_TTL_SECONDS`
- `TELEGRAM_INIT_DATA_MAX_BYTES`
- `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`
- `TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS`

Optional env names:

- `API_HOST`
- `API_PORT` (ignored when `PORT` is set)

Dev/test only:

- `DEV_AUTH_USERS_JSON`
- `TEST_DATABASE_URL`

Infra requirements:

- PostgreSQL required
- Redis required

Amvera deploy flow:

1. Deploy branch `beta-demo-2026-08-29`.
2. Set the production env names above.
3. Run migration command once against the production database.
4. Start the app with `pnpm start`.
5. Open the public HTTPS URL from Amvera.
6. Set that exact HTTPS origin in `APP_ORIGINS`.
7. Use the same HTTPS URL as the Telegram Mini App web app URL.

Post-deploy smoke:

1. Open the public HTTPS URL.
2. Confirm `/` renders the app shell.
3. Confirm `/health` returns 200.
4. Confirm `/ready` returns ready with PostgreSQL and Redis up.
5. Confirm Socket.IO connects on the same origin.
6. Open from Telegram Mini App.
7. Confirm Telegram auth succeeds.
8. Confirm room opens.
9. Confirm rules open.
10. Confirm chat opens.
11. Confirm profile opens.
