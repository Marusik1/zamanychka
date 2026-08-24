import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import { registerRoomRoutes } from './routes.js';

const user = { id: 'user-1', displayName: 'User One', authProvider: 'DEVELOPMENT' as const };

function authService() {
  return {
    me: async (token?: string) => {
      if (!token) throw new Error('AUTH_REQUIRED');
      return { user };
    },
  } as any;
}

function roomService() {
  return {
    viewRoom: async () => ({
      roomId: 'single-room',
      version: 1,
      currentMatchId: null,
      participants: [],
      presence: [],
      participantViews: [],
    }),
    takeSeat: async (actorUserId: string, request: { seatIndex: 0 | 1 | 2 | 3 }) => ({
      ok: true as const,
      room: {
        roomId: 'single-room',
        version: 2,
        currentMatchId: null,
        participants: [{ userId: actorUserId, seatIndex: request.seatIndex, ready: false as const }],
      },
    }),
    leaveSeat: async () => ({
      ok: true as const,
      room: { roomId: 'single-room', version: 3, currentMatchId: null, participants: [] },
    }),
    setReady: async () => ({
      ok: true as const,
      room: {
        roomId: 'single-room',
        version: 4,
        currentMatchId: null,
        participants: [{ userId: user.id, seatIndex: 0 as const, ready: true as const }],
      },
    }),
    startMatch: async () => ({
      ok: true as const,
      room: { roomId: 'single-room', version: 5, currentMatchId: 'match-1', participants: [] },
      matchId: 'match-1',
    }),
    connectPresence: async () => ({
      roomId: 'single-room',
      version: 1,
      currentMatchId: null,
      participants: [{ userId: user.id, seatIndex: 0 as const, ready: true as const }],
      presence: [{ userId: user.id, connected: true }],
      participantViews: [{ userId: user.id, seatIndex: 0 as const, ready: true as const, connected: true }],
    }),
    disconnectPresence: async () => ({
      roomId: 'single-room',
      version: 1,
      currentMatchId: null,
      participants: [{ userId: user.id, seatIndex: 0 as const, ready: true as const }],
      presence: [{ userId: user.id, connected: false }],
      participantViews: [{ userId: user.id, seatIndex: 0 as const, ready: true as const, connected: false }],
    }),
  } as any;
}

describe('room routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  async function app(service: any = roomService()) {
    const instance = Fastify();
    apps.push(instance);
    await instance.register(cookie);
    registerRoomRoutes(instance, {
      service,
      auth: authService(),
    });
    return instance;
  }

  it('wires room lifecycle routes behind auth and rejects unknown room discovery endpoints', async () => {
    const instance = await app();
    expect((await instance.inject({ url: '/api/room', headers: { cookie: 'zamanushka-session=one' } })).statusCode).toBe(200);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/take-seat',
          headers: { cookie: 'zamanushka-session=one', 'content-type': 'application/json' },
          payload: { seatIndex: 0 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/leave-seat',
          headers: { cookie: 'zamanushka-session=one', 'content-type': 'application/json' },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/set-ready',
          headers: { cookie: 'zamanushka-session=one', 'content-type': 'application/json' },
          payload: { ready: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/start-match',
          headers: { cookie: 'zamanushka-session=one', 'content-type': 'application/json' },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/reconnect',
          headers: { cookie: 'zamanushka-session=one', 'content-type': 'application/json' },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect((await instance.inject('/api/rooms')).statusCode).toBe(404);
    expect((await instance.inject('/api/room/list')).statusCode).toBe(404);
    expect((await instance.inject('/api/room/invite')).statusCode).toBe(404);
  });

  it('returns stable conflict responses for seat and start-match failures', async () => {
    const failing = {
      ...roomService(),
      takeSeat: async () => ({ ok: false as const, error: { code: 'SEAT_TAKEN' as const, message: 'Seat is already taken' } }),
      startMatch: async () => ({
        ok: false as const,
        error: { code: 'ROOM_ALREADY_ACTIVE' as const, message: 'Room already has an active match' },
      }),
    };
    const instance = await app(failing);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/take-seat',
          headers: { cookie: 'zamanushka-session=one', 'content-type': 'application/json' },
          payload: { seatIndex: 0 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/start-match',
          headers: { cookie: 'zamanushka-session=one', 'content-type': 'application/json' },
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
  });

  it('fails closed for missing auth and malformed payloads', async () => {
    const instance = await app();
    expect((await instance.inject('/api/room')).statusCode).toBe(401);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/take-seat',
          headers: { 'content-type': 'application/json' },
          payload: { seatIndex: 0 },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/take-seat',
          headers: { cookie: 'zamanushka-session=one', 'content-type': 'application/json' },
          payload: { seatIndex: 9 },
        })
      ).statusCode,
    ).toBe(400);
  });
});
