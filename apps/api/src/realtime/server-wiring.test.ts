import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('server realtime wiring', () => {
  it('wires committed transition recovery into production Socket.IO sync', () => {
    const serverSource = readFileSync(
      fileURLToPath(new URL('../server.ts', import.meta.url)),
      'utf8',
    );

    expect(serverSource).toContain("import { createGameSyncService } from './realtime/sync.js';");
    expect(serverSource).toContain('const gameSyncService = createGameSyncService');
    expect(serverSource).toContain('loadCommittedTransitions:');
    expect(serverSource).toContain('gameSyncService.sync');
  });
});
