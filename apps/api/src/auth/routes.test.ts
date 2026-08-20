import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import { registerAuthRoutes } from './routes.js';
import { AuthServiceError } from './auth-service.js';
import { parseEnv, type AuthRuntimeConfig } from '../config/env.js';

const result = {
  token: 'opaque',
  user: { id: 'u1', displayName: 'One', authProvider: 'DEVELOPMENT' as const },
  session: { expiresAt: '2020-01-01T00:10:00.000Z' },
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
  async function app(mode: 'development' | 'telegram', secure = false, injected = service) {
    return appWithConfig(
      {
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
        ...(mode === 'development'
          ? {
              users: [
                { devUserKey: 'one', displayName: 'One' },
                { devUserKey: 'two', displayName: 'Two' },
              ],
            }
          : {
              botToken: 'token',
              initDataMaxBytes: 16_384,
              initDataMaxAgeSeconds: 300,
              initDataFutureSkewSeconds: 30,
            }),
      } as AuthRuntimeConfig,
      injected,
    );
  }
  async function appWithConfig(config: AuthRuntimeConfig, injected = service) {
    const instance = Fastify();
    apps.push(instance);
    await instance.register(cookie);
    registerAuthRoutes(instance, {
      service: injected,
      mode: config.mode,
      allowedOrigins: config.allowedOrigins,
      cookie: config.cookie,
      sessionTtlSeconds: config.sessionTtlSeconds,
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
    expect(login.headers['set-cookie']).toContain('Max-Age=600');
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
    expect(logout.headers['set-cookie']).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(logout.headers['set-cookie']).toContain('Path=/');
    expect(logout.headers['set-cookie']).toContain('HttpOnly');
    expect(logout.headers['set-cookie']).toContain('SameSite=Lax');
    expect(logout.headers['set-cookie']).toContain('Secure');
    expect(logout.headers['set-cookie']).not.toContain('Domain');
  });

  const rows = [
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
  ];

  for (const row of rows) {
    it(`${row.name} independently exposes the exact route matrix`, async () => {
      const config = parseEnv({
        NODE_ENV: row.nodeEnv,
        DEV_AUTH_ENABLED: row.dev,
        DATABASE_URL: 'postgresql://u:p@localhost/db',
        REDIS_URL: 'redis://localhost:6379',
        APP_ORIGINS: row.origin,
        TELEGRAM_BOT_TOKEN: 'token',
        DEV_AUTH_USERS_JSON: JSON.stringify([
          { devUserKey: 'one', displayName: 'One' },
          { devUserKey: 'two', displayName: 'Two' },
        ]),
        SESSION_TTL_SECONDS: '600',
      }).auth;
      const instance = await appWithConfig(config);
      const headers = { origin: row.origin, 'content-type': 'application/json' };
      const capability = await instance.inject('/api/auth/dev');
      const dev = await instance.inject({
        method: 'POST',
        url: '/api/auth/dev',
        headers,
        payload: { devUserKey: 'one' },
      });
      const telegram = await instance.inject({
        method: 'POST',
        url: '/api/auth/telegram',
        headers,
        payload: { initData: 'signed' },
      });
      expect(capability.statusCode).toBe(200);
      expect(capability.headers['cache-control']).toBe('no-store');
      expect(dev.statusCode).toBe(config.mode === 'development' ? 200 : 404);
      expect(telegram.statusCode).toBe(config.mode === 'telegram' ? 200 : 404);
      expect(dev.headers['cache-control']).toBe('no-store');
      expect(telegram.headers['cache-control']).toBe('no-store');
    });
  }

  it('uses exact host-only local cookie scope and no-store for me and logout', async () => {
    const instance = await app('development');
    const login = await instance.inject({
      method: 'POST',
      url: '/api/auth/dev',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: { devUserKey: 'one' },
    });
    expect(login.headers['set-cookie']).toContain('zamanushka-session=opaque');
    expect(login.headers['set-cookie']).toContain('Max-Age=600');
    expect(login.headers['set-cookie']).toContain('Path=/');
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(login.headers['set-cookie']).toContain('SameSite=Lax');
    expect(login.headers['set-cookie']).not.toContain('Secure');
    expect(login.headers['set-cookie']).not.toContain('Domain');
    const me = await instance.inject({
      url: '/api/me',
      headers: { cookie: 'zamanushka-session=opaque' },
    });
    expect(me.statusCode).toBe(200);
    expect(me.headers['cache-control']).toBe('no-store');
    const logout = await instance.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
        cookie: 'zamanushka-session=opaque',
      },
      payload: {},
    });
    expect(logout.headers['cache-control']).toBe('no-store');
    expect(logout.headers['set-cookie']).toContain('zamanushka-session=');
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
    expect(logout.headers['set-cookie']).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(logout.headers['set-cookie']).toContain('Path=/');
    expect(logout.headers['set-cookie']).toContain('HttpOnly');
    expect(logout.headers['set-cookie']).toContain('SameSite=Lax');
    expect(logout.headers['set-cookie']).not.toContain('Secure');
    expect(logout.headers['set-cookie']).not.toContain('Domain');
  });

  it('maps replacement conflict to stable 409 without changing the cookie', async () => {
    const conflict = {
      ...service,
      loginDevelopment: async () => {
        throw new AuthServiceError('AUTH_SESSION_REPLACED');
      },
    };
    const instance = await app('development', false, conflict);
    const response = await instance.inject({
      method: 'POST',
      url: '/api/auth/dev',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: { devUserKey: 'one' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: 'AUTH_SESSION_REPLACED', message: 'Authentication session was replaced' },
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('maps auth and unknown errors without leaking details', async () => {
    const failing = {
      ...service,
      me: async () => {
        throw new Error('database password secret');
      },
    };
    const instance = await app('development', false, failing);
    const response = await instance.inject('/api/me');
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(response.body).not.toContain('secret');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects Telegram identity extras and maps invalid Telegram auth stably', async () => {
    const invalid = {
      ...service,
      loginTelegram: async () => {
        throw new AuthServiceError('TELEGRAM_AUTH_INVALID');
      },
    };
    const instance = await app('telegram', false, invalid);
    const headers = { origin: 'http://localhost:3000', 'content-type': 'application/json' };
    const extra = await instance.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      headers,
      payload: { initData: 'signed', telegramId: '42' },
    });
    expect(extra.statusCode).toBe(400);
    expect(extra.json().error.code).toBe('VALIDATION_ERROR');
    const response = await instance.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      headers,
      payload: { initData: 'bad' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'TELEGRAM_AUTH_INVALID', message: 'Telegram authentication failed' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('maps absent me credentials to the stable auth-required response', async () => {
    const unauthenticated = {
      ...service,
      me: async () => {
        throw new AuthServiceError('AUTH_REQUIRED');
      },
    };
    const instance = await app('development', false, unauthenticated);
    const response = await instance.inject('/api/me');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
