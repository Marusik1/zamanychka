import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import { CookieJar, parseCli, signTelegramInitData } from './epic-01-auth-smoke.mjs';

/* global URLSearchParams */

test('parseCli requires an explicit supported mode and accepts URL sources', () => {
  assert.deepEqual(parseCli(['--mode=development'], {}), {
    mode: 'development',
    baseUrl: 'http://127.0.0.1:3001',
    origin: 'http://127.0.0.1:3001',
  });
  assert.equal(
    parseCli(['--mode', 'telegram', '--base-url', 'http://localhost:4100/'], {}).baseUrl,
    'http://localhost:4100',
  );
  assert.equal(
    parseCli(['--mode=development'], { AUTH_SMOKE_BASE_URL: 'http://localhost:4200' }).baseUrl,
    'http://localhost:4200',
  );
  assert.throws(() => parseCli([], {}), /--mode/);
  assert.throws(() => parseCli(['--mode=other'], {}), /--mode/);
  assert.throws(() => parseCli(['--mode=development', '--base-url'], {}), /value/);
});

test('CookieJar applies multiple Set-Cookie headers, replacements, and deletion', () => {
  const jar = new CookieJar();
  jar.absorb({ getSetCookie: () => ['session=first; Path=/; HttpOnly', 'theme=dark; Path=/'] });
  assert.equal(jar.header(), 'session=first; theme=dark');
  jar.absorb({ getSetCookie: () => ['session=second; Path=/; HttpOnly'] });
  assert.equal(jar.header(), 'session=second; theme=dark');
  jar.absorb({ getSetCookie: () => ['session=; Max-Age=0; Path=/'] });
  assert.equal(jar.header(), 'theme=dark');
});

test('signTelegramInitData produces the Telegram WebApp HMAC over sorted fields', () => {
  const token = '123456:secret';
  const value = signTelegramInitData({
    botToken: token,
    authDate: 1_700_000_000,
    user: { id: 42, first_name: 'Ada' },
  });
  const params = new URLSearchParams(value);
  const hash = params.get('hash');
  params.delete('hash');
  const check = [...params]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${key}=${entry}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  assert.equal(hash, createHmac('sha256', secret).update(check).digest('hex'));
  assert.equal(params.get('query_id'), 'epic-01-smoke');
});
