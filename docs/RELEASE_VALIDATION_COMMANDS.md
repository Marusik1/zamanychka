# Release validation commands

Run from the repository root before production release.

## 1. Start local infrastructure

```powershell
docker compose up -d postgres postgres_test redis
docker ps
```

Required containers/ports:

- PostgreSQL app DB: `127.0.0.1:5432`
- PostgreSQL test DB: `127.0.0.1:5433`
- Redis: `127.0.0.1:6379`

## 2. Apply test database migrations

```powershell
$env:DATABASE_URL='postgresql://zamanushka:zamanushka_local@127.0.0.1:5433/zamanushka_test'
pnpm -C apps/api exec prisma migrate deploy --config prisma.config.ts
```

## 3. Run PostgreSQL + Redis API integration

```powershell
$env:TEST_DATABASE_URL='postgresql://zamanushka:zamanushka_local@127.0.0.1:5433/zamanushka_test'
$env:DATABASE_URL='postgresql://zamanushka:zamanushka_local@127.0.0.1:5432/zamanushka'
$env:REDIS_URL='redis://127.0.0.1:6379'
pnpm -C apps/api test
pnpm -C apps/api test:integration
```

Expected result:

```text
Test Files 31 passed
Tests 223 passed
```

## 4. Run full release gate

```powershell
pnpm -C packages/shared test
pnpm -C packages/shared typecheck
pnpm -C packages/shared build

pnpm -C packages/game-engine test
pnpm -C packages/game-engine typecheck
pnpm -C packages/game-engine build

pnpm -C apps/api typecheck
pnpm -C apps/api build

pnpm -C apps/web test
pnpm -C apps/web typecheck
pnpm -C apps/web build

git diff --check
```

## 5. Production fingerprint check after deploy

Open:

```text
https://<frontend-domain>/health/version
```

Then in browser console:

```js
window.__ZAMANUSHKA_BUILD__
```

`releaseId` must match between API and frontend. `buildId/gitSha/builtAt` must not be
`local-docker`, `unknown`, or `unknown`.
