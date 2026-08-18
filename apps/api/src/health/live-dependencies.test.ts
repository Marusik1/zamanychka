import { describe, expect, it, vi } from 'vitest';

import { createPostgresProbe, createRedisProbe } from './live-dependencies.js';

describe('live dependency probes', () => {
  it('uses a lightweight PostgreSQL query', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

    await expect(createPostgresProbe({ queryRaw }).check()).resolves.toBe(true);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('marks PostgreSQL down when its query fails', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(createPostgresProbe({ queryRaw }).check()).resolves.toBe(false);
  });

  it('uses Redis ping and reports only PONG as ready', async () => {
    const ping = vi.fn().mockResolvedValue('PONG');

    await expect(createRedisProbe({ ping }).check()).resolves.toBe(true);
    expect(ping).toHaveBeenCalledOnce();
  });
});
