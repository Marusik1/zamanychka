import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  addBotToSeatRequestSchema,
  createRoomRequestSchema,
  deleteRoomRequestSchema,
  joinRoomRequestSchema,
  leaveRoomRequestSchema,
  leaveSeatRequestSchema,
  roomChatHistorySchema,
  roomReconnectRequestSchema,
  removeBotFromSeatRequestSchema,
  sendRoomChatMessageRequestSchema,
  setReadyRequestSchema,
  startMatchRequestSchema,
  takeSeatRequestSchema,
  type PublicErrorCode,
  type RoomCommandErrorCode,
} from '@zamanushka/shared';

import type { AuthService } from '../auth/auth-service.js';
import { isAllowedOrigin } from '../auth/origin-guard.js';
import type { RoomChatService } from './room-chat.js';
import type { RoomService } from './room-service.js';
import type { RoomView } from './room-service.js';

export interface RoomRoutesOptions {
  service: RoomService;
  chat?: RoomChatService;
  auth: AuthService;
  cookieName: string;
  allowedOrigins: string[];
}

const messages: Record<PublicErrorCode, string> = {
  VALIDATION_ERROR: 'Request validation failed',
  AUTH_REQUIRED: 'Authentication required',
  TELEGRAM_AUTH_INVALID: 'Telegram authentication failed',
  ORIGIN_NOT_ALLOWED: 'Origin is not allowed',
  NOT_FOUND: 'Not found',
  RATE_LIMITED: 'Too many requests',
  INTERNAL_ERROR: 'Internal server error',
  AUTH_SESSION_REPLACED: 'Authentication session was replaced',
};

const roomMessages: Record<RoomCommandErrorCode, string> = {
  ROOM_NOT_FOUND: 'Room is not available',
  ROOM_ALREADY_ACTIVE: 'Room already has an active match',
  ROOM_NOT_READY: 'Room is not ready',
  ROOM_FULL: 'Room is full',
  ROOM_CLOSED: 'Room is closed',
  SEAT_TAKEN: 'Seat is already taken',
  SEAT_NOT_OWNED: 'Seat is not owned by this participant',
  SEATED_PARTICIPANT_DISCONNECTED: 'Seated participant is disconnected',
  STALE_ROOM_VERSION: 'Room version is stale',
  NOT_ALLOWED: 'Operation is not allowed',
  NOT_ROOM_MEMBER: 'User is not a member of this room',
  USER_ALREADY_IN_ANOTHER_ROOM: 'User already belongs to another room',
};

function roomError(reply: FastifyReply, status: number, code: RoomCommandErrorCode) {
  return reply.code(status).send({ error: { code, message: roomMessages[code] } });
}

function publicError(reply: FastifyReply, status: number, code: PublicErrorCode) {
  return reply.code(status).send({ error: { code, message: messages[code] } });
}

function roomEntryTelemetryEnabled() {
  return process.env.ROOM_ENTRY_TELEMETRY === 'true';
}

function logRoomEntry(
  request: FastifyRequest,
  event:
    | 'room-reconnect-start'
    | 'room-reconnect-success'
    | 'room-reconnect-failed'
    | 'room-reconnect-origin-rejected'
    | 'room-reconnect-invalid-json'
    | 'room-reconnect-invalid-body'
    | 'room-reconnect-auth-required',
  payload: Record<string, unknown> = {},
) {
  if (!roomEntryTelemetryEnabled()) return;

  request.log.info(
    {
      scope: 'room-entry',
      event,
      method: request.method,
      url: request.url,
      origin: request.headers.origin ?? null,
      ...payload,
    },
    '[room-entry]',
  );
}

function requireOrigin(request: FastifyRequest, reply: FastifyReply, allowedOrigins: string[]) {
  if (!isAllowedOrigin(request.headers.origin, allowedOrigins)) {
    publicError(reply, 403, 'ORIGIN_NOT_ALLOWED');
    return false;
  }
  return true;
}

function requireJson(request: FastifyRequest, reply: FastifyReply) {
  if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() === 'application/json') {
    return true;
  }
  publicError(reply, 415, 'VALIDATION_ERROR');
  return false;
}

async function actorId(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: AuthService,
  cookieName: string,
) {
  try {
    const result = await auth.me(request.cookies[cookieName]);
    return result.user.id;
  } catch {
    publicError(reply, 401, 'AUTH_REQUIRED');
    return null;
  }
}

function roomStatus(code: RoomCommandErrorCode) {
  switch (code) {
    case 'ROOM_NOT_FOUND':
      return 404;
    case 'NOT_ALLOWED':
    case 'SEAT_NOT_OWNED':
    case 'NOT_ROOM_MEMBER':
      return 403;
    default:
      return 409;
  }
}

function mapRoomResult(
  reply: FastifyReply,
  result:
    | { ok: true }
    | {
        ok: false;
        error: {
          code: RoomCommandErrorCode;
        };
      },
) {
  if (result.ok) return reply.send(result);
  return roomError(reply, roomStatus(result.error.code), result.error.code);
}

function toRoomStateResponse(room: RoomView) {
  const { presence: _presence, ...roomState } = room;
  return roomState;
}

function isRoomNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === 'ROOM_NOT_FOUND';
}

