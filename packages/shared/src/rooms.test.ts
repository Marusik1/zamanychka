import { describe, expect, it } from 'vitest';
import {
  leaveSeatRequestSchema,
  roomCommandErrorCodeSchema,
  roomCommandResultSchema,
  roomParticipantStateSchema,
  roomParticipantViewSchema,
  roomPresenceProjectionSchema,
  roomReconnectRequestSchema,
  roomSeatIndexSchema,
  roomStateSchema,
  setReadyRequestSchema,
  startMatchRequestSchema,
  takeSeatRequestSchema,
} from './rooms.js';

describe('room contracts', () => {
  it('accepts the canonical single-room DTO shape', () => {
    const room = roomStateSchema.parse({
      roomId: 'room-1',
      version: 0,
      currentMatchId: null,
      participants: [
        { userId: 'u1', seatIndex: 0, ready: false },
        { userId: 'u2', seatIndex: 1, ready: true },
      ],
    });

    expect(room.currentMatchId).toBeNull();
    expect(room.participants).toHaveLength(2);
  });

  it('models seats, readiness, and connected presence separately', () => {
    expect(roomSeatIndexSchema.parse(3)).toBe(3);
    expect(roomParticipantStateSchema.parse({ userId: 'u1', seatIndex: 2, ready: true })).toEqual({
      userId: 'u1',
      seatIndex: 2,
      ready: true,
    });
    expect(
      roomParticipantViewSchema.parse({
        userId: 'u1',
        seatIndex: 2,
        ready: true,
        connected: false,
      }),
    ).toEqual({
      userId: 'u1',
      seatIndex: 2,
      ready: true,
      connected: false,
    });
    expect(roomPresenceProjectionSchema.parse({ userId: 'u1', connected: true })).toEqual({
      userId: 'u1',
      connected: true,
    });
  });

  it('accepts the room command contracts', () => {
    expect(takeSeatRequestSchema.parse({ seatIndex: 1 })).toEqual({ seatIndex: 1 });
    expect(leaveSeatRequestSchema.parse({})).toEqual({});
    expect(setReadyRequestSchema.parse({ ready: true })).toEqual({ ready: true });
    expect(startMatchRequestSchema.parse({})).toEqual({});
    expect(roomReconnectRequestSchema.parse({})).toEqual({});
  });

  it('keeps client control out of start-match contracts', () => {
    expect(() => startMatchRequestSchema.parse({ firstPlayerId: 'u1' })).toThrow();
    expect(() => startMatchRequestSchema.parse({ seatOrder: ['u1', 'u2'] })).toThrow();
  });

  it('exposes domain error/result discrimination', () => {
    expect(roomCommandErrorCodeSchema.options).toContain('ROOM_NOT_READY');
    expect(
      roomCommandResultSchema.parse({
        ok: false,
        error: { code: 'ROOM_NOT_READY', message: 'room is not ready' },
      }),
    ).toEqual({
      ok: false,
      error: { code: 'ROOM_NOT_READY', message: 'room is not ready' },
    });
  });
});
