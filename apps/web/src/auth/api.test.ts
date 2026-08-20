import { describe, expect, it, vi } from 'vitest';

import { AuthApiError, createAuthApi } from './api.js';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('authentication API response validation', () => {
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
