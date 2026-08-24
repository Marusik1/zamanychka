import { describe, expect, it } from 'vitest';
import type { RoomWithPresence } from './domain.js';

describe('api room domain aliases', () => {
  it('supports the single-room shape without gameplay fields', () => {
    const room = {
      roomId: 'room-1',
      version: 0,
      currentMatchId: null,
      participants: [{ userId: 'u1', seatIndex: 0, ready: false }],
      presence: [{ userId: 'u1', connected: true }],
    } satisfies RoomWithPresence;

    expect(room.currentMatchId).toBeNull();
    expect(room.presence[0]?.connected).toBe(true);
  });
});
