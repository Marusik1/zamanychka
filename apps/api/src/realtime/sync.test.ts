import { describe, expect, it, vi } from 'vitest';

import { createGameSyncService } from './sync.js';

function createService() {
  const match = {
    id: 'match-1',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    finishedAt: null as Date | null,
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
    loadCurrentMatch: vi.fn(async (matchId: string) =>
      matchId === match.id ? structuredClone(match) : null,
    ),
  } as const;
  const prisma: { outboxRow: { findMany: (args?: unknown) => Promise<unknown[]> } } = {
    outboxRow: {
      findMany: vi.fn(async () => []),
    },
  };
  return {
    service: createGameSyncService({ repository: repository as never, prisma: prisma as never }),
    repository,
    prisma,
    match,
  };
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
            {
              matchId: match.id,
              eventId: `${match.id}:1`,
              sequence: 1,
              stateVersion: 1,
              type: 'diceRolled',
              payload: { playerId: 'user-1', diceValue: 6 },
              createdAt: '2026-08-25T00:00:00.000Z',
            },
            {
              matchId: match.id,
              eventId: `${match.id}:2`,
              sequence: 2,
              stateVersion: 1,
              type: 'turnChanged',
              payload: { fromPlayerId: 'user-1', toPlayerId: 'user-2' },
              createdAt: '2026-08-25T00:00:00.000Z',
            },
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
            {
              matchId: match.id,
              eventId: `${match.id}:3`,
              sequence: 3,
              stateVersion: 2,
              type: 'extraRollGranted',
              payload: { playerId: 'user-2', reason: 'ROLLED_SIX' },
              createdAt: '2026-08-25T00:00:00.000Z',
            },
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
      expect(response.transitions.map((transition) => transition.transitionId)).toEqual([
        'action-1',
        'action-2',
      ]);
    }
  });

  it('recovers a missed committed transition by sequence even when stateVersion is already current', async () => {
    const { service, prisma, match } = createService();
    const committedRows = [
      {
        resultingStateVersion: 2,
        payload: {
          transitionId: 'move-after-roll',
          stateVersion: 2,
          fromSequence: 3,
          toSequence: 3,
          events: [
            {
              matchId: match.id,
              eventId: `${match.id}:3`,
              sequence: 3,
              stateVersion: 2,
              type: 'pawnMoved',
              payload: {
                pawnId: 'user-2-pawn-0',
                playerId: 'user-2',
                fromCoord: { row: 0, col: 0 },
                toCoord: { row: 0, col: 4 },
                physicalPath: [
                  { row: 0, col: 1 },
                  { row: 0, col: 2 },
                  { row: 0, col: 3 },
                  { row: 0, col: 4 },
                ],
                capture: null,
              },
              createdAt: '2026-08-25T00:00:00.000Z',
            },
          ],
        },
      },
    ];
    prisma.outboxRow.findMany = vi.fn(async (args: unknown) => {
      const where = (args as { where?: { resultingStateVersion?: { gt?: number; lte?: number } } })
        .where;
      const lowerBound = where?.resultingStateVersion?.gt ?? -Infinity;
      const upperBound = where?.resultingStateVersion?.lte ?? Infinity;
      return committedRows.filter(
        (row) => row.resultingStateVersion > lowerBound && row.resultingStateVersion <= upperBound,
      );
    });

    const response = await service.sync({ matchId: match.id, stateVersion: 2, lastSequence: 2 });

    expect(response).toMatchObject({
      mode: 'events',
      watermark: { stateVersion: 2, lastSequence: 3 },
    });
    if (response.mode === 'events') {
      expect(response.transitions).toHaveLength(1);
      expect(response.transitions[0]?.transitionId).toBe('move-after-roll');
    }
    expect(prisma.outboxRow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ matchId: match.id }),
      }),
    );
  });

  it('falls back to the authoritative snapshot when the requested range is unsafe or missing', async () => {
    const { service, match } = createService();
    const response = await service.sync({ matchId: match.id, stateVersion: 9, lastSequence: 10 });
    expect(response.mode).toBe('snapshot');
    if (response.mode === 'snapshot') {
      expect(response.watermark).toEqual({ stateVersion: 2, lastSequence: 3 });
    }
  });

  it('injects authoritative lastSequence into snapshot fallback when persisted snapshot omits it', async () => {
    const { service, match } = createService();
    delete (match.snapshot as { lastSequence?: number }).lastSequence;

    const response = await service.sync({ matchId: match.id, stateVersion: 0, lastSequence: 0 });

    expect(response.mode).toBe('snapshot');
    if (response.mode === 'snapshot') {
      expect(response.snapshot.lastSequence).toBe(3);
      expect(response.watermark).toEqual({ stateVersion: 2, lastSequence: 3 });
    }
  });

  it('projects persisted match timing into a reconnect snapshot', async () => {
    const { service, match } = createService();
    match.finishedAt = new Date('2026-09-01T10:08:42.000Z');
    (match.snapshot as { status: string }).status = 'FINISHED';

    const response = await service.sync({ matchId: match.id, stateVersion: 0, lastSequence: 0 });

    expect(response.mode).toBe('snapshot');
    if (response.mode === 'snapshot') {
      expect(response.snapshot).toMatchObject({
        startedAt: '2026-09-01T10:00:00.000Z',
        finishedAt: '2026-09-01T10:08:42.000Z',
      });
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
            {
              matchId: match.id,
              eventId: `${match.id}:3`,
              sequence: 3,
              stateVersion: 2,
              type: 'extraRollGranted',
              payload: { playerId: 'user-2', reason: 'ROLLED_SIX' },
              createdAt: '2026-08-25T00:00:00.000Z',
            },
          ],
        },
      },
    ]);

    const response = await service.sync({ matchId: match.id, stateVersion: 1, lastSequence: 1 });
    expect(response.mode).toBe('snapshot');
  });

  it('buffers reconnect divergence while sync is in progress and deduplicates repeated broadcasts', async () => {
    const { service } = createService();
    const socket = service.createClientState({
      matchId: 'match-1',
      stateVersion: 0,
      lastSequence: 0,
    });
    socket.beginSync();
    socket.receiveBroadcast({ matchId: 'match-1', stateVersion: 1, lastSequence: 1 });
    socket.receiveBroadcast({ matchId: 'match-1', stateVersion: 1, lastSequence: 1 });

    expect(socket.pendingBroadcasts).toHaveLength(1);
    expect(socket.needsSync).toBe(true);
  });
});
