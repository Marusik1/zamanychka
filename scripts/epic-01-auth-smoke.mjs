#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/* global URL, URLSearchParams, fetch, process */

const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';

function option(args, name) {
  const exact = `--${name}`;
  const entry = args.find((value) => value.startsWith(`${exact}=`));
  if (entry) return entry.slice(exact.length + 1);
  const index = args.indexOf(exact);
  return index === -1 ? undefined : args[index + 1];
}

export function parseCli(args, env = process.env) {
  const allowed = new Set(['--mode', '--base-url', '--origin']);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index].split('=')[0];
    if (!allowed.has(key)) throw new Error(`Unknown option: ${key}`);
    if (!args[index].includes('=')) {
      if (args[index + 1] === undefined || args[index + 1].startsWith('--'))
        throw new Error(`${key} requires a value`);
      index += 1;
    }
  }
  const mode = option(args, 'mode');
  if (mode !== 'development' && mode !== 'telegram')
    throw new Error('--mode=development|telegram is required');
  const canonicalOrigin = (raw, label) => {
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`${label} must be a canonical HTTP(S) origin`);
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (raw !== url.origin && raw !== `${url.origin}/`)
    )
      throw new Error(`${label} must be a canonical HTTP(S) origin`);
    return url.origin;
  };
  const baseUrl = canonicalOrigin(
    option(args, 'base-url') ?? env.AUTH_SMOKE_BASE_URL ?? DEFAULT_BASE_URL,
    '--base-url',
  );
  const origin = canonicalOrigin(
    option(args, 'origin') ?? env.AUTH_SMOKE_ORIGIN ?? baseUrl,
    '--origin',
  );
  return {
    mode,
    baseUrl,
    origin,
  };
}

export class CookieJar {
  #cookies = new Map();

  absorb(headers) {
    const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    for (const value of values) {
      const [pair, ...attributes] = value.split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      const deleted =
        cookieValue === '' || attributes.some((part) => part.toLowerCase() === 'max-age=0');
      if (deleted) this.#cookies.delete(name);
      else this.#cookies.set(name, cookieValue);
    }
  }

  header() {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

export function signTelegramInitData({ botToken, authDate, user }) {
  const pairs = {
    auth_date: String(authDate),
    query_id: 'epic-01-smoke',
    user: JSON.stringify(user),
  };
  const check = Object.entries(pairs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...pairs, hash }).toString();
}

function assertNoStore(response) {
  assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*no-store\s*(?:,|$)/i);
}

export function assertInternalTelegramIdentity(internalId, telegramId) {
  assert.notEqual(internalId, String(telegramId), 'Telegram ID was exposed as application user.id');
}

export async function assertReplacedSessionResponse(response) {
  assert.equal(response.status, 401, `old session unexpectedly returned ${response.status}`);
  assertNoStore(response);
  const body = await response.json();
  assert.equal(body?.error?.code, 'AUTH_REQUIRED');
}

async function json(response, expectedStatus) {
  assert.equal(
    response.status,
    expectedStatus,
    `expected HTTP ${expectedStatus}, got ${response.status}`,
  );
  assertNoStore(response);
  const contentType = response.headers.get('content-type') ?? '';
  assert.match(contentType, /^application\/json\b/i);
  return response.json();
}

export function assertAuthUser(value, provider) {
  assert.equal(typeof value, 'object');
  assert.deepEqual(
    Object.keys(value).sort(),
    Object.keys(value)
      .filter((key) =>
        ['id', 'displayName', 'username', 'photoUrl', 'languageCode', 'authProvider'].includes(key),
      )
      .sort(),
    'user response contains an unknown field',
  );
  assert.equal(typeof value.id, 'string');
  assert.ok(value.id.length > 0);
  assert.equal(typeof value.displayName, 'string');
  assert.equal(value.authProvider, provider, 'authProvider must match the requested smoke mode');
  for (const optional of ['username', 'photoUrl', 'languageCode'])
    if (value[optional] !== undefined) assert.equal(typeof value[optional], 'string');
  for (const forbidden of ['telegramId', 'devUserKey', 'token', 'sessionToken'])
    assert.equal(Object.hasOwn(value, forbidden), false);
}

