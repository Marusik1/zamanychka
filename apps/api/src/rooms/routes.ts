import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createRoomRequestSchema,
  joinRoomRequestSchema,
  leaveRoomRequestSchema,
  leaveSeatRequestSchema,
  roomReconnectRequestSchema,
  setReadyRequestSchema,
  startMatchRequestSchema,
  takeSeatRequestSchema,
  type PublicErrorCode,
  type RoomCommandErrorCode,
} from '@zamanushka/shared';

import type { AuthService } from '../auth/auth-service.js';
import { isAllowedOrigin } from '../auth/origin-guard.js';
import type { RoomService } from './room-service.js';

export interface RoomRoutesOptions {
  service: RoomService;
  auth: AuthService;
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

async function actorId(request: FastifyRequest, reply: FastifyReply, auth: AuthService) {
  const token =
    request.cookies['__Host-zamanushka-session'] ?? request.cookies['zamanushka-session'];

  try {
    const result = await auth.me(token);
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

function isRoomNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === 'ROOM_NOT_FOUND';
}

export function registerRoomRoutes(app: FastifyInstance, options: RoomRoutesOptions) {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.get('/api/rooms', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;
    return reply.send(await options.service.listRooms(userId));
  });

  app.post('/api/rooms', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;

    const parsed = createRoomRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return reply.send(await options.service.createRoom(userId, parsed.data));
  });

  app.get('/api/rooms/:roomId', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);

    try {
      return reply.send(await options.service.getRoom(userId, roomId));
    } catch (error) {
      if (isRoomNotFoundError(error)) {
        return roomError(reply, 404, 'ROOM_NOT_FOUND');
      }
      throw error;
    }
  });

  app.post('/api/rooms/:roomId/join', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth);
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

    const userId = await actorId(request, reply, options.auth);
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

  app.delete('/api/rooms/:roomId/seat', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth);
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

    const userId = await actorId(request, reply, options.auth);
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

    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = leaveRoomRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.leaveRoom(userId, roomId, parsed.data));
  });

  app.post('/api/rooms/:roomId/start', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = startMatchRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    return mapRoomResult(reply, await options.service.startMatch(userId, roomId, parsed.data));
  });

  app.post('/api/rooms/:roomId/reconnect', async (request, reply) => {
    if (!requireOrigin(request, reply, options.allowedOrigins) || !requireJson(request, reply)) {
      return;
    }

    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;

    const roomId = String((request.params as { roomId: string }).roomId);
    const parsed = roomReconnectRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');

    try {
      return reply.send(await options.service.connectPresence(userId, roomId));
    } catch (error) {
      if (isRoomNotFoundError(error)) {
        return roomError(reply, 404, 'ROOM_NOT_FOUND');
      }
      throw error;
    }
  });
}
