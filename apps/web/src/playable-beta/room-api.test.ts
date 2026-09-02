import { describe, expect, it, vi } from 'vitest';

import { createRoomApi } from './room-api.js';

const roomState = {
  id: 'room-1',
  code: 'ABCD',
  status: 'WAITING',
  version: 3,
  currentMatchId: null,
  members: [
    {
      userId: 'user-a',
      displayName: 'Анна',
      joinedAt: '2026-08-30T10:00:00.000Z',
    },
  ],
  seats: [
    { seatIndex: 0, userId: 'user-a', ready: true },
    { seatIndex: 1, userId: null, ready: false },
    { seatIndex: 2, userId: null, ready: false },
    { seatIndex: 3, userId: null, ready: false },
  ],
  counts: {
    memberCount: 1,
    seatedCount: 1,
    readyCount: 1,
  },
  currentUser: {
    isMember: true,
    seatIndex: 0,
    ready: true,
    canLeave: true,
    canStart: false,
    startBlockedReason: 'Нужно минимум 2 игрока.',
  },
} as const;

describe('playable beta room API', () => {
  it('loads the room list from the canonical multi-room route', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          rooms: [
            {
              id: 'room-1',
              code: 'ABCD',
              status: 'WAITING',
              currentMatchId: null,
              counts: { memberCount: 1, seatedCount: 1, readyCount: 1 },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(createRoomApi(fetcher).listRooms()).resolves.toEqual({
      currentMembershipRoom: null,
      rooms: [
        {
          id: 'room-1',
          code: 'ABCD',
          status: 'WAITING',
          currentMatchId: null,
          counts: { memberCount: 1, seatedCount: 1, readyCount: 1 },
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith('/api/rooms', expect.objectContaining({ credentials: 'include' }));
  });

  it('loads one canonical room state from the room-scoped route', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(roomState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(createRoomApi(fetcher).getRoom('room-1')).resolves.toEqual(roomState);
    expect(fetcher).toHaveBeenCalledWith('/api/rooms/room-1', expect.objectContaining({ credentials: 'include' }));
  });

  it('accepts canonical wrapped create-room success and canonical reconnect room state', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, room: roomState }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(roomState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const api = createRoomApi(fetcher);

    await expect(api.createRoom()).resolves.toEqual({ ok: true, room: roomState });
    await expect(api.reconnect('room-1')).resolves.toEqual(roomState);
  });

  it('posts expectedRoomVersion to room-scoped mutations and start-match', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, room: roomState }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, room: roomState, matchId: 'match-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const api = createRoomApi(fetcher);

    await expect(api.takeSeat('room-1', 2, 3)).resolves.toEqual({ ok: true, room: roomState });
    await expect(api.startMatch('room-1', 3)).resolves.toEqual({
      ok: true,
      room: roomState,
      matchId: 'match-1',
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      '/api/rooms/room-1/seats/2',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ seatIndex: 2, expectedRoomVersion: 3 }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/rooms/room-1/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedRoomVersion: 3 }),
      }),
    );
  });

  it('returns the committed chat message directly from POST without a follow-up history request', async () => {
    const message = {
      id: 'message-1',
      roomId: 'room-1',
      userId: 'user-a',
      displayName: 'Анна',
      text: 'Готова',
      createdAt: '2026-08-31T12:00:00.000Z',
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, message }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(createRoomApi(fetcher).sendChat('room-1', 'Готова')).resolves.toEqual(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/rooms/room-1/chat',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Готова' }) }),
    );
  });
});
