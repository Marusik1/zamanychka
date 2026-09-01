import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('web dev proxy', () => {
  it('proxies socket.io traffic to the API target in local development', () => {
    const configSource = readFileSync(resolve(import.meta.dirname, 'vite.config.ts'), 'utf8');
    expect(configSource).toContain("'/socket.io'");
  });
});
