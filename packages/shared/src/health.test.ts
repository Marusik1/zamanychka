import { describe, expect, it } from 'vitest';

import { healthResponseSchema, readinessResponseSchema } from './health.js';

describe('operational response contracts', () => {
  it('accepts the liveness response', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('accepts dependency readiness details', () => {
    const response = {
      status: 'not_ready',
      dependencies: { postgres: 'up', redis: 'down' },
    };

    expect(readinessResponseSchema.parse(response)).toEqual(response);
  });
});
