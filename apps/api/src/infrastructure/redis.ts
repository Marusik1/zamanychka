import { createClient } from 'redis';

export function createRedisClient(url: string) {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 2_000, reconnectStrategy: false },
  });
  client.on('error', () => undefined);
  return client;
}

export type AppRedisClient = ReturnType<typeof createRedisClient>;
