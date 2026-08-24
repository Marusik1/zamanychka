import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  leaveSeatRequestSchema,
  roomReconnectRequestSchema,
  setReadyRequestSchema,
  startMatchRequestSchema,
  takeSeatRequestSchema,
  type PublicErrorCode,
} from '@zamanushka/shared';

import type { AuthService } from '../auth/auth-service.js';
import type { RoomService } from './room-service.js';

export interface RoomRoutesOptions {
  service: RoomService;
  auth: AuthService;
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

const roomMessages = {
  ROOM_NOT_FOUND: 'Room is not available',
  ROOM_ALREADY_ACTIVE: 'Room already has an active match',
  ROOM_NOT_READY: 'Room is not ready',
  ROOM_FULL: 'Room is full',
  SEAT_TAKEN: 'Seat is already taken',
  SEAT_NOT_OWNED: 'Seat is not owned by this participant',
  SEATED_PARTICIPANT_DISCONNECTED: 'Seated participant is disconnected',
  STALE_ROOM_VERSION: 'Room version is stale',
  NOT_ALLOWED: 'Operation is not allowed',
} as const;

type RoomErrorCode = keyof typeof roomMessages;

function roomError(reply: FastifyReply, status: number, code: RoomErrorCode) {
  return reply.code(status).send({ error: { code, message: roomMessages[code] } });
}

function publicError(reply: FastifyReply, status: number, code: PublicErrorCode) {
  return reply.code(status).send({ error: { code, message: messages[code] } });
}

async function actorId(request: FastifyRequest, reply: FastifyReply, auth: AuthService) {
  const token = request.cookies['__Host-zamanushka-session'] ?? request.cookies['zamanushka-session'];
  try {
    const result = await auth.me(token);
    return result.user.id;
  } catch {
    publicError(reply, 401, 'AUTH_REQUIRED');
    return null;
  }
}

function mapRoomResult(reply: FastifyReply, result: { ok: true } | { ok: false; error: { code: RoomErrorCode } }) {
  if (result.ok) return reply.send(result);
  const status =
    result.error.code === 'ROOM_NOT_FOUND'
      ? 404
      : result.error.code === 'NOT_ALLOWED' || result.error.code === 'SEAT_NOT_OWNED'
        ? 403
        : result.error.code === 'SEAT_TAKEN'
          ? 409
          : 409;
  return roomError(reply, status, result.error.code);
}

export function registerRoomRoutes(app: FastifyInstance, options: RoomRoutesOptions) {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.get('/api/room', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;
    return options.service.viewRoom();
  });

  app.post('/api/room/take-seat', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;
    const parsed = takeSeatRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');
    const result = await options.service.takeSeat(userId, parsed.data);
    return mapRoomResult(reply, result);
  });

  app.post('/api/room/leave-seat', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;
    const parsed = leaveSeatRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');
    const result = await options.service.leaveSeat(userId);
    return mapRoomResult(reply, result);
  });

  app.post('/api/room/set-ready', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;
    const parsed = setReadyRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');
    const result = await options.service.setReady(userId, parsed.data);
    return mapRoomResult(reply, result);
  });

  app.post('/api/room/start-match', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;
    const parsed = startMatchRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');
    const result = await options.service.startMatch(userId, parsed.data);
    if (result.ok) return reply.send(result);
    const status =
      result.error.code === 'ROOM_NOT_FOUND'
        ? 404
        : result.error.code === 'NOT_ALLOWED' || result.error.code === 'SEAT_NOT_OWNED'
          ? 403
          : 409;
    return roomError(reply, status, result.error.code);
  });

  app.post('/api/room/reconnect', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth);
    if (!userId) return;
    const parsed = roomReconnectRequestSchema.safeParse(request.body);
    if (!parsed.success) return publicError(reply, 400, 'VALIDATION_ERROR');
    return options.service.connectPresence(userId);
  });
}
