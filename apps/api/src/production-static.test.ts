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
    mkdirSync(assets);
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Zamanushka</title>');
    writeFileSync(join(assets, 'app.js'), 'console.log("ok")');
    roots.push(root);

    const app = buildApp({ probes: [], productionWebRoot: root });
    apps.push(app);

    const index = await app.inject({ method: 'GET', url: '/' });
    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });

    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.body).toContain('Zamanushka');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('text/javascript');
    expect(asset.body).toContain('console.log');
  });
});
