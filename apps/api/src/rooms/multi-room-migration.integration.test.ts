import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;

const ROOT = process.cwd();
const APPS_API_ROOT = join(ROOT);
const PRISMA_BINARY = join(ROOT, 'node_modules', '.bin', 'prisma.cmd');
const SOURCE_PRISMA_DIR = join(APPS_API_ROOT, 'prisma');
const SOURCE_MIGRATIONS_DIR = join(SOURCE_PRISMA_DIR, 'migrations');
const TEMP_DB_NAME = 'zamanushka_migration_test';
const LAST_LEGACY_MIGRATION = '20260829223000_add_match_room_key_index';
const NEW_MIGRATION = '20260830120000_add_multi_room_membership';

function baseTestUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL is required');
  const parsed = new URL(value);
  if (parsed.hostname !== '127.0.0.1') throw new Error('Migration test requires host 127.0.0.1');
  if (parsed.port !== '5433') throw new Error('Migration test requires port 5433');
  if (!parsed.pathname.slice(1).endsWith('_test'))
    throw new Error('Migration test requires a TEST_DATABASE_URL ending in _test');
  return parsed;
}

function tempDatabaseUrl() {
  const parsed = baseTestUrl();
  parsed.pathname = `/${TEMP_DB_NAME}`;
  return parsed.toString();
}

async function recreateTempDatabase() {
  if (!TEMP_DB_NAME.endsWith('_test')) {
    throw new Error('Refusing migration test database recreation');
  }

  const source = baseTestUrl();
  const admin = new Client({
    host: source.hostname,
    port: Number(source.port),
    user: decodeURIComponent(source.username),
    password: decodeURIComponent(source.password),
    database: 'postgres',
  });

  await admin.connect();
  try {
    await admin.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [TEMP_DB_NAME],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${TEMP_DB_NAME}"`);
    await admin.query(`CREATE DATABASE "${TEMP_DB_NAME}"`);
  } finally {
    await admin.end();
  }
}

function createPrismaFixture(includeNewMigration: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'zamanushka-multi-room-migration-'));
  const prismaDir = join(root, 'prisma');
  const migrationsDir = join(prismaDir, 'migrations');
  mkdirSync(migrationsDir, { recursive: true });

  cpSync(join(SOURCE_PRISMA_DIR, 'schema.prisma'), join(prismaDir, 'schema.prisma'));
  cpSync(join(APPS_API_ROOT, 'prisma.test.config.ts'), join(root, 'prisma.test.config.ts'));
  cpSync(join(SOURCE_MIGRATIONS_DIR, 'migration_lock.toml'), join(migrationsDir, 'migration_lock.toml'));

  const migrationDirectories = [
    '20260818204253_epic_01_auth',
    '20260819120000_add_auth_session_replaced_at',
    '20260824174500_add_single_room',
    '20260824190000_add_match',
    '20260824193000_drop_match_roomkey_unique',
    '20260825010000_add_match_realtime_persistence',
    '20260825020000_add_outbox_leases',
    '20260829021000_add_match_results',
    '20260829120000_add_rules_onboarding_seen_at',
    LAST_LEGACY_MIGRATION,
  ];

  for (const migration of migrationDirectories) {
    cpSync(
      join(SOURCE_MIGRATIONS_DIR, migration),
      join(migrationsDir, migration),
      { recursive: true },
    );
  }

  if (includeNewMigration) {
    cpSync(join(SOURCE_MIGRATIONS_DIR, NEW_MIGRATION), join(migrationsDir, NEW_MIGRATION), {
      recursive: true,
    });
  }

  return root;
}

function runPrismaCommand(
  fixtureRoot: string,
  args: readonly string[],
  databaseUrl = tempDatabaseUrl(),
) {
  return execFileSync('cmd.exe', ['/c', PRISMA_BINARY, ...args], {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      TEST_DATABASE_URL: databaseUrl,
    },
    encoding: 'utf8',
  });
}

