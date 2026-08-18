import { describe, expect, it } from 'vitest';

import { parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_TTL_SECONDS: '2592000',
  TELEGRAM_INIT_DATA_MAX_BYTES: '16384',
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '300',
  TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS: '30',
};
const users = JSON.stringify([
  { devUserKey: 'player-1', displayName: 'Player One' },
  { devUserKey: 'player-2', displayName: 'Player Two' },
]);
const env = (values: Record<string, string | undefined>) => ({ ...base, ...values });

describe('parseEnv auth matrix', () => {
  it.each([
    [
      'production Telegram',
      'production',
      'false',
      undefined,
      'https://zamanushka.example',
      'telegram',
      true,
    ],
    [
      'development dev-only',
      'development',
      'true',
      users,
      'http://127.0.0.1:5173',
      'development',
      false,
    ],
    [
      'development Telegram',
      'development',
      'false',
      undefined,
      'http://localhost:5173',
      'telegram',
      false,
    ],
    ['test dev-only', 'test', 'true', users, 'http://127.0.0.1:4173', 'development', false],
    ['test Telegram', 'test', 'false', undefined, 'http://localhost:4173', 'telegram', false],
  ])('normalizes %s', (_name, nodeEnv, flag, devUsers, origin, mode, secure) => {
    const result = parseEnv(
      env({
        NODE_ENV: nodeEnv,
        DEV_AUTH_ENABLED: flag,
        DEV_AUTH_USERS_JSON: devUsers,
        TELEGRAM_BOT_TOKEN: mode === 'telegram' ? 'token-placeholder' : undefined,
        APP_ORIGINS: origin,
      }),
    );
    expect(result.auth).toMatchObject({
      mode,
      allowedOrigins: [origin],
      cookie: {
        name: secure ? '__Host-zamanushka-session' : 'zamanushka-session',
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure,
      },
      sessionTtlSeconds: 2_592_000,
    });
    expect(result.auth.cookie).not.toHaveProperty('domain');
    if (result.auth.mode === 'telegram') {
      expect(result.auth).toMatchObject({
        botToken: 'token-placeholder',
        initDataMaxBytes: 16_384,
        initDataMaxAgeSeconds: 300,
        initDataFutureSkewSeconds: 30,
      });
    } else expect(result.auth.users).toHaveLength(2);
  });

  it('rejects production development auth and missing Telegram tokens', () => {
    expect(() =>
      parseEnv(
        env({
          NODE_ENV: 'production',
          DEV_AUTH_ENABLED: 'true',
          APP_ORIGINS: 'https://zamanushka.example',
          DEV_AUTH_USERS_JSON: users,
        }),
      ),
    ).toThrow(/DEV_AUTH_ENABLED/);
    for (const NODE_ENV of ['production', 'development', 'test']) {
      expect(() =>
        parseEnv(
          env({
            NODE_ENV,
            DEV_AUTH_ENABLED: 'false',
            APP_ORIGINS:
              NODE_ENV === 'production' ? 'https://zamanushka.example' : 'http://127.0.0.1:5173',
          }),
        ),
      ).toThrow(/TELEGRAM_BOT_TOKEN/);
    }
  });

  it('requires explicit test mode and origins', () => {
    expect(() => parseEnv(env({ NODE_ENV: 'test', APP_ORIGINS: 'http://127.0.0.1:5173' }))).toThrow(
      /DEV_AUTH_ENABLED/,
    );
    expect(() =>
      parseEnv(env({ NODE_ENV: 'test', DEV_AUTH_ENABLED: 'false', TELEGRAM_BOT_TOKEN: 'token' })),
    ).toThrow(/APP_ORIGINS/);
  });
});

