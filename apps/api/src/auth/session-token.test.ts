import { describe, expect, it } from 'vitest';

import { createSessionToken, hashSessionToken } from './session-token.js';

describe('session tokens', () => {
  it('encodes exactly 32 injected bytes as unpadded URL-safe base64', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => index + 224);

    const token = createSessionToken(() => bytes);

    expect(token).toBe('4OHi4-Tl5ufo6err7O3u7_Dx8vP09fb3-Pn6-_z9_v8');
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes deterministically as a lowercase SHA-256 hex digest', () => {
    const first = hashSessionToken('opaque-token');
    const second = hashSessionToken('opaque-token');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates different values from different entropy', () => {
    const first = createSessionToken(() => Buffer.alloc(32, 1));
    const second = createSessionToken(() => Buffer.alloc(32, 2));

    expect(first).not.toBe(second);
  });
});
