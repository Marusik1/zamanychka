import { describe, expect, it, vi } from 'vitest';

import { RedisBotMatchLease, type RedisLeaseClient } from './redis-lease.js';

describe('RedisBotMatchLease', () => {
  it('runs exclusively through Redis when the lease is acquired', async () => {
    const redis: RedisLeaseClient = {
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async () => 1),
    };
    const lease = new RedisBotMatchLease(redis);
    const run = vi.fn(async () => 'executed');

    await expect(lease.runExclusive('match-1', run)).resolves.toBe('executed');

    expect(run).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'zamanushka:bot-runner:match-1',
      expect.any(String),
      { NX: true, PX: 15_000 },
    );
    expect(redis.eval).toHaveBeenCalledTimes(1);
  });

  it('falls back to an in-memory single-instance lease when Redis acquire fails', async () => {
    const redis: RedisLeaseClient = {
      set: vi.fn(async () => {
        throw new Error('ClientClosedError: The client is closed');
      }),
      eval: vi.fn(async () => 1),
    };
    const lease = new RedisBotMatchLease(redis);
    const run = vi.fn(async () => 'executed');

    await expect(lease.runExclusive('match-1', run)).resolves.toBe('executed');

    expect(run).toHaveBeenCalledTimes(1);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('does not run when Redis reports that another runner owns the lease', async () => {
    const redis: RedisLeaseClient = {
      set: vi.fn(async () => null),
      eval: vi.fn(async () => 1),
    };
    const lease = new RedisBotMatchLease(redis);
    const run = vi.fn(async () => 'executed');

    await expect(lease.runExclusive('match-1', run)).resolves.toBeUndefined();

    expect(run).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