export function registerRoomRoutes(app: FastifyInstance, options: RoomRoutesOptions) {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.get('/api/rooms', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;
    return reply.send(await options.service.listRooms(userId));
  });

  app.post('/api/rooms', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const parsed = createRoomRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return reply.send({ ok: true, room: await options.service.createRoom(userId, parsed.data) });
  });

  app.get('/api/rooms/:roomId', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);

    try {
      return reply.send(toRoomStateResponse(await options.service.getRoom(userId, roomId)));
    } catch (error) {
      if (isRoomNotFoundError(error)) {
        return roomError(reply, 404, 'ROOM_NOT_FOUND');
      }
      throw error;
    }
  });

  app.get('/api/rooms/:roomId/chat', async (request, reply) => {
    if (!options.chat) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: messages.NOT_FOUND } });

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);

    try {
      return reply.send(roomChatHistorySchema.parse(await options.chat.list(userId, roomId)));
    } catch (error) {
      if (isRoomNotFoundError(error)) {
        return roomError(reply, 404, 'ROOM_NOT_FOUND');
      }
      if (error instanceof Error && error.message === 'NOT_ROOM_MEMBER') {
        return roomError(reply, 403, 'NOT_ROOM_MEMBER');
      }
      throw error;
    }
  });

  app.post('/api/rooms/:roomId/join', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = joinRoomRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.joinRoom(userId, roomId, parsed.data));
  });

  app.post('/api/rooms/:roomId/seats/:seatIndex', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const params = request.params as { roomId: string; seatIndex: string };
    const parsed = takeSeatRequestSchema.safeParse({
      ...(typeof request.body === 'object' && request.body !== null ? request.body : {}),
      seatIndex: Number(params.seatIndex),
    });
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(
      reply,
      await options.service.takeSeat(userId, String(params.roomId), parsed.data),
    );
  });

  app.post('/api/rooms/:roomId/seats/:seatIndex/bot', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const params = request.params as { roomId: string; seatIndex: string };
    const parsed = addBotToSeatRequestSchema.safeParse({
      ...(typeof request.body === 'object' && request.body !== null ? request.body : {}),
      seatIndex: Number(params.seatIndex),
    });
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.addBot(userId, String(params.roomId), parsed.data));
  });

  app.delete('/api/rooms/:roomId/seats/:seatIndex/bot', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const params = request.params as { roomId: string; seatIndex: string };
    const parsed = removeBotFromSeatRequestSchema.safeParse({
      ...(typeof request.body === 'object' && request.body !== null ? request.body : {}),
      seatIndex: Number(params.seatIndex),
    });
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(
      reply,
      await options.service.removeBot(userId, String(params.roomId), parsed.data),
    );
  });

  app.delete('/api/rooms/:roomId/seat', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = leaveSeatRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.leaveSeat(userId, roomId, parsed.data));
  });

  app.post('/api/rooms/:roomId/ready', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = setReadyRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.setReady(userId, roomId, parsed.data));
  });

  app.post('/api/rooms/:roomId/leave', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = leaveRoomRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.leaveRoom(userId, roomId, parsed.data));
  });

  app.delete('/api/rooms/:roomId', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = deleteRoomRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.deleteRoom(userId, roomId, parsed.data));
  });

  app.post('/api/rooms/:roomId/start', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = startMatchRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.startMatch(userId, roomId, parsed.data));
  });

  app.post('/api/rooms/:roomId/reconnect', async (request, reply) => {
    const roomId = String((request.params as { roomId: string }).roomId);
    logRoomEntry(request, 'room-reconnect-start', { roomId });

    if (!requireOrigin(request, reply, options.allowedOrigins)) {
      logRoomEntry(request, 'room-reconnect-origin-rejected', { roomId });
      return;
    }

    if (!requireJson(request, reply)) {
      logRoomEntry(request, 'room-reconnect-invalid-json', { roomId });
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) {
      logRoomEntry(request, 'room-reconnect-auth-required', { roomId });
      return;
    }

    const parsed = roomReconnectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      logRoomEntry(request, 'room-reconnect-invalid-body', { roomId, userId });
      return publicError(reply, 400, 'VALIDATION_ERROR');
    }

    try {
      const room = toRoomStateResponse(await options.service.connectPresence(userId, roomId));
      logRoomEntry(request, 'room-reconnect-success', {
        roomId,
        userId,
        status: room.status,
        currentMatchId: room.currentMatchId ?? null,
      });
      return reply.send(room);
    } catch (error) {
      if (isRoomNotFoundError(error)) {
        logRoomEntry(request, 'room-reconnect-failed', { roomId, userId, code: 'ROOM_NOT_FOUND' });
        return roomError(reply, 404, 'ROOM_NOT_FOUND');
      }
      logRoomEntry(request, 'room-reconnect-failed', {
        roomId,
        userId,
        code: error instanceof Error ? error.message : 'UNKNOWN',
      });
      throw error;
    }
  });

  app.post('/api/rooms/:roomId/chat', async (request, reply) => {
    if (!options.chat) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: messages.NOT_FOUND } });
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = sendRoomChatMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    try {
      return reply.send({ ok: true, message: await options.chat.send(userId, roomId, parsed.data) });
    } catch (error) {
      if (isRoomNotFoundError(error)) {
        return roomError(reply, 404, 'ROOM_NOT_FOUND');
      }
      if (error instanceof Error && error.message === 'NOT_ROOM_MEMBER') {
        return roomError(reply, 403, 'NOT_ROOM_MEMBER');
      }
      throw error;
    }
  });
}
