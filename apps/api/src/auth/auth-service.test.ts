import { describe, expect, it } from 'vitest';

import { createAuthService, AuthServiceError, type AuthRepository } from './auth-service.js';

const now = new Date('2029-01-01T00:00:00.000Z');

function fixture() {
  interface FixtureUser {
    id: string;
    telegramId: bigint | null;
    devUserKey: string | null;
    firstName: string;
    username?: string;
    rulesOnboardingSeenAt?: Date | null;
  }
  interface FixtureSession {
    tokenHash?: string;
    authMethod: 'TELEGRAM' | 'DEVELOPMENT';
    expiresAt: Date;
    revokedAt: Date | null;
    replacedAt?: Date;
    user: FixtureUser;
  }
  const users = new Map<string, FixtureUser>();
  const sessions = new Map<string, FixtureSession>();
  const findUser = (id: string) => {
    const user = [...users.values()].find((candidate) => candidate.id === id);
    if (!user) throw new Error(`Missing fixture user ${id}`);
    return user;
  };
  const repository: AuthRepository = {
    async upsertTelegramUser(profile) {
      const user = users.get(`tg:${profile.telegramId}`) ?? {
        id: 'telegram-user',
        telegramId: profile.telegramId,
        devUserKey: null,
        firstName: profile.firstName,
        rulesOnboardingSeenAt: null,
      };
      Object.assign(user, profile, {
        telegramId: profile.telegramId,
        devUserKey: null,
      });
      users.set(`tg:${profile.telegramId}`, user);
      return user;
    },
    async upsertDevelopmentUser(profile) {
      const user = users.get(`dev:${profile.devUserKey}`) ?? {
        id: `user-${profile.devUserKey}`,
        telegramId: null,
        devUserKey: profile.devUserKey,
        firstName: profile.displayName,
        rulesOnboardingSeenAt: null,
      };
      Object.assign(user, {
        devUserKey: profile.devUserKey,
        telegramId: null,
        firstName: profile.displayName,
      });
      users.set(`dev:${profile.devUserKey}`, user);
      return user;
    },
    async createSession(input) {
      sessions.set(input.tokenHash, {
        ...input,
        revokedAt: null,
        user: findUser(input.userId),
      });
      return { id: input.tokenHash, expiresAt: input.expiresAt };
    },
    async replaceSession(input) {
      const old = sessions.get(input.currentTokenHash);
      if (!old) return { kind: 'no-current-session' } as const;
      if (old.replacedAt) return { kind: 'replacement-conflict' } as const;
      old.revokedAt = input.now;
      old.replacedAt = input.now;
      sessions.set(input.nextTokenHash, {
        ...input,
        tokenHash: input.nextTokenHash,
        revokedAt: null,
        user: findUser(input.userId),
      });
      return {
        kind: 'replaced',
        session: { id: input.nextTokenHash, expiresAt: input.expiresAt },
      } as const;
    },
    async resolveActiveSession(hash, at) {
      const s = sessions.get(hash);
      return s && !s.revokedAt && s.expiresAt > at ? s : null;
    },
    async revokeSession(hash, at) {
      const s = sessions.get(hash);
      if (s) s.revokedAt = at;
      return { count: s ? 1 : 0 };
    },
    async markRulesOnboardingSeen(userId, seenAt) {
      const user = findUser(userId);
      user.rulesOnboardingSeenAt ??= seenAt;
      return user.rulesOnboardingSeenAt;
    },
  };
  let token = 0;
  const service = createAuthService({
    repository,
    now: () => now,
    createToken: () => `token-${++token}`,
    sessionTtlSeconds: 600,
    verifyTelegram: () => ({ ok: true, user: { id: '42', firstName: 'Ada', username: 'ada' } }),
    devUsers: [
      { devUserKey: 'one', displayName: 'One' },
      { devUserKey: 'two', displayName: 'Two' },
    ],
  });
  return { service, sessions };
}

describe('auth service', () => {
  it('verifies Telegram, upserts identity, and issues a bounded session', async () => {
    const { service } = fixture();
    const result = await service.loginTelegram('signed');
    expect(result.user).toMatchObject({
      id: 'telegram-user',
      displayName: 'Ada',
      authProvider: 'TELEGRAM',
    });
    expect(result.session.expiresAt).toBe('2029-01-01T00:10:00.000Z');
  });

  it('resolves only allowlisted development identities', async () => {
    const { service } = fixture();
    await expect(service.loginDevelopment('missing')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect((await service.loginDevelopment('two')).user.authProvider).toBe('DEVELOPMENT');
  });

  it('replaces the current cookie once and reports conflicts', async () => {
    const { service } = fixture();
    const first = await service.loginDevelopment('one');
    await service.loginDevelopment('one', first.token);
    await expect(service.loginDevelopment('one', first.token)).rejects.toEqual(
      expect.any(AuthServiceError),
    );
    await expect(service.loginDevelopment('one', first.token)).rejects.toMatchObject({
      code: 'AUTH_SESSION_REPLACED',
    });
  });

  it('resolves me and logout from the opaque token only', async () => {
    const { service } = fixture();
    const login = await service.loginDevelopment('one');
    expect((await service.me(login.token)).user.id).toBe('user-one');
    await service.logout(login.token);
    await expect(service.me(login.token)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('marks rules onboarding seen idempotently for the authenticated user only', async () => {
    const { service } = fixture();
    const login = await service.loginDevelopment('one');

    const first = await service.markRulesOnboardingSeen(login.token);
    const second = await service.markRulesOnboardingSeen(login.token);

    expect(first.rulesOnboardingSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(second.rulesOnboardingSeenAt).toBe(first.rulesOnboardingSeenAt);
  });
});
