import { describe, expect, it, vi } from 'vitest';

import { createVersionWatchdog } from './watchdog.js';

describe('version watchdog', () => {
  it('periodically detects missed-broadcast divergence for subscribed clients', async () => {
    const alerts: Array<{ matchId: string; lastSequence: number }> = [];
    const watchdog = createVersionWatchdog({
      intervalMs: 1000,
      now: () => new Date('2026-08-25T00:00:00.000Z'),
      loadMatches: vi.fn(async () => [
        { matchId: 'match-1', stateVersion: 2, lastSequence: 5 },
      ]),
      loadClients: vi.fn(async () => [
        { socketId: 'socket-1', matchId: 'match-1', stateVersion: 2, lastSequence: 3, syncInProgress: false },
      ]),
      onDivergence: async (input) => {
        alerts.push(input);
      },
    });

    await watchdog.scanOnce();

    expect(alerts).toEqual([{ matchId: 'match-1', lastSequence: 3 }]);
  });

  it('ignores clients already syncing and leaves the divergence decision to sync recovery', async () => {
    const onDivergence = vi.fn(async () => undefined);
    const watchdog = createVersionWatchdog({
      intervalMs: 1000,
      now: () => new Date('2026-08-25T00:00:00.000Z'),
      loadMatches: vi.fn(async () => [{ matchId: 'match-1', stateVersion: 2, lastSequence: 5 }]),
      loadClients: vi.fn(async () => [
        { socketId: 'socket-1', matchId: 'match-1', stateVersion: 2, lastSequence: 3, syncInProgress: true },
      ]),
      onDivergence,
    });

    await watchdog.scanOnce();

    expect(onDivergence).not.toHaveBeenCalled();
  });
});
