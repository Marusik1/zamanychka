import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

import type { AuthRuntimeConfig } from './config/env.js';
import type { AuthService } from './auth/auth-service.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerOperationalRoutes } from './health/routes.js';

export type DependencyName = 'postgres' | 'redis';

export interface ReadinessProbe {
  readonly name: DependencyName;
  check(): Promise<boolean>;
}

export interface BuildAppOptions {
  probes: ReadinessProbe[];
  logger?: boolean;
  auth?: { config: AuthRuntimeConfig; service: AuthService };
}

export function buildApp({ logger = false, probes, auth }: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: logger
      ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body', 'body.initData'] }
      : false,
  });
  registerOperationalRoutes(app, probes);
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
    });
  return app;
}
