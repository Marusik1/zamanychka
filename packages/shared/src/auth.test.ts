import { describe, expect, it } from 'vitest';

import {
  authSessionViewSchema,
  authSuccessSchema,
  authUserSchema,
  devAuthCapabilitySchema,
  devAuthRequestSchema,
  meResponseSchema,
  logoutResponseSchema,
  publicErrorCodeSchema,
  publicErrorSchema,
  telegramAuthRequestSchema,
} from './auth.js';

const telegramUser = {
  id: 'user-1',
  displayName: 'Zara',
  username: 'zara',
  photoUrl: 'https://example.test/zara.png',
  languageCode: 'en',
  authProvider: 'TELEGRAM' as const,
};

describe('authentication request contracts', () => {
  it('accepts only raw Telegram init data', () => {
    expect(telegramAuthRequestSchema.parse({ initData: 'signed' })).toEqual({
      initData: 'signed',
    });
    expect(() =>
      telegramAuthRequestSchema.parse({ initData: 'signed', telegramId: '1' }),
    ).toThrow();
  });

  it('accepts only a development allowlist key', () => {
    expect(devAuthRequestSchema.parse({ devUserKey: 'player-one' })).toEqual({
      devUserKey: 'player-one',
    });
    expect(() =>
      devAuthRequestSchema.parse({ devUserKey: 'player-one', username: 'admin' }),
    ).toThrow();
  });
});

describe('authentication response contracts', () => {
  it('accepts an exact authentication success response', () => {
    const response = {
      user: telegramUser,
      session: { expiresAt: '2026-08-18T21:00:00+03:00' },
    };

    expect(authSuccessSchema.parse(response)).toEqual(response);
    expect(() => authSuccessSchema.parse({ ...response, token: 'secret' })).toThrow();
  });

  it('accepts an exact current-user response', () => {
    const response = { user: telegramUser };

    expect(meResponseSchema.parse(response)).toEqual(response);
    expect(() => meResponseSchema.parse({ ...response, sessionId: 'hidden' })).toThrow();
  });

  it('accepts only the exact logout acknowledgement', () => {
    expect(logoutResponseSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(() => logoutResponseSchema.parse({ ok: false })).toThrow();
    expect(() => logoutResponseSchema.parse({ ok: true, sessionId: 'hidden' })).toThrow();
  });

  it('requires RFC 3339 session expiry with an explicit offset', () => {
    expect(authSessionViewSchema.parse({ expiresAt: '2026-08-18T18:00:00Z' })).toEqual({
      expiresAt: '2026-08-18T18:00:00Z',
    });
    expect(() => authSessionViewSchema.parse({ expiresAt: '2026-08-18T18:00:00' })).toThrow();
  });

  it('omits optional user fields instead of accepting null', () => {
    const minimalUser = {
      id: 'user-2',
      displayName: 'Dev One',
      authProvider: 'DEVELOPMENT' as const,
    };

    expect(authUserSchema.parse(minimalUser)).toEqual(minimalUser);
    expect(() => authUserSchema.parse({ ...minimalUser, username: null })).toThrow();
    expect(() => authUserSchema.parse({ ...minimalUser, telegramId: '1' })).toThrow();
  });

  it('discriminates disabled and enabled development capability', () => {
    expect(devAuthCapabilitySchema.parse({ enabled: false, users: [] })).toEqual({
      enabled: false,
      users: [],
    });
    expect(() =>
      devAuthCapabilitySchema.parse({
        enabled: false,
        users: [{ devUserKey: 'player-one', displayName: 'Player One' }],
      }),
    ).toThrow();

    const enabled = {
      enabled: true as const,
      users: [{ devUserKey: 'player-one', displayName: 'Player One' }],
    };
    expect(devAuthCapabilitySchema.parse(enabled)).toEqual(enabled);
  });
});

describe('public error contract', () => {
  it('exposes only the approved stable error codes', () => {
    expect(publicErrorCodeSchema.options).toEqual([
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'TELEGRAM_AUTH_INVALID',
      'ORIGIN_NOT_ALLOWED',
      'NOT_FOUND',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'AUTH_SESSION_REPLACED',
    ]);
  });

  it('accepts a strict stable public error envelope', () => {
    const response = {
      error: { code: 'AUTH_SESSION_REPLACED' as const, message: 'Session replaced' },
    };

    expect(publicErrorSchema.parse(response)).toEqual(response);
    expect(() =>
      publicErrorSchema.parse({ ...response, details: { tokenHash: 'hidden' } }),
    ).toThrow();
    expect(() =>
      publicErrorSchema.parse({
        error: { ...response.error, stack: 'internal' },
      }),
    ).toThrow();
  });
});
