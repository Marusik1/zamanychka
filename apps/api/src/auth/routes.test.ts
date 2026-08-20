import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import { registerAuthRoutes } from './routes.js';

const result = {
  token: 'opaque',
  user: { id: 'u1', displayName: 'One', authProvider: 'DEVELOPMENT' as const },
  session: { expiresAt: '2029-01-01T00:10:00.000Z' },
};
const service = {
  capability: () => ({
    enabled: true as const,
    users: [{ devUserKey: 'one', displayName: 'One' }],
  }),
  loginDevelopment: async () => result,
  loginTelegram: async () => ({
    ...result,
    user: { ...result.user, authProvider: 'TELEGRAM' as const },
  }),
  me: async () => ({ user: result.user }),
  logout: async () => undefined,
};

describe('auth routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
  async function app(mode: 'development' | 'telegram', secure = false) {
    const instance = Fastify();
    apps.push(instance);
    await instance.register(cookie);
    registerAuthRoutes(instance, {
      service,
      mode,
      allowedOrigins: [secure ? 'https://app.test' : 'http://localhost:3000'],
      cookie: {
        name: secure ? '__Host-zamanushka-session' : 'zamanushka-session',
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure,
      },
      sessionTtlSeconds: 600,
    });
    return instance;
  }

  it('always exposes no-store dev capability and registers only the active login POST', async () => {
    const dev = await app('development');
    const telegram = await app('telegram');
    expect((await dev.inject('/api/auth/dev')).headers['cache-control']).toBe('no-store');
    expect((await telegram.inject('/api/auth/dev')).json()).toEqual({ enabled: false, users: [] });
    expect(
      (
        await dev.inject({
          method: 'POST',
          url: '/api/auth/telegram',
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
          payload: { initData: 'x' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await telegram.inject({
          method: 'POST',
          url: '/api/auth/dev',
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
          payload: { devUserKey: 'one' },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('fails closed for origin and content type and rejects identity extras', async () => {
    const instance = await app('development');
    for (const origin of [undefined, 'null', '%%%', 'http://evil.test'])
      expect(
        (
          await instance.inject({
            method: 'POST',
            url: '/api/auth/dev',
            headers: { ...(origin ? { origin } : {}), 'content-type': 'application/json' },
            payload: { devUserKey: 'one' },
          })
        ).statusCode,
      ).toBe(403);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/auth/dev',
          headers: { origin: 'http://localhost:3000' },
          payload: 'x',
        })
      ).statusCode,
    ).toBe(415);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/auth/dev',
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
          payload: { devUserKey: 'one', id: 'attacker' },
        })
      ).statusCode,
    ).toBe(400);
    const malformed = await instance.inject({
      method: 'POST',
      url: '/api/auth/dev',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: '{secret',
    });
    expect(malformed.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
    });
  });

  it('sets production cookie scope and clears the same scope on logout', async () => {
    const instance = await app('development', true);
    const login = await instance.inject({
      method: 'POST',
      url: '/api/auth/dev',
      headers: { origin: 'https://app.test', 'content-type': 'application/json' },
      payload: { devUserKey: 'one' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('__Host-zamanushka-session=opaque');
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(login.headers['set-cookie']).toContain('Secure');
    expect(login.headers['set-cookie']).not.toContain('Domain');
    const logout = await instance.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        origin: 'https://app.test',
        'content-type': 'application/json',
        cookie: '__Host-zamanushka-session=opaque',
      },
      payload: {},
    });
    expect(logout.headers['set-cookie']).toContain('__Host-zamanushka-session=');
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
  });
});
