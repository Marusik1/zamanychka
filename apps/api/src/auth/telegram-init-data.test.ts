import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyTelegramInitData } from './telegram-init-data.js';

const BOT_TOKEN = '123456:deterministic-test-token';
const NOW_SECONDS = 1_800_000_000;
const NOW = new Date(NOW_SECONDS * 1_000);

const defaultUser = {
  id: 9_007_199_254_740_991,
  first_name: 'Ada',
  last_name: 'Lovelace',
  username: 'ada_l',
  language_code: 'en',
  photo_url: 'https://example.test/ada.png',
};

function encode(entries: ReadonlyArray<readonly [string, string]>): string {
  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function sign(entries: ReadonlyArray<readonly [string, string]>): string {
  const dataCheckString = [...entries]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return `${encode(entries)}&hash=${hash}`;
}

function validEntries(
  overrides: Partial<Record<'auth_date' | 'query_id' | 'signature' | 'user', string>> = {},
): Array<[string, string]> {
  return [
    ['auth_date', overrides.auth_date ?? String(NOW_SECONDS)],
    ['query_id', overrides.query_id ?? 'AAHdF6IQAAAAAN0XohDhrOrc'],
    ['user', overrides.user ?? JSON.stringify(defaultUser)],
    ...(overrides.signature === undefined
      ? []
      : ([['signature', overrides.signature]] as Array<[string, string]>)),
  ];
}

function verify(initData: string, maxBytes = 4096) {
  return verifyTelegramInitData(initData, {
    botToken: BOT_TOKEN,
    maxBytes,
    maxAgeSeconds: 300,
    futureSkewSeconds: 30,
    now: () => NOW,
  });
}

function expectInvalid(initData: string, maxBytes?: number): void {
  expect(verify(initData, maxBytes)).toEqual({
    ok: false,
    error: 'TELEGRAM_AUTH_INVALID',
  });
}

describe('verifyTelegramInitData', () => {
  it('verifies current signed data and extracts only supported user fields', () => {
    expect(verify(sign(validEntries()))).toEqual({
      ok: true,
      user: {
        id: '9007199254740991',
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada_l',
        languageCode: 'en',
        photoUrl: 'https://example.test/ada.png',
      },
    });
  });

  it.each(['user', 'auth_date', 'query_id'] as const)(
    'rejects a signed %s field changed after signing',
    (field) => {
      const initData = sign(validEntries()).replace(
        new RegExp(`(^|&)${field}=[^&]*`),
        `$1${field}=${encodeURIComponent('tampered')}`,
      );
      expectInvalid(initData);
    },
  );

  it.each(['A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64)])(
    'rejects a non-canonical hash: %s',
    (hash) => {
      expectInvalid(`${encode(validEntries())}&hash=${hash}`);
    },
  );

  it.each(['hash', 'auth_date', 'user', 'query_id'])('rejects duplicate key %s', (key) => {
    expectInvalid(`${sign(validEntries())}&${key}=duplicate`);
  });

  it.each(['%', '%2', '%ZZ', 'user=%E0%A4%A'])(
    'rejects malformed percent encoding: %s',
    (component) => {
      expectInvalid(`${sign(validEntries())}&${component}`);
    },
  );

  it.each(['hash', 'auth_date', 'user'])('rejects missing %s', (key) => {
    const entries = validEntries().filter(([entryKey]) => entryKey !== key);
    expectInvalid(key === 'hash' ? encode(entries) : sign(entries));
  });

  it('rejects empty and oversized input by UTF-8 byte length', () => {
    expectInvalid('');
    const initData = sign(validEntries({ query_id: '💣' }));
    expectInvalid(initData, Buffer.byteLength(initData) - 1);
  });

  it.each([NOW_SECONDS - 301, NOW_SECONDS + 31])(
    'rejects auth_date outside the freshness window: %s',
    (authDate) => {
      expectInvalid(sign(validEntries({ auth_date: String(authDate) })));
    },
  );

  it('rejects malformed signed user JSON', () => {
    expectInvalid(sign(validEntries({ user: '{' })));
  });

  it.each([9_007_199_254_740_992, 1.5, 0, -1])('rejects an invalid Telegram user id: %s', (id) => {
    expectInvalid(sign(validEntries({ user: JSON.stringify({ ...defaultUser, id }) })));
  });

  it('accepts documented and future signed user fields but strips them', () => {
    const user = {
      ...defaultUser,
      is_bot: false,
      is_premium: true,
      added_to_attachment_menu: true,
      allows_write_to_pm: true,
      future_telegram_field: { nested: true },
    };
    const result = verify(sign(validEntries({ user: JSON.stringify(user) })));

    expect(result).toEqual({
      ok: true,
      user: {
        id: '9007199254740991',
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada_l',
        languageCode: 'en',
        photoUrl: 'https://example.test/ada.png',
      },
    });
    expect(result.ok && result.user).not.toHaveProperty('future_telegram_field');
  });

  it('includes signature in the data-check string', () => {
    const initData = sign(validEntries({ signature: 'telegram-ed25519-signature' }));
    expect(verify(initData).ok).toBe(true);
    expectInvalid(initData.replace('telegram-ed25519-signature', 'changed-signature'));
  });

  it('sorts decoded keys with deterministic ordinal ordering', () => {
    expect(
      verify(
        sign([...validEntries(), ['z', 'last'], ['ä', 'after-ascii']] as Array<[string, string]>),
      ).ok,
    ).toBe(true);
  });
});
