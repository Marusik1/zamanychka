import { describe, expect, it, vi } from 'vitest';

import { AuthApiError, createAuthApi } from './api.js';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('authentication API response validation', () => {
  it('passes AbortSignal through every request, including JSON posts', async () => {
    const signal = new AbortController().signal;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, {
          user: { id: 'one', displayName: 'One', authProvider: 'DEVELOPMENT' },
          rulesOnboardingSeenAt: null,
        }),
      )
      .mockResolvedValueOnce(json(200, { enabled: false, users: [] }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const api = createAuthApi(fetcher);

    await api.me(signal);
    await api.developmentCapability(signal);
    await api.logout(signal);

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/me', { credentials: 'include', signal });
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/auth/dev', { credentials: 'include', signal });
    expect(fetcher).toHaveBeenNthCalledWith(3, '/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal,
    });
  });

  it('posts onboarding-seen as a current-user mutation without client identity', async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn().mockResolvedValue(
      json(200, { rulesOnboardingSeenAt: '2026-08-29T10:00:00.000Z' }),
    );
    const api = createAuthApi(fetcher);

    await api.markRulesOnboardingSeen(signal);

    expect(fetcher).toHaveBeenCalledWith('/api/me/rules-onboarding/seen', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal,
    });
  });

  it('preserves a validated stable public error code and message', async () => {
    const api = createAuthApi(
      vi.fn().mockResolvedValue(
        json(409, {
          error: { code: 'AUTH_SESSION_REPLACED', message: 'Session replaced' },
        }),
      ),
    );

    await expect(api.me()).rejects.toMatchObject({
      status: 409,
      code: 'AUTH_SESSION_REPLACED',
      message: 'Session replaced',
    });
  });

  it('maps malformed non-2xx bodies to a generic non-leaky invalid-response error', async () => {
    const api = createAuthApi(
      vi
        .fn()
        .mockResolvedValue(
          json(500, { error: { code: 'NOT_APPROVED', message: 'database password secret' } }),
        ),
    );

    const failure = await api.me().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AuthApiError);
    expect(failure).toMatchObject({ status: 500, code: 'INVALID_RESPONSE' });
    expect(String(failure)).not.toContain('database password secret');
    expect(JSON.stringify(failure)).not.toContain('database password secret');
  });

  it('rejects a malformed successful logout response generically', async () => {
    const api = createAuthApi(
      vi.fn().mockResolvedValue(json(200, { ok: false, sessionToken: 'secret' })),
    );

    const failure = await api.logout().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AuthApiError);
    expect(failure).toMatchObject({ status: 200, code: 'INVALID_RESPONSE' });
    expect(JSON.stringify(failure)).not.toContain('secret');
  });
});
