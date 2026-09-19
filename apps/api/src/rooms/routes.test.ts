import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {
  roomChatHistorySchema,
  roomCommandSuccessSchema,
  sendRoomChatMessageResponseSchema,
  roomStateSchema,
} from '@zamanushka/shared';

import type { AuthService } from '../auth/auth-service.js';
import type { RoomChatService } from './room-chat.js';
import type { RoomService } from './room-service.js';
import { registerRoomRoutes } from './routes.js';

const user = {
  id: 'user-1',
  displayName: 'User One',
  authProvider: 'DEVELOPMENT' as const,
};

const roomId = 'room-1';

function roomState(version = 1, overrides: Record<string, unknown> = {}) {
  return {
    id: roomId,
    code: 'ROOM01',
    status: 'WAITING' as const,
    version,
    currentMatchId: null,
    members: [
      {
        userId: user.id,
        displayName: user.displayName,
        joinedAt: '2026-08-30T10:00:00.000Z',
      },
    ],
    seats: [
      { seatIndex: 0 as const, userId: user.id, ready: false },
      { seatIndex: 1 as const, userId: null, ready: false },
      { seatIndex: 2 as const, userId: null, ready: false },
      { seatIndex: 3 as const, userId: null, ready: false },
    ],
    counts: {
      memberCount: 1,
      seatedCount: 1,
      readyCount: 0,
    },
    currentUser: {
      isMember: true,
      seatIndex: 0 as const,
      ready: false,
      canLeave: true,
      canStart: false,
      startBlockedReason: 'ROOM_NOT_READY',
    },
    ...overrides,
  };
}

function roomView(version = 1, overrides: Record<string, unknown> = {}) {
  return {
    ...roomState(version, overrides),
    presence: [{ userId: user.id, connected: true }],
  };
}

function authService() {
  return {
    me: async (token?: string) => {
      if (!token) throw new Error('AUTH_REQUIRED');
      return { user };
    },
  } as unknown as AuthService;
}

function roomService() {
  return {
    listRooms: vi.fn(async () => ({
      rooms: [
        {
          id: roomId,
          code: 'ROOM01',
          status: 'WAITING' as const,
          currentMatchId: null,
          counts: {
            memberCount: 1,
            seatedCount: 1,
            readyCount: 0,
          },
        },
      ],
    })),
    createRoom: vi.fn(async () => roomState()),
    getRoom: vi.fn(async () => roomView()),
    joinRoom: vi.fn(async () => ({ ok: true as const, room: roomState(2) })),
    takeSeat: vi.fn(async () => ({ ok: true as const, room: roomState(2) })),
    leaveSeat: vi.fn(async () => ({
      ok: true as const,
      room: roomState(3, {
        seats: [
          { seatIndex: 0 as const, userId: null, ready: false },
          { seatIndex: 1 as const, userId: null, ready: false },
          { seatIndex: 2 as const, userId: null, ready: false },
          { seatIndex: 3 as const, userId: null, ready: false },
        ],
      }),
    })),
    setReady: vi.fn(async () => ({
      ok: true as const,
      room: roomState(4, {
        seats: [
          { seatIndex: 0 as const, userId: user.id, ready: true },
          { seatIndex: 1 as const, userId: null, ready: false },
          { seatIndex: 2 as const, userId: null, ready: false },
          { seatIndex: 3 as const, userId: null, ready: false },
        ],
      }),
    })),
    leaveRoom: vi.fn(async () => ({ ok: true as const, room: roomState(5) })),
    startMatch: vi.fn(async () => ({
      ok: true as const,
      room: roomState(5, {
        status: 'ACTIVE',
        currentMatchId: 'match-1',
      }),
      matchId: 'match-1',
      status: 'ACTIVE' as const,
      stateVersion: 0,
      lastSequence: 0,
    })),
    connectPresence: vi.fn(async () => roomView()),
    disconnectPresence: vi.fn(async () => roomView()),
  } as unknown as RoomService;
}

function roomChatService() {
  return {
    list: vi.fn(async () => ({
      messages: [
        {
          id: 'msg-1',
          roomId,
          userId: user.id,
          displayName: user.displayName,
          text: 'Привет',
          createdAt: '2026-08-31T10:00:00.000Z',
        },
      ],
    })),
    send: vi.fn(async () => ({
      id: 'msg-2',
      roomId,
      userId: user.id,
      displayName: user.displayName,
      text: 'Готов играть',
      createdAt: '2026-08-31T10:01:00.000Z',
    })),
  } as unknown as RoomChatService;
}

