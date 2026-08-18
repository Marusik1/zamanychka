import { describe, expect, it } from 'vitest';

import { parseEnv } from './env.js';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('parseEnv', () => {
  it('applies local host and port defaults', () => {
    expect(parseEnv(baseEnv)).toMatchObject({ API_HOST: '127.0.0.1', API_PORT: 3001 });
  });

  it('rejects a missing database URL', () => {
    expect(() => parseEnv({ REDIS_URL: baseEnv.REDIS_URL })).toThrow(/DATABASE_URL/);
  });
});
