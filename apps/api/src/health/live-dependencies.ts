import type { ReadinessProbe } from '../app.js';

export interface PostgresProbeClient {
  queryRaw(): Promise<unknown>;
}

export interface RedisProbeClient {
  ping(): Promise<string>;
}

export function createPostgresProbe(client: PostgresProbeClient): ReadinessProbe {
  return {
    name: 'postgres',
    async check() {
      try {
        await client.queryRaw();
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function createRedisProbe(client: RedisProbeClient): ReadinessProbe {
  return {
    name: 'redis',
    async check() {
      try {
        return (await client.ping()) === 'PONG';
      } catch {
        return false;
      }
    },
  };
}
