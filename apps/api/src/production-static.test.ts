import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

describe('production static serving', () => {
  const apps: ReturnType<typeof buildApp>[] = [];
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it('serves the built frontend root and built assets from the api process', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zamanushka-web-dist-'));
    const assets = join(root, 'assets');
    const intro = join(root, 'intro');
    mkdirSync(assets);
    mkdirSync(intro);
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Zamanushka</title>');
    writeFileSync(join(assets, 'app.js'), 'console.log("ok")');
    writeFileSync(join(intro, 'idle-mobile.webp'), 'webp');
    roots.push(root);

    const app = buildApp({ probes: [], productionWebRoot: root });
    apps.push(app);

    const index = await app.inject({ method: 'GET', url: '/' });
    const indexHtml = await app.inject({ method: 'GET', url: '/index.html' });
    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    const introAsset = await app.inject({ method: 'GET', url: '/intro/idle-mobile.webp' });

    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(index.headers.pragma).toBe('no-cache');
    expect(index.headers.expires).toBe('0');
    expect(index.body).toContain('Zamanushka');
    expect(indexHtml.statusCode).toBe(200);
    expect(indexHtml.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(indexHtml.body).toContain('Zamanushka');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('text/javascript');
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(asset.body).toContain('console.log');
    expect(introAsset.statusCode).toBe(200);
    expect(introAsset.headers['content-type']).toContain('image/webp');
    expect(introAsset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(introAsset.body).toContain('webp');
  });

  it('exposes canonical API build identity', async () => {
    const app = buildApp({
      probes: [],
      buildInfo: {
        service: 'zamanushka-api',
        releaseId: 'test-release',
        buildId: 'test-build',
        gitSha: 'abc123',
        builtAt: '2026-09-19T00:00:00.000Z',
        realtimeProtocolVersion: '3',
      },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health/version' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'zamanushka-api',
      releaseId: 'test-release',
      buildId: 'test-build',
      gitSha: 'abc123',
      builtAt: '2026-09-19T00:00:00.000Z',
      realtimeProtocolVersion: '3',
    });
  });
});
