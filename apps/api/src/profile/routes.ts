import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PublicErrorCode } from '@zamanushka/shared';

import type { AuthService } from '../auth/auth-service.js';
import type { ProfileService } from './profile-service.js';

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

function publicError(reply: FastifyReply, status: number, code: PublicErrorCode) {
  return reply.code(status).send({ error: { code, message: messages[code] } });
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

function parseLimit(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

function parseCursor(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function registerProfileRoutes(
  app: FastifyInstance,
  options: { service: ProfileService; auth: AuthService; cookieName: string },
) {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.get('/api/profile', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;
    try {
      return await options.service.loadProfile(userId);
    } catch {
      return publicError(reply, 404, 'NOT_FOUND');
    }
  });

  app.get('/api/profile/history', async (request, reply) => {
    const userId = await actorId(request, reply, options.auth, options.cookieName);
    if (!userId) return;
    const query = (request.query ?? {}) as Record<string, unknown>;
    const limit = parseLimit(query.limit);
    return options.service.loadHistory({
      userId,
      ...(limit === undefined ? {} : { limit }),
      cursor: parseCursor(query.cursor),
    });
  });
}
