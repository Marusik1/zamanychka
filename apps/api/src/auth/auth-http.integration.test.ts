import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';

import { describe, expect, it } from 'vitest';

import { createTestDatabase } from '../test/test-database.js';
import { buildApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createAuthRepository } from './auth-repository.js';
import { createAuthService } from './auth-service.js';
import { hashSessionToken } from './session-token.js';
import { verifyTelegramInitData } from './telegram-init-data.js';

const database = createTestDatabase();
const cookiePair = (header: string | string[] | undefined) => {
  const value = Array.isArray(header) ? header[0] : header;
  assert(value);
  const pair = value.split(';')[0];
  assert(pair);
  return pair;
};
function signedTelegram(botToken: string, authDate: number, user: object) {
  const pairs = { auth_date: String(authDate), query_id: 'stable', user: JSON.stringify(user) };
  const check = Object.entries(pairs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...pairs, hash }).toString();
}

describe('real auth HTTP', () => {
  it('keeps health available while auth is installed', async () => {
    await database.prisma.$connect();
    await database.clean();
    const service = createAuthService({
      repository: createAuthRepository(database.prisma),
      sessionTtlSeconds: 600,
      devUsers: [
        { devUserKey: 'one', displayName: 'One' },
        { devUserKey: 'two', displayName: 'Two' },
      ],
    });
    const app = buildApp({
      probes: [],
      auth: {
        service,
        config: {
          mode: 'development',
          users: [
            { devUserKey: 'one', displayName: 'One' },
            { devUserKey: 'two', displayName: 'Two' },
          ],
          allowedOrigins: ['http://localhost:3000'],
          cookie: {
            name: 'zamanushka-session',
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
          },
          sessionTtlSeconds: 600,
        },
      },
    });
    const response = await app.inject('/api/auth/dev');
    expect((await app.inject('/health')).statusCode).toBe(200);
    const readiness = await app.inject('/ready');
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({
      status: 'not_ready',
      dependencies: { postgres: 'down', redis: 'down' },
    });
    await app.close();
    await database.prisma.$disconnect();
    expect(response.statusCode).toBe(200);
  });

  it('authenticates two dev users, replaces one cookie, serves me, and logs out only current', async () => {
    await database.prisma.$connect();
    await database.clean();
    const users = [
      { devUserKey: 'one', displayName: 'One' },
      { devUserKey: 'two', displayName: 'Two' },
    ];
    const service = createAuthService({
      repository: createAuthRepository(database.prisma),
      sessionTtlSeconds: 600,
      devUsers: users,
    });
    const app = buildApp({
      probes: [],
      auth: {
        service,
        config: {
          mode: 'development',
          users,
          allowedOrigins: ['http://localhost:3000'],
          cookie: {
            name: 'zamanushka-session',
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
          },
          sessionTtlSeconds: 600,
        },
      },
    });
    const login = (devUserKey: string, cookie?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/dev',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        payload: { devUserKey },
      });
    const one = await login('one');
    const two = await login('two');
    const oneCookie = cookiePair(one.headers['set-cookie']);
    const twoCookie = cookiePair(two.headers['set-cookie']);
    expect(one.json().user.id).not.toBe(two.json().user.id);
    expect((await app.inject({ url: '/api/me', headers: { cookie: oneCookie } })).statusCode).toBe(
      200,
    );
    const replacement = await login('one', oneCookie);
    const replacementCookie = cookiePair(replacement.headers['set-cookie']);
    expect((await app.inject({ url: '/api/me', headers: { cookie: oneCookie } })).statusCode).toBe(
      401,
    );
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
        cookie: replacementCookie,
      },
      payload: {},
    });
    expect(
      (await app.inject({ url: '/api/me', headers: { cookie: replacementCookie } })).statusCode,
    ).toBe(401);
    expect((await app.inject({ url: '/api/me', headers: { cookie: twoCookie } })).statusCode).toBe(
      200,
    );
    await app.close();
    await database.prisma.$disconnect();
  });

  it('verifies signed Telegram init data and preserves the internal user id on upsert', async () => {
    await database.prisma.$connect();
    await database.clean();
    const botToken = '123456:test-token';
    const now = new Date('2029-01-01T00:00:00.000Z');
    const service = createAuthService({
      repository: createAuthRepository(database.prisma),
      now: () => now,
      sessionTtlSeconds: 600,
      verifyTelegram: (raw) =>
        verifyTelegramInitData(raw, {
          botToken,
          maxBytes: 16_384,
          maxAgeSeconds: 300,
          futureSkewSeconds: 30,
          now: () => now,
        }),
    });
    const app = buildApp({
      probes: [],
      auth: {
        service,
        config: {
          mode: 'telegram',
          botToken,
          allowedOrigins: ['http://localhost:3000'],
          cookie: {
            name: 'zamanushka-session',
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
          },
          sessionTtlSeconds: 600,
          initDataMaxBytes: 16_384,
          initDataMaxAgeSeconds: 300,
          initDataFutureSkewSeconds: 30,
        },
      },
    });
    const authenticate = (firstName: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/telegram',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        payload: {
          initData: signedTelegram(botToken, Math.floor(now.getTime() / 1_000), {
            id: 42,
            first_name: firstName,
          }),
        },
      });
    const first = await authenticate('Ada');
    const second = await authenticate('Augusta');
    expect(first.statusCode).toBe(200);
    expect(second.json().user.id).toBe(first.json().user.id);
    expect(second.json().user.displayName).toBe('Augusta');
    expect((await app.inject('/api/auth/dev')).json()).toEqual({ enabled: false, users: [] });
    await app.close();
    await database.prisma.$disconnect();
  });

  it('serializes concurrent HTTP replacement and keeps stored credentials hash-only', async () => {
    await database.prisma.$connect();
    await database.clean();
    const users = [
      { devUserKey: 'one', displayName: 'One' },
      { devUserKey: 'two', displayName: 'Two' },
    ];
    const repository = createAuthRepository(database.prisma);
    const service = createAuthService({ repository, sessionTtlSeconds: 600, devUsers: users });
    const app = buildApp({
      probes: [
        { name: 'postgres', check: async () => true },
        { name: 'redis', check: async () => true },
      ],
      auth: {
        service,
        config: {
          mode: 'development',
          users,
          allowedOrigins: ['http://localhost:3000'],
          cookie: {
            name: 'zamanushka-session',
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
          },
          sessionTtlSeconds: 600,
        },
      },
    });
    const login = (cookie?: string, key = 'one') =>
      app.inject({
        method: 'POST',
        url: '/api/auth/dev',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        payload: { devUserKey: key },
      });
    const initial = await login();
    const initialCookie = cookiePair(initial.headers['set-cookie']);
    const rawToken = initialCookie.split('=')[1];
    assert(rawToken);
    const stored = await database.prisma.authSession.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashSessionToken(rawToken));
    expect(JSON.stringify(stored)).not.toContain(rawToken);
    const replacements = await Promise.all([login(initialCookie), login(initialCookie)]);
    expect(replacements.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const loser = replacements.find((response) => response.statusCode === 409);
    assert(loser);
    expect(loser.headers['set-cookie']).toBeUndefined();
    expect(loser.json()).toEqual({
      error: { code: 'AUTH_SESSION_REPLACED', message: 'Authentication session was replaced' },
    });
    expect(await database.prisma.authSession.count()).toBe(2);
    expect(await database.prisma.authSession.count({ where: { revokedAt: null } })).toBe(1);
    const user = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'one' } });
    await repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken('expired'),
      authMethod: 'DEVELOPMENT',
      expiresAt: new Date(0),
    });
    await repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken('revoked'),
      authMethod: 'DEVELOPMENT',
      expiresAt: new Date('2100-01-01'),
    });
    await repository.revokeSession(hashSessionToken('revoked'), new Date());
    for (const cookie of [
      'zamanushka-session=unknown',
      'zamanushka-session=expired',
      'zamanushka-session=revoked',
    ]) {
      const response = await app.inject({ url: '/api/me', headers: { cookie } });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }
    const unknownKey = await login(undefined, 'not-allowed');
    expect(unknownKey.statusCode).toBe(400);
    expect(unknownKey.body).not.toContain('not-allowed');
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/ready')).statusCode).toBe(200);
    const missingOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/dev',
      headers: { 'content-type': 'application/json' },
      payload: { devUserKey: 'one' },
    });
    expect(missingOrigin.statusCode).toBe(403);
    const nonJson = await app.inject({
      method: 'POST',
      url: '/api/auth/dev',
      headers: { origin: 'http://localhost:3000', 'content-type': 'text/plain' },
      payload: 'secret',
    });
    expect(nonJson.statusCode).toBe(415);
    expect(nonJson.body).not.toContain('secret');
    await app.close();
    await database.prisma.$disconnect();
  });

  for (const row of [
    {
      name: 'production Telegram',
      nodeEnv: 'production',
      dev: 'false',
      origin: 'https://app.test',
    },
    {
      name: 'development dev-only',
      nodeEnv: 'development',
      dev: 'true',
      origin: 'http://localhost:3000',
    },
    {
      name: 'development Telegram',
      nodeEnv: 'development',
      dev: 'false',
      origin: 'http://localhost:3000',
    },
    { name: 'test dev-only', nodeEnv: 'test', dev: 'true', origin: 'http://localhost:3000' },
    { name: 'test Telegram', nodeEnv: 'test', dev: 'false', origin: 'http://localhost:3000' },
  ]) {
    it(`enforces the ${row.name} HTTP route matrix`, async () => {
      await database.prisma.$connect();
      await database.clean();
      const users = [
        { devUserKey: 'one', displayName: 'One' },
        { devUserKey: 'two', displayName: 'Two' },
      ];
      const botToken = '123456:matrix-token';
      const now = new Date('2029-01-01T00:00:00.000Z');
      const config = parseEnv({
        NODE_ENV: row.nodeEnv,
        DEV_AUTH_ENABLED: row.dev,
        DATABASE_URL: 'postgresql://u:p@localhost/db',
        REDIS_URL: 'redis://localhost:6379',
        APP_ORIGINS: row.origin,
        TELEGRAM_BOT_TOKEN: botToken,
        DEV_AUTH_USERS_JSON: JSON.stringify(users),
        SESSION_TTL_SECONDS: '600',
      }).auth;
      const service = createAuthService({
        repository: createAuthRepository(database.prisma),
        sessionTtlSeconds: 600,
        now: () => now,
        ...(config.mode === 'development'
          ? { devUsers: config.users }
          : {
              verifyTelegram: (raw: string) =>
                verifyTelegramInitData(raw, {
                  botToken: config.botToken,
                  maxBytes: config.initDataMaxBytes,
                  maxAgeSeconds: config.initDataMaxAgeSeconds,
                  futureSkewSeconds: config.initDataFutureSkewSeconds,
                  now: () => now,
                }),
            }),
      });
      const app = buildApp({ probes: [], auth: { service, config } });
      const headers = { origin: row.origin, 'content-type': 'application/json' };
      const dev = await app.inject({
        method: 'POST',
        url: '/api/auth/dev',
        headers,
        payload: { devUserKey: 'one' },
      });
      const telegram = await app.inject({
        method: 'POST',
        url: '/api/auth/telegram',
        headers,
        payload: {
          initData: signedTelegram(botToken, Math.floor(now.getTime() / 1000), {
            id: 42,
            first_name: 'Ada',
          }),
        },
      });
      expect(dev.statusCode).toBe(config.mode === 'development' ? 200 : 404);
      expect(telegram.statusCode).toBe(config.mode === 'telegram' ? 200 : 404);
      expect((await app.inject('/api/auth/dev')).json().enabled).toBe(
        config.mode === 'development',
      );
      await app.close();
      await database.prisma.$disconnect();
    });
  }
});
