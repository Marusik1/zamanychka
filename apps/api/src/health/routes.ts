import type { HealthResponse, ReadinessResponse } from '@zamanushka/shared';
import type { FastifyInstance } from 'fastify';

import type { DependencyName, ReadinessProbe } from '../app.js';
import type { BuildInfo } from '../build-info.js';

const fallback: Record<DependencyName, 'down'> = { postgres: 'down', redis: 'down' };

export function registerOperationalRoutes(
  app: FastifyInstance,
  probes: ReadinessProbe[],
  buildInfo?: BuildInfo,
): void {
  app.get('/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));

  app.get('/health/version', async () =>
    buildInfo ?? {
      service: 'zamanushka-api',
      buildId: 'local-unknown',
      gitSha: 'unknown',
      builtAt: 'unknown',
      realtimeProtocolVersion: 'unknown',
    },
  );

  app.get('/ready', async (_request, reply): Promise<ReadinessResponse> => {
    const dependencies: Record<DependencyName, 'up' | 'down'> = { ...fallback };
    await Promise.all(
      probes.map(async (probe) => {
        try {
          dependencies[probe.name] = (await probe.check()) ? 'up' : 'down';
        } catch {
          dependencies[probe.name] = 'down';
        }
      }),
    );

    const ready = dependencies.postgres === 'up' && dependencies.redis === 'up';
    if (!ready) reply.code(503);
    return { status: ready ? 'ready' : 'not_ready', dependencies };
  });
}
