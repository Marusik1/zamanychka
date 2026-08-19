import { describe, expect, it, vi } from 'vitest';

import { createTestDatabase } from './test-database.js';

describe('test database guard', () => {
  it('rejects an unsafe URL before constructing a database client', () => {
    const createClient = vi.fn();

    expect(() =>
      createTestDatabase('postgresql://user:password@127.0.0.1:5432/zamanushka', createClient),
    ).toThrow('database name must end in _test');
    expect(createClient).not.toHaveBeenCalled();
  });
});
