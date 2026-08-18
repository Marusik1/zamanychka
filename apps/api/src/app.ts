import Fastify, { type FastifyInstance } from 'fastify';

import { registerOperationalRoutes } from './health/routes.js';

export type DependencyName = 'postgres' | 'redis';

export interface ReadinessProbe {
  readonly name: DependencyName;
  check(): Promise<boolean>;
}

export interface BuildAppOptions {
  probes: ReadinessProbe[];
  logger?: boolean;
}

export function buildApp({ logger = false, probes }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });
  registerOperationalRoutes(app, probes);
  return app;
}
