import { describe, expect, it, vi } from 'vitest';

import { createProfileApi, ProfileApiError } from './api.js';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('profile API response validation', () => {
  it('passes AbortSignal through profile and history requests', async () => {
    const signal = new AbortController().signal;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, {
          user: {
            id: 'one',
            displayName: 'One',
            telegramUsername: 'one_user',
            avatarUrl: null,
          },
          stats: { gamesPlayed: 1, wins: 1, losses: 0, winRate: 1 },
          recentResults: [],
        }),
      )
      .mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    const api = createProfileApi(fetcher);

    await api.profile(signal);
    await api.history({}, signal);

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/profile', { credentials: 'include', signal });
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/profile/history', {
      credentials: 'include',
      signal,
    });
  });

  it('builds history query strings from canonical limit/cursor inputs', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(200, { items: [], nextCursor: 'next' }));
    const api = createProfileApi(fetcher);

    await api.history({ limit: 20, cursor: 'cursor-1' });

    expect(fetcher).toHaveBeenCalledWith('/api/profile/history?limit=20&cursor=cursor-1', {
      credentials: 'include',
    });
  });

  it('maps malformed responses to a non-leaky invalid-response error', async () => {
    const api = createProfileApi(
      vi.fn().mockResolvedValue(
        json(500, { error: { code: 'NOT_APPROVED', message: 'database password secret' } }),
      ),
    );

    const failure = await api.profile().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProfileApiError);
    expect(failure).toMatchObject({ status: 500, code: 'INVALID_RESPONSE' });
    expect(String(failure)).not.toContain('database password secret');
  });
});
