import { describe, expect, it, vi } from 'vitest';

import { createAuthApi } from './api.js';
import { bootstrapAuth } from './bootstrap.js';

const user = { id: 'user-internal-1', displayName: 'Мария', authProvider: 'TELEGRAM' as const };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('authentication bootstrap', () => {
  it('always requests /api/me first and does not reauthenticate a valid session', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(200, { user }));

    const state = await bootstrapAuth(createAuthApi(fetcher), 'signed-init-data');

    expect(state).toEqual({ status: 'AUTHENTICATED', user });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/me', { credentials: 'include' });
  });

  it('submits only raw Telegram initData after /api/me returns 401', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'AUTH_REQUIRED', message: 'Войдите' } }))
      .mockResolvedValueOnce(
        json(200, {
          user,
          session: { expiresAt: '2026-09-20T00:00:00.000Z' },
        }),
      );

    const state = await bootstrapAuth(createAuthApi(fetcher), 'query_id=secret&user=signed');

    expect(state.status).toBe('AUTHENTICATED');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/me', '/api/auth/telegram']);
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/auth/telegram', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: 'query_id=secret&user=signed' }),
    });
  });

  it('reports the explicit authenticating transition before Telegram login', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'AUTH_REQUIRED', message: 'Войдите' } }))
      .mockResolvedValueOnce(
        json(200, { user, session: { expiresAt: '2026-09-20T00:00:00.000Z' } }),
      );
    const transition = vi.fn();

    await bootstrapAuth(createAuthApi(fetcher), 'signed-init-data', transition);

    expect(transition).toHaveBeenCalledWith({ status: 'AUTHENTICATING' });
  });

  it('discovers development capability only after browser /api/me returns 401', async () => {
    const users = [
      { devUserKey: 'one', displayName: 'Игрок один' },
      { devUserKey: 'two', displayName: 'Игрок два' },
    ];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'AUTH_REQUIRED', message: 'Войдите' } }))
      .mockResolvedValueOnce(json(200, { enabled: true, users }));

    const state = await bootstrapAuth(createAuthApi(fetcher), undefined);

    expect(state).toEqual({ status: 'DEV_AUTH_REQUIRED', users });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/me', '/api/auth/dev']);
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/auth/dev', { credentials: 'include' });
  });

  it('shows a clear unavailable state when browser development auth is disabled', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'AUTH_REQUIRED', message: 'Войдите' } }))
      .mockResolvedValueOnce(json(200, { enabled: false, users: [] }));

    await expect(bootstrapAuth(createAuthApi(fetcher), undefined)).resolves.toEqual({
      status: 'ERROR',
      message: 'Вход доступен только внутри Telegram.',
      retryable: true,
    });
  });

  it('sends only the selected server-provided development key', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      json(200, {
        user: { ...user, authProvider: 'DEVELOPMENT' },
        session: { expiresAt: '2026-09-20T00:00:00.000Z' },
      }),
    );
    const api = createAuthApi(fetcher);

    await api.loginDevelopment('two');

    expect(fetcher).toHaveBeenCalledWith('/api/auth/dev', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ devUserKey: 'two' }),
    });
  });

  it('rejects malformed successful responses without exposing response content', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json(200, { user: { telegramId: '123', token: 'leak' } }));

    const state = await bootstrapAuth(createAuthApi(fetcher), undefined);

    expect(state.status).toBe('ERROR');
    expect(state.status === 'ERROR' && state.message).toBe(
      'Не удалось проверить вход. Попробуйте ещё раз.',
    );
    expect(JSON.stringify(state)).not.toContain('123');
    expect(JSON.stringify(state)).not.toContain('leak');
  });

  it('maps unexpected server errors to a non-leaky retryable error', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        json(500, { error: { code: 'INTERNAL_ERROR', message: 'Prisma postgres secret' } }),
      );

    const state = await bootstrapAuth(createAuthApi(fetcher), undefined);

    expect(state).toEqual({
      status: 'ERROR',
      message: 'Не удалось проверить вход. Попробуйте ещё раз.',
      retryable: true,
    });
  });
});