function headers(origin, jar) {
  const cookie = jar?.header();
  return {
    Origin: origin,
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

async function request(baseUrl, path, options = {}, jar) {
  const response = await fetch(new URL(path, `${baseUrl}/`), options);
  if (jar) jar.absorb(response.headers);
  return response;
}

async function me(baseUrl, jar, status, expectedProvider) {
  const body = await json(
    await request(baseUrl, '/api/me', { headers: jar.header() ? { Cookie: jar.header() } : {} }),
    status,
  );
  if (status === 200) {
    assert.deepEqual(Object.keys(body), ['user']);
    assertAuthUser(body.user, expectedProvider);
  } else {
    assert.deepEqual(body, {
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
    });
  }
  return body;
}

async function developmentSmoke(config) {
  const capability = await json(await request(config.baseUrl, '/api/auth/dev'), 200);
  assert.equal(capability.enabled, true, 'development auth capability is disabled');
  assert.ok(Array.isArray(capability.users) && capability.users.length >= 2, 'need two dev users');
  assert.deepEqual(Object.keys(capability).sort(), ['enabled', 'users']);
  for (const user of capability.users)
    assert.deepEqual(Object.keys(user).sort(), ['devUserKey', 'displayName']);
  const [firstConfig, secondConfig] = capability.users;
  assert.notEqual(firstConfig.devUserKey, secondConfig.devUserKey);
  const jars = [new CookieJar(), new CookieJar()];
  const login = async (entry, jar) => {
    const response = await request(
      config.baseUrl,
      '/api/auth/dev',
      {
        method: 'POST',
        headers: headers(config.origin, jar),
        body: JSON.stringify({ devUserKey: entry.devUserKey }),
      },
      jar,
    );
    const body = await json(response, 200);
    assertAuthUser(body.user, 'DEVELOPMENT');
    assert.deepEqual(Object.keys(body).sort(), ['session', 'user']);
    assert.deepEqual(Object.keys(body.session), ['expiresAt']);
    assert.equal(Number.isNaN(Date.parse(body.session.expiresAt)), false);
    assert.ok(jar.header(), 'login did not set a session cookie');
    return body.user;
  };
  const first = await login(firstConfig, jars[0]);
  const second = await login(secondConfig, jars[1]);
  assert.notEqual(first.id, second.id);
  assert.equal((await me(config.baseUrl, jars[0], 200, 'DEVELOPMENT')).user.id, first.id);
  assert.equal((await me(config.baseUrl, jars[1], 200, 'DEVELOPMENT')).user.id, second.id);
  const unknown = 'epic-01-smoke-unknown-user';
  const failure = await request(config.baseUrl, '/api/auth/dev', {
    method: 'POST',
    headers: headers(config.origin),
    body: JSON.stringify({ devUserKey: unknown }),
  });
  const failureText = await failure.text();
  assert.equal(failure.status, 400);
  assertNoStore(failure);
  assert.equal(failureText.includes(unknown), false, 'unknown key leaked in response');
  assert.equal(JSON.parse(failureText).error.code, 'VALIDATION_ERROR');
  const logout = await json(
    await request(
      config.baseUrl,
      '/api/auth/logout',
      { method: 'POST', headers: headers(config.origin, jars[0]), body: '{}' },
      jars[0],
    ),
    200,
  );
  assert.deepEqual(logout, { ok: true });
  await me(config.baseUrl, jars[0], 401, 'DEVELOPMENT');
  assert.equal((await me(config.baseUrl, jars[1], 200, 'DEVELOPMENT')).user.id, second.id);
}

async function telegramSmoke(config, env) {
  const botToken = env.TELEGRAM_SMOKE_BOT_TOKEN?.trim();
  if (!botToken) throw new Error('TELEGRAM_SMOKE_BOT_TOKEN is required in telegram mode');
  const telegramId = 9_000_000_001;
  const initData = signTelegramInitData({
    botToken,
    authDate: Math.floor(Date.now() / 1_000),
    user: { id: telegramId, first_name: 'EPIC-01', last_name: 'Smoke' },
  });
  const jar = new CookieJar();
  const login = () =>
    request(
      config.baseUrl,
      '/api/auth/telegram',
      {
        method: 'POST',
        headers: headers(config.origin, jar),
        body: JSON.stringify({ initData }),
      },
      jar,
    );
  const first = await json(await login(), 200);
  assertAuthUser(first.user, 'TELEGRAM');
  assertInternalTelegramIdentity(first.user.id, telegramId);
  assert.deepEqual(Object.keys(first).sort(), ['session', 'user']);
  assert.deepEqual(Object.keys(first.session), ['expiresAt']);
  const oldCookie = jar.header();
  assert.ok(oldCookie);
  assert.equal((await me(config.baseUrl, jar, 200, 'TELEGRAM')).user.id, first.user.id);
  const replacement = await json(await login(), 200);
  assertAuthUser(replacement.user, 'TELEGRAM');
  assert.equal(replacement.user.id, first.user.id);
  assert.notEqual(jar.header(), oldCookie, 'replacement did not rotate the session cookie');
  const oldResponse = await request(config.baseUrl, '/api/me', { headers: { Cookie: oldCookie } });
  await assertReplacedSessionResponse(oldResponse);
  const logout = await json(
    await request(
      config.baseUrl,
      '/api/auth/logout',
      { method: 'POST', headers: headers(config.origin, jar), body: '{}' },
      jar,
    ),
    200,
  );
  assert.deepEqual(logout, { ok: true });
  await me(config.baseUrl, jar, 401, 'TELEGRAM');
  const tampered = `${initData.slice(0, -1)}${initData.endsWith('0') ? '1' : '0'}`;
  const failure = await request(config.baseUrl, '/api/auth/telegram', {
    method: 'POST',
    headers: headers(config.origin),
    body: JSON.stringify({ initData: tampered }),
  });
  const failureText = await failure.text();
  assert.equal(failure.status, 401);
  assertNoStore(failure);
  assert.equal(failureText.includes(tampered), false, 'signed data leaked in response');
  assert.equal(failureText.includes(botToken), false, 'bot token leaked in response');
  assert.equal(JSON.parse(failureText).error.code, 'TELEGRAM_AUTH_INVALID');
}

export async function runAuthSmoke(args = process.argv.slice(2), env = process.env) {
  const config = parseCli(args, env);
  if (config.mode === 'development') await developmentSmoke(config);
  else await telegramSmoke(config, env);
  process.stdout.write(`EPIC-01 ${config.mode} auth smoke passed\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAuthSmoke().catch((error) => {
    process.stderr.write(`EPIC-01 auth smoke failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
