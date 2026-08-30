import { describe, expect, it, vi } from 'vitest';

import { createRoomApi } from './room-api.js';

describe('playable beta room API', () => {
  it('accepts one authoritative room response containing state, presence, and participant views', async () => {
    const payload = {
      roomId: 'single-room',
      version: 1,
      currentMatchId: null,
      participants: [{ userId: 'user-a', seatIndex: 0, ready: false }],
      presence: [{ userId: 'user-a', connected: true }],
      participantViews: [
        {
          userId: 'user-a',
          displayName: 'Анна',
          seatIndex: 0,
          ready: false,
          connected: true,
        },
      ],
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(createRoomApi(fetcher).view()).resolves.toEqual(payload);
  });
});
