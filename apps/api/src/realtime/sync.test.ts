import { describe, expect, it, vi } from 'vitest';

import { createGameSyncService } from './sync.js';

function createService() {
  const match = {
    id: 'match-1',
    stateVersion: 2,
    lastSequence: 3,
    snapshot: {
      status: 'ACTIVE',
      stateVersion: 2,
      turnNumber: 1,
      turnPhase: 'WAITING_FOR_ROLL',
      currentPlayerId: 'user-1',
      diceValue: null,
      winnerPlayerId: null,
      winReason: null,
      players: [],
      pawns: [],
      lastSequence: 3,
    },
  };
  const repository = {
    loadCurrentMatch: vi.fn(async (matchId: string) => (matchId === match.id ? structuredClone(match) : null)),
  } as const;
  const prisma: { outboxRow: { findMany: (args?: unknown) => Promise<unknown[]> } } = {
    outboxRow: {
      findMany: vi.fn(async () => []),
    },
  };
  return { service: createGameSyncService({ repository: repository as never, prisma: prisma as never }), repository, prisma, match };
}

describe('game sync recovery', () => {
  it('returns ordered continuous transition envelopes when the requested range is available', async () => {
    const { service, prisma, match } = createService();
    prisma.outboxRow.findMany = vi.fn(async () => [
      {
        resultingStateVersion: 1,
        payload: {
          transitionId: 'action-1',
          stateVersion: 1,
          fromSequence: 1,
          toSequence: 2,
          events: [
            { matchId: match.id, eventId: `${match.id}:1`, sequence: 1, stateVersion: 1, type: 'diceRolled', payload: { playerId: 'user-1', diceValue: 6 }, createdAt: '2026-08-25T00:00:00.000Z' },
            { matchId: match.id, eventId: `${match.id}:2`, sequence: 2, stateVersion: 1, type: 'turnChanged', payload: { fromPlayerId: 'user-1', toPlayerId: 'user-2' }, createdAt: '2026-08-25T00:00:00.000Z' },
          ],
        },
      },
      {
        resultingStateVersion: 2,
        payload: {
          transitionId: 'action-2',
          stateVersion: 2,
          fromSequence: 3,
          toSequence: 3,
          events: [
            { matchId: match.id, eventId: `${match.id}:3`, sequence: 3, stateVersion: 2, type: 'extraRollGranted', payload: { playerId: 'user-2' }, createdAt: '2026-08-25T00:00:00.000Z' },
          ],
        },
      },
    ]);

    const response = await service.sync({ matchId: match.id, stateVersion: 0, lastSequence: 0 });

    expect(response).toMatchObject({
      mode: 'events',
      watermark: { stateVersion: 2, lastSequence: 3 },
    });
    if (response.mode === 'events') {
      expect(response.transitions.map((transition) => transition.transitionId)).toEqual(['action-1', 'action-2']);
    }
  });

  it('falls back to the authoritative snapshot when the requested range is unsafe or missing', async () => {
    const { service, match } = createService();
    const response = await service.sync({ matchId: match.id, stateVersion: 9, lastSequence: 10 });
    expect(response.mode).toBe('snapshot');
    if (response.mode === 'snapshot') {
      expect(response.watermark).toEqual({ stateVersion: 2, lastSequence: 3 });
    }
  });

  it('detects a gap and forces snapshot reconciliation instead of chaining broken deltas', async () => {
    const { service, prisma, match } = createService();
    prisma.outboxRow.findMany = vi.fn(async () => [
      {
        resultingStateVersion: 2,
        payload: {
          transitionId: 'action-2',
          stateVersion: 2,
          fromSequence: 3,
          toSequence: 3,
          events: [
            { matchId: match.id, eventId: `${match.id}:3`, sequence: 3, stateVersion: 2, type: 'extraRollGranted', payload: { playerId: 'user-2' }, createdAt: '2026-08-25T00:00:00.000Z' },
          ],
        },
      },
    ]);

    const response = await service.sync({ matchId: match.id, stateVersion: 1, lastSequence: 1 });
    expect(response.mode).toBe('snapshot');
  });

  it('buffers reconnect divergence while sync is in progress and deduplicates repeated broadcasts', async () => {
    const { service } = createService();
    const socket = service.createClientState({ matchId: 'match-1', stateVersion: 0, lastSequence: 0 });
    socket.beginSync();
    socket.receiveBroadcast({ matchId: 'match-1', stateVersion: 1, lastSequence: 1 });
    socket.receiveBroadcast({ matchId: 'match-1', stateVersion: 1, lastSequence: 1 });

    expect(socket.pendingBroadcasts).toHaveLength(1);
    expect(socket.needsSync).toBe(true);
  });
});
