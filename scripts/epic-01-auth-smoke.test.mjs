import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  CookieJar,
  assertAuthUser,
  assertInternalTelegramIdentity,
  assertReplacedSessionResponse,
  parseCli,
  signTelegramInitData,
} from './epic-01-auth-smoke.mjs';

/* global Response, URLSearchParams */

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
  for (const candidate of [
    'ftp://localhost:3001',
    'http://user:password@localhost:3001',
    'http://localhost:3001/api',
    'http://localhost:3001/?query=yes',
    'http://localhost:3001/#fragment',
  ]) {
    assert.throws(
      () => parseCli(['--mode=development', '--base-url', candidate], {}),
      /canonical HTTP\(S\) origin/,
    );
    assert.throws(
      () => parseCli(['--mode=development', '--origin', candidate], {}),
      /canonical HTTP\(S\) origin/,
    );
  }
});

test('auth user validation rejects a provider from the wrong server mode', () => {
  const telegramUser = {
    id: 'internal-id',
    displayName: 'Ada',
    authProvider: 'TELEGRAM',
  };
  assert.doesNotThrow(() => assertAuthUser(telegramUser, 'TELEGRAM'));
  assert.throws(() => assertAuthUser(telegramUser, 'DEVELOPMENT'), /authProvider/);
});

test('Telegram smoke requires an internal ID distinct from the external Telegram ID', () => {
  assert.doesNotThrow(() => assertInternalTelegramIdentity('internal-id', 9_000_000_001));
  assert.throws(() => assertInternalTelegramIdentity('9000000001', 9_000_000_001));
});

test('replaced-session smoke requires exactly 401 AUTH_REQUIRED', async () => {
  await assert.doesNotReject(() =>
    assertReplacedSessionResponse(
      new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Required' } }), {
        status: 401,
        headers: { 'cache-control': 'no-store' },
      }),
    ),
  );
  await assert.rejects(() =>
    assertReplacedSessionResponse(
      new Response(
        JSON.stringify({
          error: { code: 'AUTH_SESSION_REPLACED', message: 'Session replaced' },
        }),
        { status: 409, headers: { 'cache-control': 'no-store' } },
      ),
    ),
  );
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