describe('room routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((instance) => instance.close()));
  });

  async function app(service: RoomService = roomService(), chat: RoomChatService | undefined = roomChatService()) {
    const instance = Fastify();
    apps.push(instance);

    await instance.register(cookie);

    registerRoomRoutes(instance, {
      service,
      ...(chat ? { chat } : {}),
      auth: authService(),
      cookieName: 'zamanushka-session',
      allowedOrigins: ['http://localhost:3000', 'https://app.test'],
    });

    return instance;
  }

  const authHeaders = {
    cookie: 'zamanushka-session=one',
  };

  const mutationHeaders = {
    ...authHeaders,
    origin: 'http://localhost:3000',
    'content-type': 'application/json',
  };

  it('uses the configured session cookie when stale host-prefixed cookies also exist', async () => {
    const service = roomService();
    const auth = {
      me: vi.fn(async (token?: string) => {
        if (token === 'configured') return { user: { ...user, id: 'configured-user' } };
        if (token === 'stale') return { user: { ...user, id: 'stale-user' } };
        throw new Error('AUTH_REQUIRED');
      }),
    } as unknown as AuthService;
    const instance = Fastify();
    apps.push(instance);
    await instance.register(cookie);
    registerRoomRoutes(instance, {
      service,
      chat: roomChatService(),
      auth,
      cookieName: 'zamanushka-session',
      allowedOrigins: ['http://localhost:3000', 'https://app.test'],
    });

    await instance.inject({
      method: 'GET',
      url: '/api/rooms',
      headers: {
        cookie: '__Host-zamanushka-session=stale; zamanushka-session=configured',
      },
    });

    expect(auth.me).toHaveBeenCalledWith('configured');
    expect(service.listRooms).toHaveBeenCalledWith('configured-user');
  });

  it('wires the room-scoped lifecycle and leaves legacy singleton routes unavailable', async () => {
    const service = roomService();
    const instance = await app(service);

    expect(
      (
        await instance.inject({
          method: 'GET',
          url: '/api/rooms',
          headers: authHeaders,
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/rooms',
          headers: mutationHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'GET',
          url: `/api/rooms/${roomId}`,
          headers: authHeaders,
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/join`,
          headers: mutationHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/seats/0`,
          headers: mutationHeaders,
          payload: { expectedRoomVersion: 1 },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'DELETE',
          url: `/api/rooms/${roomId}/seat`,
          headers: mutationHeaders,
          payload: { expectedRoomVersion: 2 },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/ready`,
          headers: mutationHeaders,
          payload: { ready: true, expectedRoomVersion: 3 },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/start`,
          headers: mutationHeaders,
          payload: { expectedRoomVersion: 4 },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/reconnect`,
          headers: mutationHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/leave`,
          headers: mutationHeaders,
          payload: { expectedRoomVersion: 5 },
        })
      ).statusCode,
    ).toBe(200);

    expect(service.listRooms).toHaveBeenCalledWith(user.id);
    expect(service.createRoom).toHaveBeenCalledWith(user.id, {});
    expect(service.getRoom).toHaveBeenCalledWith(user.id, roomId);
    expect(service.joinRoom).toHaveBeenCalledWith(user.id, roomId, {});
    expect(service.takeSeat).toHaveBeenCalledWith(user.id, roomId, {
      seatIndex: 0,
      expectedRoomVersion: 1,
    });
    expect(service.leaveSeat).toHaveBeenCalledWith(user.id, roomId, {
      expectedRoomVersion: 2,
    });
    expect(service.setReady).toHaveBeenCalledWith(user.id, roomId, {
      ready: true,
      expectedRoomVersion: 3,
    });
    expect(service.startMatch).toHaveBeenCalledWith(user.id, roomId, {
      expectedRoomVersion: 4,
    });
    expect(service.connectPresence).toHaveBeenCalledWith(user.id, roomId);
    expect(service.leaveRoom).toHaveBeenCalledWith(user.id, roomId, {
      expectedRoomVersion: 5,
    });

    expect(
      (
        await instance.inject({
          method: 'GET',
          url: '/api/room',
          headers: authHeaders,
        })
      ).statusCode,
    ).toBe(404);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: '/api/room/take-seat',
          headers: mutationHeaders,
          payload: { seatIndex: 0 },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('returns canonical shared DTO shapes for create, get, and reconnect room responses', async () => {
    const service = roomService();
    const instance = await app(service);

    const createResponse = await instance.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: mutationHeaders,
      payload: {},
    });
    expect(createResponse.statusCode).toBe(200);
    expect(roomCommandSuccessSchema.safeParse(createResponse.json()).success).toBe(true);

    const getResponse = await instance.inject({
      method: 'GET',
      url: `/api/rooms/${roomId}`,
      headers: authHeaders,
    });
    expect(getResponse.statusCode).toBe(200);
    const getBody = getResponse.json();
    expect(roomStateSchema.safeParse(getBody).success).toBe(true);
    expect(getBody).not.toHaveProperty('presence');

    const reconnectResponse = await instance.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/reconnect`,
      headers: mutationHeaders,
      payload: {},
    });
    expect(reconnectResponse.statusCode).toBe(200);
    const reconnectBody = reconnectResponse.json();
    expect(roomStateSchema.safeParse(reconnectBody).success).toBe(true);
    expect(reconnectBody).not.toHaveProperty('presence');
  });

  it('returns canonical room chat history and send DTOs', async () => {
    const service = roomService();
    const chat = roomChatService();
    const instance = await app(service, chat);

    const historyResponse = await instance.inject({
      method: 'GET',
      url: `/api/rooms/${roomId}/chat`,
      headers: authHeaders,
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(roomChatHistorySchema.safeParse(historyResponse.json()).success).toBe(true);

    const sendResponse = await instance.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/chat`,
      headers: mutationHeaders,
      payload: { text: 'Готов играть' },
    });
    expect(sendResponse.statusCode).toBe(200);
    expect(sendRoomChatMessageResponseSchema.safeParse(sendResponse.json()).success).toBe(true);

    expect(chat.list).toHaveBeenCalledWith(user.id, roomId);
    expect(chat.send).toHaveBeenCalledWith(user.id, roomId, { text: 'Готов играть' });
  });

  it('returns canonical committed match metadata from start-match ACK', async () => {
    const service = roomService();
    const instance = await app(service);

    const response = await instance.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/start`,
      headers: mutationHeaders,
      payload: { expectedRoomVersion: 4 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      matchId: 'match-1',
      status: 'ACTIVE',
      stateVersion: 0,
      lastSequence: 0,
    });
  });

  it('maps room command errors to stable HTTP statuses', async () => {
    const service = {
      ...roomService(),
      takeSeat: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'SEAT_TAKEN' as const,
          message: 'Seat is already taken',
        },
      })),
      startMatch: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'ROOM_ALREADY_ACTIVE' as const,
          message: 'Room already has an active match',
        },
      })),
      leaveRoom: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'NOT_ROOM_MEMBER' as const,
          message: 'User is not a member of this room',
        },
      })),
      joinRoom: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'ROOM_NOT_FOUND' as const,
          message: 'Room is not available',
        },
      })),
    } as unknown as RoomService;

    const instance = await app(service);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/seats/0`,
          headers: mutationHeaders,
          payload: { expectedRoomVersion: 1 },
        })
      ).statusCode,
    ).toBe(409);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/start`,
          headers: mutationHeaders,
          payload: { expectedRoomVersion: 1 },
        })
      ).statusCode,
    ).toBe(409);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/leave`,
          headers: mutationHeaders,
          payload: { expectedRoomVersion: 1 },
        })
      ).statusCode,
    ).toBe(403);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/join`,
          headers: mutationHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  });

  it('maps room chat membership errors to stable HTTP statuses', async () => {
    const service = roomService();
    const chat = {
      list: vi.fn(async () => {
        throw new Error('NOT_ROOM_MEMBER');
      }),
      send: vi.fn(async () => {
        throw new Error('NOT_ROOM_MEMBER');
      }),
    } as unknown as RoomChatService;
    const instance = await app(service, chat);

    expect(
      (
        await instance.inject({
          method: 'GET',
          url: `/api/rooms/${roomId}/chat`,
          headers: authHeaders,
        })
      ).statusCode,
    ).toBe(403);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/chat`,
          headers: mutationHeaders,
          payload: { text: 'Привет' },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('fails closed for missing auth, disallowed origins, and malformed payloads', async () => {
    const instance = await app();

    expect((await instance.inject('/api/rooms')).statusCode).toBe(401);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/seats/0`,
          headers: {
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          payload: { expectedRoomVersion: 1 },
        })
      ).statusCode,
    ).toBe(401);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/seats/0`,
          headers: {
            ...authHeaders,
            origin: 'https://evil.example',
            'content-type': 'application/json',
          },
          payload: { expectedRoomVersion: 1 },
        })
      ).statusCode,
    ).toBe(403);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/seats/9`,
          headers: mutationHeaders,
          payload: { expectedRoomVersion: 1 },
        })
      ).statusCode,
    ).toBe(400);

    expect(
      (
        await instance.inject({
          method: 'POST',
          url: `/api/rooms/${roomId}/ready`,
          headers: mutationHeaders,
          payload: { ready: true },
        })
      ).statusCode,
    ).toBe(400);
  });
});
