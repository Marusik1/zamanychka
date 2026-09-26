import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Docker build fingerprint defaults', () => {
  it('does not override source build constants with local/unknown production defaults', () => {
    const dockerfile = readFileSync(join(process.cwd(), '../../Dockerfile'), 'utf8');

    expect(dockerfile).not.toContain('ARG BUILD_ID=local-docker');
    expect(dockerfile).not.toContain('ARG GIT_SHA=unknown');
    expect(dockerfile).not.toContain('ARG BUILD_TIMESTAMP=unknown');
  });
});
