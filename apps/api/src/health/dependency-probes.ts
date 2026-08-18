import type { AppEnv } from '../config/env.js';
import { createPrismaClient } from '../infrastructure/prisma.js';
import { createRedisClient } from '../infrastructure/redis.js';
import { createPostgresProbe, createRedisProbe } from './live-dependencies.js';

export function createLiveDependencies(env: AppEnv) {
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedisClient(env.REDIS_URL);

  const postgresProbe = createPostgresProbe({
    queryRaw: () => prisma.$queryRawUnsafe('SELECT 1'),
  });
  const redisProbe = createRedisProbe({
    async ping() {
      if (!redis.isOpen) await redis.connect();
      return redis.ping();
    },
  });

  return {
    probes: [postgresProbe, redisProbe],
    async close() {
      if (redis.isOpen) await redis.quit();
      await prisma.$disconnect();
    },
  };
}