describe('parseEnv dev users', () => {
  const dev = (value: string) =>
    env({
      NODE_ENV: 'development',
      DEV_AUTH_ENABLED: 'true',
      DEV_AUTH_USERS_JSON: value,
      APP_ORIGINS: 'http://127.0.0.1:5173',
    });

  it('requires two distinct strictly allowlisted users', () => {
    expect(() =>
      parseEnv(dev(JSON.stringify([{ devUserKey: 'one', displayName: 'One' }]))),
    ).toThrow();
    expect(() =>
      parseEnv(
        dev(
          JSON.stringify([
            { devUserKey: 'same', displayName: 'One' },
            { devUserKey: 'same', displayName: 'Two' },
          ]),
        ),
      ),
    ).toThrow(/distinct/i);
    expect(() =>
      parseEnv(
        dev(
          JSON.stringify([
            { devUserKey: 'one', displayName: 'One', telegramId: '1' },
            { devUserKey: 'two', displayName: 'Two' },
          ]),
        ),
      ),
    ).toThrow();
  });

  it('bounds the array and rejects malformed JSON', () => {
    const many = Array.from({ length: 17 }, (_, i) => ({
      devUserKey: `p-${i}`,
      displayName: `Player ${i}`,
    }));
    expect(() => parseEnv(dev(JSON.stringify(many)))).toThrow();
    expect(() => parseEnv(dev('{'))).toThrow(/DEV_AUTH_USERS_JSON/);
  });
});

describe('parseEnv origins', () => {
  const telegram = (origin: string, NODE_ENV = 'development') =>
    env({ NODE_ENV, DEV_AUTH_ENABLED: 'false', TELEGRAM_BOT_TOKEN: 'token', APP_ORIGINS: origin });

  it.each([
    '*',
    'null',
    'data:text/plain,hello',
    'http://user:pass@localhost:5173',
    'http://localhost:5173/path',
    'http://localhost:5173/?q=1',
    'http://localhost:5173/#x',
    'https://example.com/',
    'http://example.com',
  ])('rejects invalid local origin %s', (origin) => {
    expect(() => parseEnv(telegram(origin))).toThrow(/APP_ORIGINS/);
  });

  it('deduplicates canonical origins and requires HTTPS in production', () => {
    expect(
      parseEnv(telegram('http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5173')).auth
        .allowedOrigins,
    ).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
    expect(() => parseEnv(telegram('http://zamanushka.example', 'production'))).toThrow(
      /APP_ORIGINS/,
    );
    expect(
      parseEnv(telegram('https://zamanushka.example', 'production')).auth.allowedOrigins,
    ).toEqual(['https://zamanushka.example']);
  });
});

describe('parseEnv auth bounds', () => {
  const valid = telegramEnv();
  function telegramEnv() {
    return env({
      NODE_ENV: 'test',
      DEV_AUTH_ENABLED: 'false',
      TELEGRAM_BOT_TOKEN: 'token',
      APP_ORIGINS: 'http://127.0.0.1:4173',
    });
  }

  it.each([
    ['SESSION_TTL_SECONDS', '299'],
    ['SESSION_TTL_SECONDS', '31536001'],
    ['TELEGRAM_INIT_DATA_MAX_BYTES', '255'],
    ['TELEGRAM_INIT_DATA_MAX_BYTES', '65537'],
    ['TELEGRAM_INIT_DATA_MAX_AGE_SECONDS', '29'],
    ['TELEGRAM_INIT_DATA_MAX_AGE_SECONDS', '86401'],
    ['TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS', '-1'],
    ['TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS', '301'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => parseEnv({ ...valid, [key]: value })).toThrow(new RegExp(key));
  });

  it('rejects non-integer and non-numeric values', () => {
    expect(() => parseEnv({ ...valid, SESSION_TTL_SECONDS: '300.5' })).toThrow(
      /SESSION_TTL_SECONDS/,
    );
    expect(() => parseEnv({ ...valid, TELEGRAM_INIT_DATA_MAX_BYTES: 'large' })).toThrow(
      /TELEGRAM_INIT_DATA_MAX_BYTES/,
    );
  });
});
