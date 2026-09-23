import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
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

function telemetryEnabled() {
  return process.env.GAMEPLAY_TELEMETRY === 'true';
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function logRedisTelemetry(event: string, payload: Record<string, unknown>) {
  if (!telemetryEnabled()) return;
  console.info(
    JSON.stringify({
      scope: 'gameplay-redis',
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

export class RedisBotMatchLease implements MatchLease {
  constructor(
    private readonly redis: RedisLeaseClient,
    private readonly ttlMs = 15_000,
    private readonly keyPrefix = 'zamanushka:bot-runner:',
  ) {}

  async runExclusive<T>(matchId: string, fn: () => Promise<T>): Promise<T | undefined> {
    const key = `${this.keyPrefix}${matchId}`;
    const token = randomUUID();

    const acquireStartedAt = performance.now();
    let acquired: string | null = null;
    try {
      acquired = await this.redis.set(key, token, {
        NX: true,
        PX: this.ttlMs,
      });
    } catch (error) {
      logRedisTelemetry('bot-lease-acquire-failed', {
        matchId,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: roundMs(performance.now() - acquireStartedAt),
      });
      return undefined;
    }
    logRedisTelemetry('bot-lease-acquire', {
      matchId,
      acquired: acquired === 'OK',
      latencyMs: roundMs(performance.now() - acquireStartedAt),
    });

    if (acquired !== 'OK') return undefined;

    try {
      return await fn();
    } finally {
      const releaseStartedAt = performance.now();
      try {
        await this.redis.eval(RELEASE_SCRIPT, {
          keys: [key],
          arguments: [token],
        });
      } catch (error) {
        logRedisTelemetry('bot-lease-release-failed', {
          matchId,
          error: error instanceof Error ? error.message : String(error),
          latencyMs: roundMs(performance.now() - releaseStartedAt),
        });
        return;
      }
      logRedisTelemetry('bot-lease-release', {
        matchId,
        latencyMs: roundMs(performance.now() - releaseStartedAt),
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
