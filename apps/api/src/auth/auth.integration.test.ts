import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAuthRepository } from './auth-repository.js';
import { hashSessionToken } from './session-token.js';
import { createPrismaClient } from '../infrastructure/prisma.js';
import { cleanTestDatabase, getGuardedTestDatabaseUrl } from '../test/test-database.js';

const prisma = createPrismaClient(getGuardedTestDatabaseUrl());
const repository = createAuthRepository(prisma);

describe('auth repository', () => {
  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma));
  afterAll(async () => prisma.$disconnect());

  it('upserts a Telegram profile while preserving its internal user id', async () => {
    const original = await repository.upsertTelegramUser({
      telegramId: 42n,
      username: 'before',
      firstName: 'Ada',
      lastName: 'Lovelace',
      languageCode: 'en',
      photoUrl: 'https://example.test/ada.png',
    });
    const refreshed = await repository.upsertTelegramUser({
      telegramId: 42n,
      username: 'after',
      firstName: 'Augusta',
    });

    expect(refreshed.id).toBe(original.id);
    expect(refreshed).toMatchObject({ telegramId: 42n, username: 'after', firstName: 'Augusta' });
  });

  it('creates distinct stable development users', async () => {
    const first = await repository.upsertDevelopmentUser({ devUserKey: 'one', displayName: 'One' });
    const second = await repository.upsertDevelopmentUser({
      devUserKey: 'two',
      displayName: 'Two',
    });
    const firstAgain = await repository.upsertDevelopmentUser({
      devUserKey: 'one',
      displayName: 'One Updated',
    });

    expect(first.id).not.toBe(second.id);
    expect(firstAgain.id).toBe(first.id);
    expect(firstAgain.firstName).toBe('One Updated');
  });

  it('persists only a token hash and resolves an active session', async () => {
    const user = await repository.upsertDevelopmentUser({ devUserKey: 'one', displayName: 'One' });
    const rawToken = 'raw-secret-token';
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');

    const created = await repository.createSession({
      userId: user.id,
      tokenHash,
      authMethod: 'DEVELOPMENT',
      expiresAt,
    });
    const stored = await prisma.authSession.findUniqueOrThrow({ where: { tokenHash } });
    const resolved = await repository.resolveActiveSession(tokenHash, new Date('2029-01-01'));

    expect(created).not.toHaveProperty('rawToken');
    expect(stored).not.toHaveProperty('rawToken');
    expect(JSON.stringify(stored)).not.toContain(rawToken);
    expect(resolved?.user.id).toBe(user.id);
  });

  it('does not resolve expired or revoked sessions', async () => {
    const user = await repository.upsertDevelopmentUser({ devUserKey: 'one', displayName: 'One' });
    await repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken('expired'),
      authMethod: 'DEVELOPMENT',
      expiresAt: new Date('2020-01-01'),
    });
    await repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken('revoked'),
      authMethod: 'DEVELOPMENT',
      expiresAt: new Date('2030-01-01'),
    });
    await repository.revokeSession(hashSessionToken('revoked'), new Date('2029-01-01'));

    expect(
      await repository.resolveActiveSession(hashSessionToken('expired'), new Date('2029-01-01')),
    ).toBeNull();
    expect(
      await repository.resolveActiveSession(hashSessionToken('revoked'), new Date('2029-01-01')),
    ).toBeNull();
  });

  it('keeps independent device sessions active', async () => {
    const user = await repository.upsertDevelopmentUser({ devUserKey: 'one', displayName: 'One' });
    const expiresAt = new Date('2030-01-01');
    await repository.createSession({
      userId: user.id,
      tokenHash: 'device-a',
      authMethod: 'DEVELOPMENT',
      expiresAt,
    });
    await repository.createSession({
      userId: user.id,
      tokenHash: 'device-b',
      authMethod: 'DEVELOPMENT',
      expiresAt,
    });

    expect(
      await repository.resolveActiveSession('device-a', new Date('2029-01-01')),
    ).not.toBeNull();
    expect(
      await repository.resolveActiveSession('device-b', new Date('2029-01-01')),
    ).not.toBeNull();
  });

  it('replaces a current session exactly once sequentially', async () => {
    const user = await repository.upsertDevelopmentUser({ devUserKey: 'one', displayName: 'One' });
    const expiresAt = new Date('2030-01-01');
    await repository.createSession({
      userId: user.id,
      tokenHash: 'old',
      authMethod: 'DEVELOPMENT',
      expiresAt,
    });

    const first = await repository.replaceSession({
      currentTokenHash: 'old',
      nextTokenHash: 'next',
      userId: user.id,
      authMethod: 'DEVELOPMENT',
      expiresAt,
      now: new Date('2029-01-01T00:00:00Z'),
    });
    const second = await repository.replaceSession({
      currentTokenHash: 'old',
      nextTokenHash: 'other',
      userId: user.id,
      authMethod: 'DEVELOPMENT',
      expiresAt,
      now: new Date('2029-01-01T00:00:01Z'),
    });

    expect(first.kind).toBe('replaced');
    expect(second.kind).toBe('not-replaceable');
    expect(await prisma.authSession.findUnique({ where: { tokenHash: 'other' } })).toBeNull();
  });

  it('treats an unknown current session as no current session', async () => {
    const user = await repository.upsertDevelopmentUser({ devUserKey: 'one', displayName: 'One' });
    const result = await repository.replaceSession({
      currentTokenHash: 'unknown',
      nextTokenHash: 'next',
      userId: user.id,
      authMethod: 'DEVELOPMENT',
      expiresAt: new Date('2030-01-01'),
      now: new Date('2029-01-01'),
    });

    expect(result).toEqual({ kind: 'no-current-session' });
    expect(await prisma.authSession.count()).toBe(0);
  });

  it('allows exactly one concurrent successor and reports the lock-race loser', async () => {
    const user = await repository.upsertDevelopmentUser({ devUserKey: 'one', displayName: 'One' });
    const expiresAt = new Date('2030-01-01');
    const now = new Date('2029-01-01');
    await repository.createSession({
      userId: user.id,
      tokenHash: 'old',
      authMethod: 'DEVELOPMENT',
      expiresAt,
    });

    const results = await Promise.all([
      repository.replaceSession({
        currentTokenHash: 'old',
        nextTokenHash: 'next-a',
        userId: user.id,
        authMethod: 'DEVELOPMENT',
        expiresAt,
        now,
      }),
      repository.replaceSession({
        currentTokenHash: 'old',
        nextTokenHash: 'next-b',
        userId: user.id,
        authMethod: 'DEVELOPMENT',
        expiresAt,
        now,
      }),
    ]);

    expect(results.map(({ kind }) => kind).sort()).toEqual(['replaced', 'replacement-conflict']);
    expect(
      await prisma.authSession.count({ where: { tokenHash: { in: ['next-a', 'next-b'] } } }),
    ).toBe(1);
  });
});
