import { describe, expect, it } from 'vitest';
import {
  createRoomRequestSchema,
  joinRoomRequestSchema,
  leaveRoomRequestSchema,
  leaveSeatRequestSchema,
  listRoomsResponseSchema,
  roomCommandErrorCodeSchema,
  roomCommandResultSchema,
  roomMemberSchema,
  roomSeatIndexSchema,
  roomSeatSchema,
  roomStateSchema,
  roomSummarySchema,
  setReadyRequestSchema,
  startMatchRequestSchema,
  takeSeatRequestSchema,
} from './rooms.js';

describe('room contracts', () => {
  it('accepts the canonical multi-room DTO shape', () => {
    const room = roomStateSchema.parse({
      id: 'room-1',
      code: 'ABCD',
      status: 'WAITING',
      version: 0,
      currentMatchId: null,
      members: [
        {
          userId: 'u1',
          displayName: 'User 1',
          joinedAt: '2026-08-30T09:00:00.000Z',
        },
        {
          userId: 'u2',
          displayName: 'User 2',
          joinedAt: '2026-08-30T09:01:00.000Z',
        },
      ],
      seats: [
        { seatIndex: 0, userId: 'u1', ready: true },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: 'u2', ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
      counts: {
        memberCount: 2,
        seatedCount: 2,
        readyCount: 1,
      },
      currentUser: {
        isMember: true,
        seatIndex: 0,
        ready: true,
        canLeave: true,
        canStart: false,
        startBlockedReason: 'ROOM_NOT_READY',
      },
    });

    expect(room.counts.memberCount).toBe(2);
    expect(room.currentUser.seatIndex).toBe(0);
  });

  it('models room members, seats, and counts separately', () => {
    expect(roomSeatIndexSchema.parse(3)).toBe(3);
    expect(
      roomMemberSchema.parse({
        userId: 'u1',
        displayName: 'User 1',
        joinedAt: '2026-08-30T09:00:00.000Z',
      }),
    ).toEqual({
      userId: 'u1',
      displayName: 'User 1',
      joinedAt: '2026-08-30T09:00:00.000Z',
    });
    expect(roomSeatSchema.parse({ seatIndex: 2, userId: 'u1', ready: true })).toEqual({
      seatIndex: 2,
      userId: 'u1',
      ready: true,
    });
    expect(
      roomSummarySchema.parse({
        id: 'room-1',
        code: 'ABCD',
        status: 'ACTIVE',
        currentMatchId: 'match-1',
        counts: {
          memberCount: 3,
          seatedCount: 2,
          readyCount: 2,
        },
      }),
    ).toEqual({
      id: 'room-1',
      code: 'ABCD',
      status: 'ACTIVE',
      currentMatchId: 'match-1',
      counts: {
        memberCount: 3,
        seatedCount: 2,
        readyCount: 2,
      },
    });
  });

  it('accepts room list and command contracts', () => {
    expect(
      listRoomsResponseSchema.parse({
        rooms: [
          {
            id: 'room-1',
            code: 'ABCD',
            status: 'WAITING',
            currentMatchId: null,
            counts: { memberCount: 1, seatedCount: 0, readyCount: 0 },
          },
        ],
      }),
    ).toEqual({
      rooms: [
        {
          id: 'room-1',
          code: 'ABCD',
          status: 'WAITING',
          currentMatchId: null,
          counts: { memberCount: 1, seatedCount: 0, readyCount: 0 },
        },
      ],
    });
    expect(createRoomRequestSchema.parse({})).toEqual({});
    expect(joinRoomRequestSchema.parse({})).toEqual({});
    expect(takeSeatRequestSchema.parse({ seatIndex: 1, expectedRoomVersion: 5 })).toEqual({
      seatIndex: 1,
      expectedRoomVersion: 5,
    });
    expect(leaveSeatRequestSchema.parse({ expectedRoomVersion: 5 })).toEqual({
      expectedRoomVersion: 5,
    });
    expect(leaveRoomRequestSchema.parse({ expectedRoomVersion: 5 })).toEqual({
      expectedRoomVersion: 5,
    });
    expect(setReadyRequestSchema.parse({ ready: true, expectedRoomVersion: 5 })).toEqual({
      ready: true,
      expectedRoomVersion: 5,
    });
    expect(startMatchRequestSchema.parse({ expectedRoomVersion: 5 })).toEqual({
      expectedRoomVersion: 5,
    });
  });

  it('keeps client control out of room and start-match contracts', () => {
    expect(() => createRoomRequestSchema.parse({ roomId: 'room-1' })).toThrow();
    expect(() => takeSeatRequestSchema.parse({ seatIndex: 1 })).toThrow();
    expect(() => joinRoomRequestSchema.parse({ userId: 'u1' })).toThrow();
    expect(() => startMatchRequestSchema.parse({ firstPlayerId: 'u1' })).toThrow();
    expect(() => startMatchRequestSchema.parse({ seatOrder: ['u1', 'u2'] })).toThrow();
  });

  it('exposes domain error/result discrimination for room-scoped lifecycle', () => {
    expect(roomCommandErrorCodeSchema.options).toContain('USER_ALREADY_IN_ANOTHER_ROOM');
    expect(roomCommandErrorCodeSchema.options).toContain('NOT_ROOM_MEMBER');
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
