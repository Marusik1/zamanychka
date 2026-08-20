import { describe, expect, it } from 'vitest';

import { createTestDatabase } from '../test/test-database.js';
import { buildApp } from '../app.js';
import { createAuthRepository } from './auth-repository.js';
import { createAuthService } from './auth-service.js';
import { verifyTelegramInitData } from './telegram-init-data.js';

const database = createTestDatabase();
const cookiePair = (header: string | string[] | undefined) =>
  (Array.isArray(header) ? header[0] : header)!.split(';')[0]!;
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
});
import { createHmac } from 'node:crypto';
