import { afterEach, describe, expect, it } from 'vitest';

import { buildApp, type ReadinessProbe } from '../app.js';

const probe = (name: ReadinessProbe['name'], ready: boolean): ReadinessProbe => ({
  name,
  check: () => Promise.resolve(ready),
});

describe('operational routes', () => {
  const apps: ReturnType<typeof buildApp>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('reports process liveness without consulting dependencies', async () => {
    const app = buildApp({ probes: [probe('postgres', false), probe('redis', false)] });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('reports ready only when both dependencies respond', async () => {
    const app = buildApp({ probes: [probe('postgres', true), probe('redis', true)] });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      dependencies: { postgres: 'up', redis: 'up' },
    });
  });

  it('returns 503 with the failed dependency identified', async () => {
    const app = buildApp({ probes: [probe('postgres', true), probe('redis', false)] });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'not_ready',
      dependencies: { postgres: 'up', redis: 'down' },
    });
  });
});
