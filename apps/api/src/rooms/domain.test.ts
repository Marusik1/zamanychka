import { describe, expect, it } from 'vitest';
import type { RoomWithPresence } from './domain.js';

describe('api room domain aliases', () => {
  it('supports membership without seat and exposes derived counts', () => {
    const room = {
      id: 'room-1',
      code: 'ABCD',
      status: 'WAITING',
      version: 0,
      currentMatchId: null,
      members: [{ userId: 'u1', displayName: 'User 1', joinedAt: '2026-08-30T00:00:00.000Z' }],
      seats: [
        { seatIndex: 0, userId: null, ready: false },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
      counts: { memberCount: 1, seatedCount: 0, readyCount: 0 },
      currentUser: {
        isMember: true,
        seatIndex: null,
        ready: false,
        canLeave: true,
        canStart: false,
        startBlockedReason: 'ROOM_NOT_READY',
      },
      presence: [{ userId: 'u1', connected: true }],
    } satisfies RoomWithPresence;

    expect(room.counts.memberCount).toBe(1);
    expect(room.counts.seatedCount).toBe(0);
    expect(room.presence[0]?.connected).toBe(true);
  });
});
