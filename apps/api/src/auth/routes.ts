import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  devAuthRequestSchema,
  telegramAuthRequestSchema,
  type PublicErrorCode,
} from '@zamanushka/shared';

import type { CookiePolicy } from '../config/env.js';
import type { AuthService } from './auth-service.js';
import { AuthServiceError } from './auth-service.js';
import { clearSessionCookie, sessionCookie } from './cookies.js';
import { isAllowedOrigin } from './origin-guard.js';

export type AuthRoutesOptions = {
  service: AuthService;
  mode: 'telegram' | 'development';
  allowedOrigins: string[];
  cookie: CookiePolicy;
  sessionTtlSeconds: number;
};
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
function error(reply: FastifyReply, status: number, code: PublicErrorCode) {
  return reply.code(status).send({ error: { code, message: messages[code] } });
}
function origin(request: FastifyRequest, reply: FastifyReply, allowed: string[]) {
  if (!isAllowedOrigin(request.headers.origin, allowed)) {
    error(reply, 403, 'ORIGIN_NOT_ALLOWED');
    return false;
  }
  return true;
}
function json(request: FastifyRequest, reply: FastifyReply) {
  if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() === 'application/json')
    return true;
  error(reply, 415, 'VALIDATION_ERROR');
  return false;
}
function map(reply: FastifyReply, thrown: unknown) {
  if (thrown instanceof AuthServiceError) {
    const status =
      thrown.code === 'AUTH_REQUIRED' || thrown.code === 'TELEGRAM_AUTH_INVALID'
        ? 401
        : thrown.code === 'AUTH_SESSION_REPLACED'
          ? 409
          : 400;
    return error(reply, status, thrown.code);
  }
  return error(reply, 500, 'INTERNAL_ERROR');
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions) {
  app.setErrorHandler((thrown, _request, reply) => {
    const statusCode =
      typeof thrown === 'object' && thrown !== null && 'statusCode' in thrown
        ? (thrown as { statusCode?: unknown }).statusCode
        : undefined;
    if (statusCode === 400 || statusCode === 415)
      return error(reply, statusCode, 'VALIDATION_ERROR');
    return error(reply, 500, 'INTERNAL_ERROR');
  });
  app.setNotFoundHandler((_request, reply) => error(reply, 404, 'NOT_FOUND'));
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/api/auth/dev', async () =>
    options.mode === 'development'
      ? options.service.capability()
      : { enabled: false as const, users: [] },
  );
  const login =
    (kind: 'development' | 'telegram') => async (request: FastifyRequest, reply: FastifyReply) => {
      if (!origin(request, reply, options.allowedOrigins) || !json(request, reply)) return;
      const parsed = (
        kind === 'development' ? devAuthRequestSchema : telegramAuthRequestSchema
      ).safeParse(request.body);
      if (!parsed.success) return error(reply, 400, 'VALIDATION_ERROR');
      try {
        const current = request.cookies[options.cookie.name];
        const result =
          kind === 'development'
            ? await options.service.loginDevelopment(
                (parsed.data as { devUserKey: string }).devUserKey,
                current,
              )
            : await options.service.loginTelegram(
                (parsed.data as { initData: string }).initData,
                current,
              );
        reply.setCookie(
          options.cookie.name,
          result.token,
          sessionCookie(
            options.cookie,
            Math.min(
              options.sessionTtlSeconds,
              Math.max(0, Math.floor((Date.parse(result.session.expiresAt) - Date.now()) / 1000)),
            ),
          ),
        );
        return reply.send({ user: result.user, session: result.session });
      } catch (thrown) {
        return map(reply, thrown);
      }
    };
  if (options.mode === 'development') app.post('/api/auth/dev', login('development'));
  else app.post('/api/auth/telegram', login('telegram'));
  app.get('/api/me', async (request, reply) => {
    try {
      return await options.service.me(request.cookies[options.cookie.name]);
    } catch (thrown) {
      return map(reply, thrown);
    }
  });
  app.post('/api/auth/logout', async (request, reply) => {
    if (!origin(request, reply, options.allowedOrigins) || !json(request, reply)) return;
    try {
      await options.service.logout(request.cookies[options.cookie.name]);
      reply.clearCookie(options.cookie.name, clearSessionCookie(options.cookie));
      return reply.send({ ok: true });
    } catch (thrown) {
      return map(reply, thrown);
    }
  });
}