async function withFixture<T>(includeNewMigration: boolean, run: (fixtureRoot: string) => Promise<T>) {
  const fixtureRoot = createPrismaFixture(includeNewMigration);
  try {
    return await run(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function connectTempDatabase() {
  const client = new Client({ connectionString: tempDatabaseUrl() });
  await client.connect();
  return client;
}

async function seedLegacyState() {
  const client = await connectTempDatabase();
  try {
    await client.query(`
      INSERT INTO "User" ("id", "firstName", "createdAt", "updatedAt")
      VALUES
        ('user-1', 'User 1', NOW(), NOW()),
        ('user-2', 'User 2', NOW(), NOW())
    `);

    await client.query(`
      INSERT INTO "Room" ("key", "version", "currentMatchId", "createdAt", "updatedAt")
      VALUES ('single-room', 7, NULL, NOW(), NOW())
    `);

    await client.query(`
      INSERT INTO "RoomSeat" ("roomKey", "seatIndex", "userId", "ready", "createdAt", "updatedAt")
      VALUES
        ('single-room', 0, 'user-1', TRUE, NOW(), NOW()),
        ('single-room', 1, 'user-2', FALSE, NOW(), NOW()),
        ('single-room', 2, NULL, FALSE, NOW(), NOW()),
        ('single-room', 3, NULL, FALSE, NOW(), NOW())
    `);

    const matchResult = await client.query(`
      INSERT INTO "Match" (
        "id", "roomKey", "firstPlayerId", "seatOrder", "snapshot",
        "status", "stateVersion", "lastSequence", "terminalResult",
        "finishedAt", "createdAt", "updatedAt"
      )
      VALUES (
        'match-legacy',
        'single-room',
        'user-1',
        '["user-1","user-2"]'::jsonb,
        '{"status":"FINISHED","winnerPlayerId":"user-1"}'::jsonb,
        'FINISHED',
        4,
        4,
        '{"winnerPlayerId":"user-1","reason":"HOME_DIAGONAL_COMPLETED"}'::jsonb,
        NOW(),
        NOW(),
        NOW()
      )
      RETURNING "id"
    `);

    await client.query(
      `UPDATE "Room" SET "currentMatchId" = $1, "updatedAt" = NOW() WHERE "key" = 'single-room'`,
      [matchResult.rows[0]?.id],
    );

    await client.query(`
      INSERT INTO "MatchResult" (
        "id", "matchId", "roomKey", "winnerUserId", "victoryReason",
        "startedAt", "finishedAt", "participantCount", "createdAt"
      )
      VALUES (
        'result-legacy',
        'match-legacy',
        'single-room',
        'user-1',
        'HOME_DIAGONAL_COMPLETED',
        NOW() - INTERVAL '5 minute',
        NOW(),
        2,
        NOW()
      )
    `);

    await client.query(`
      INSERT INTO "MatchParticipantResult" (
        "id", "matchResultId", "userId", "displayName", "color", "outcome", "createdAt"
      )
      VALUES
        ('mpr-1', 'result-legacy', 'user-1', 'User 1', 'RED', 'WIN', NOW()),
        ('mpr-2', 'result-legacy', 'user-2', 'User 2', 'YELLOW', 'LOSS', NOW())
    `);
  } finally {
    await client.end();
  }
}

async function seedCorruptLegacyState() {
  const client = await connectTempDatabase();
  try {
    await client.query(`
      INSERT INTO "Room" ("key", "version", "currentMatchId", "createdAt", "updatedAt")
      VALUES ('single-room', 0, NULL, NOW(), NOW())
    `);
    await client.query(`
      ALTER TABLE "RoomSeat" DROP CONSTRAINT "RoomSeat_userId_fkey"
    `);
    await client.query(`
      INSERT INTO "RoomSeat" ("roomKey", "seatIndex", "userId", "ready", "createdAt", "updatedAt")
      VALUES ('single-room', 0, 'missing-user', FALSE, NOW(), NOW())
    `);
  } finally {
    await client.end();
  }
}

describe('multi-room migration', () => {
  beforeEach(async () => {
    await recreateTempDatabase();
  });

  afterAll(async () => {
    await recreateTempDatabase();
  });

  it('backfills valid legacy occupants without ghosts and preserves match history', async () => {
    await withFixture(false, async (fixtureRoot) => {
      runPrismaCommand(fixtureRoot, ['migrate', 'deploy', '--config', 'prisma.test.config.ts']);
    });

    await seedLegacyState();

    await withFixture(true, async (fixtureRoot) => {
      runPrismaCommand(fixtureRoot, ['migrate', 'deploy', '--config', 'prisma.test.config.ts']);
      const secondDeploy = runPrismaCommand(fixtureRoot, [
        'migrate',
        'deploy',
        '--config',
        'prisma.test.config.ts',
      ]);
      expect(secondDeploy).toContain('No pending migrations to apply');
    });

    const client = await connectTempDatabase();
    try {
      const room = await client.query(`
        SELECT "key", "code", "status", "currentMatchId"
        FROM "Room"
        WHERE "key" = 'single-room'
      `);
      expect(room.rows[0]).toMatchObject({
        key: 'single-room',
        code: 'MAIN',
        status: 'ACTIVE',
        currentMatchId: 'match-legacy',
      });

      const memberships = await client.query(`
        SELECT "roomKey", "userId"
        FROM "RoomMembership"
        ORDER BY "userId" ASC
      `);
      expect(memberships.rows).toEqual([
        { roomKey: 'single-room', userId: 'user-1' },
        { roomKey: 'single-room', userId: 'user-2' },
      ]);

      const seats = await client.query(`
        SELECT "seatIndex", "userId", "ready"
        FROM "RoomSeat"
        WHERE "roomKey" = 'single-room'
        ORDER BY "seatIndex" ASC
      `);
      expect(seats.rows).toEqual([
        { seatIndex: 0, userId: 'user-1', ready: true },
        { seatIndex: 1, userId: 'user-2', ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ]);

      const match = await client.query(`
        SELECT m."id", m."roomKey", m."status", r."winnerUserId"
        FROM "Match" m
        LEFT JOIN "MatchResult" r ON r."matchId" = m."id"
        WHERE m."id" = 'match-legacy'
      `);
      expect(match.rows[0]).toMatchObject({
        id: 'match-legacy',
        roomKey: 'single-room',
        status: 'FINISHED',
        winnerUserId: 'user-1',
      });

      const participantResults = await client.query(`
        SELECT "userId", "outcome"
        FROM "MatchParticipantResult"
        WHERE "matchResultId" = 'result-legacy'
        ORDER BY "userId" ASC
      `);
      expect(participantResults.rows).toEqual([
        { userId: 'user-1', outcome: 'WIN' },
        { userId: 'user-2', outcome: 'LOSS' },
      ]);
    } finally {
      await client.end();
    }
  }, 60_000);

  it('fails loudly when legacy seat ownership cannot be backfilled safely', async () => {
    await withFixture(false, async (fixtureRoot) => {
      runPrismaCommand(fixtureRoot, ['migrate', 'deploy', '--config', 'prisma.test.config.ts']);
    });

    await seedCorruptLegacyState();

    await withFixture(true, async (fixtureRoot) => {
      expect(() =>
        runPrismaCommand(fixtureRoot, ['migrate', 'deploy', '--config', 'prisma.test.config.ts']),
      ).toThrow(/Cannot backfill RoomMembership: RoomSeat references a missing User/);
    });
  }, 60_000);
});
