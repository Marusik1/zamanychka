import { randomUUID } from 'node:crypto';
import type { MatchLease } from './types.js';

export interface RedisLeaseClient {
  set(key: string, value: string, options: { NX: true; PX: number }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export class RedisBotMatchLease implements MatchLease {
  constructor(
    private readonly redis: RedisLeaseClient,
    private readonly ttlMs = 15_000,
    private readonly keyPrefix = 'zamanushka:bot-runner:',
  ) {}

  async runExclusive<T>(matchId: string, fn: () => Promise<T>): Promise<T | undefined> {
    const key = `${this.keyPrefix}${matchId}`;
    const token = randomUUID();

    const acquired = await this.redis.set(key, token, {
      NX: true,
      PX: this.ttlMs,
    });

    if (acquired !== 'OK') return undefined;

    try {
      return await fn();
    } finally {
      await this.redis.eval(RELEASE_SCRIPT, {
        keys: [key],
        arguments: [token],
      });
    }
  }
}

export class InMemoryBotMatchLease implements MatchLease {
  private readonly locks = new Set<string>();

  async runExclusive<T>(matchId: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (this.locks.has(matchId)) return undefined;
    this.locks.add(matchId);
    try {
      return await fn();
    } finally {
      this.locks.delete(matchId);
    }
  }
}
