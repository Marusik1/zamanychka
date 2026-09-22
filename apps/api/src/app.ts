import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import type { AuthRuntimeConfig } from './config/env.js';
import type { AuthService } from './auth/auth-service.js';
import type { BuildInfo } from './build-info.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerOperationalRoutes } from './health/routes.js';
import { registerProfileRoutes } from './profile/routes.js';
import { registerRoomRoutes } from './rooms/routes.js';
import type { ProfileService } from './profile/profile-service.js';
import type { RoomChatService } from './rooms/room-chat.js';
import type { RoomInviteService } from './rooms/room-invite-service.js';
import type { RoomService } from './rooms/room-service.js';

export type DependencyName = 'postgres' | 'redis';

export interface ReadinessProbe {
  readonly name: DependencyName;
  check(): Promise<boolean>;
}

export interface BuildAppOptions {
  probes: ReadinessProbe[];
  logger?: boolean;
  auth?: { config: AuthRuntimeConfig; service: AuthService };
  rooms?: { service: RoomService; chat?: RoomChatService; invites?: RoomInviteService };
  profile?: { service: ProfileService };
  productionWebRoot?: string;
  buildInfo?: BuildInfo;
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function registerProductionFrontend(app: FastifyInstance, root: string) {
  const normalizedRoot = normalize(root);
  const sendFile = async (relativePath: string) => {
    const resolved = normalize(join(normalizedRoot, relativePath));
    if (!resolved.startsWith(normalizedRoot)) return null;
    try {
      return {
        body: await readFile(resolved),
        type: CONTENT_TYPES[extname(resolved)] ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  };

  app.get('/assets/*', async (request, reply) => {
    const path = typeof request.params === 'object' ? String((request.params as { '*': string })['*']) : '';
    const file = await sendFile(join('assets', path));
    if (!file) return reply.code(404).send({ error: 'Not Found' });
    return reply.header('Cache-Control', 'public, max-age=31536000, immutable').type(file.type).send(file.body);
  });

  app.get('/intro/*', async (request, reply) => {
    const path = typeof request.params === 'object' ? String((request.params as { '*': string })['*']) : '';
    const file = await sendFile(join('intro', path));
    if (!file) return reply.code(404).send({ error: 'Not Found' });
    return reply.header('Cache-Control', 'public, max-age=31536000, immutable').type(file.type).send(file.body);
  });

  app.get('/', async (_request, reply) => {
    const index = await sendFile('index.html');
    if (!index) return reply.code(503).send({ error: 'Frontend build is missing' });
    return reply
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .type(index.type)
      .send(index.body);
  });
}

export function buildApp({
  logger = false,
  probes,
  auth,
  rooms,
  profile,
  productionWebRoot,
  buildInfo,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: logger
      ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body', 'body.initData'] }
      : false,
  });
  registerOperationalRoutes(app, probes, buildInfo);
  if (auth)
    app.register(async (scope) => {
      await scope.register(cookie);
      registerAuthRoutes(scope, {
        service: auth.service,
        mode: auth.config.mode,
        allowedOrigins: auth.config.allowedOrigins,
        cookie: auth.config.cookie,
        sessionTtlSeconds: auth.config.sessionTtlSeconds,
      });
      if (rooms)
        registerRoomRoutes(scope, {
          service: rooms.service,
          ...(rooms.chat ? { chat: rooms.chat } : {}),
          ...(rooms.invites ? { invites: rooms.invites } : {}),
          auth: auth.service,
          cookieName: auth.config.cookie.name,
          allowedOrigins: auth.config.allowedOrigins,
        });
      if (profile)
        registerProfileRoutes(scope, {
          service: profile.service,
          auth: auth.service,
          cookieName: auth.config.cookie.name,
        });
    });
  if (productionWebRoot) {
    void registerProductionFrontend(app, productionWebRoot);
  }
  return app;
}
