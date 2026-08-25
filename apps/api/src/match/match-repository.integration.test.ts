import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase } from '../test/test-database.js';
import { createMatchRepository } from './match-repository.js';
import { createPostgresOutboxLeaseStore } from '../realtime/outbox.js';

const database = createTestDatabase();
const repository = createMatchRepository(database.prisma);

async function createMatch() {
  await database.prisma.room.create({ data: { key: 'single-room' } });
  return database.prisma.match.create({
    data: {
      roomKey: 'single-room',
      firstPlayerId: 'user-1',
      seatOrder: ['user-1', 'user-2'],
      snapshot: { version: 0 },
    },
  });
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('match persistence repository', () => {
  it('leases an unpublished outbox row to only one worker and permits reclaim after expiry', async () => {
    const match = await createMatch();
    await repository.withLockedMatch(match.id, async (tx) => {
      await repository.insertOutboxRow(tx, {
        matchId: match.id,
        resultingStateVersion: 1,
        payload: { matchId: match.id, stateVersion: 1, lastSequence: 1, events: [] },
      });
    });
    const now = new Date('2026-08-25T00:00:00.000Z');
    const outbox = createPostgresOutboxLeaseStore(database.prisma, { now: () => now, leaseDurationMs: 10_000 });

    const [first, second] = await Promise.all([
      outbox.claim({ leaseToken: 'worker-a' }),
      outbox.claim({ leaseToken: 'worker-b' }),
    ]);
    const reclaimed = await createPostgresOutboxLeaseStore(database.prisma, {
      now: () => new Date('2026-08-25T00:00:11.000Z'),
      leaseDurationMs: 10_000,
    }).claim({ leaseToken: 'worker-b' });

    const claimed = first ?? second;
    const originalWorker = first ? 'worker-a' : 'worker-b';
    expect(claimed).toMatchObject({ matchId: match.id });
    expect(first && second).toBeNull();
    expect(reclaimed).toMatchObject({ id: claimed?.id, matchId: match.id });
    await expect(outbox.markPublished({ outboxId: claimed!.id, leaseToken: originalWorker })).resolves.toBe(false);
  });

  it('keeps only the latest authoritative snapshot and version on a match', async () => {
    const match = await createMatch();

    await repository.withLockedMatch(match.id, async (tx, lockedMatch) => {
      expect(lockedMatch?.snapshot).toEqual({ version: 0 });
      await repository.updateCurrentSnapshot(tx, {
        matchId: match.id,
        snapshot: { version: 1, turn: 'user-2' },
        stateVersion: 1,
      });
    });

    await expect(repository.loadCurrentMatch(match.id)).resolves.toMatchObject({
      id: match.id,
      snapshot: { version: 1, turn: 'user-2' },
      stateVersion: 1,
    });
    expect(await database.prisma.match.count()).toBe(1);
  });

  it('appends ordered events without mutating earlier journal entries', async () => {
    const match = await createMatch();

    await repository.withLockedMatch(match.id, async (tx) => {
      await repository.appendOrderedEvents(tx, {
        matchId: match.id,
        events: [
          { sequence: 1, stateVersion: 1, payload: { type: 'ROLL_DICE', value: 6 } },
          { sequence: 2, stateVersion: 1, payload: { type: 'ENTER_PAWN', pawn: 0 } },
        ],
      });
    });

    await repository.withLockedMatch(match.id, async (tx) => {
      await repository.appendOrderedEvents(tx, {
        matchId: match.id,
        events: [{ sequence: 3, stateVersion: 2, payload: { type: 'MOVE_PAWN', pawn: 0 } }],
      });
    });

    const events = await database.prisma.matchEvent.findMany({
      where: { matchId: match.id },
      orderBy: { sequence: 'asc' },
    });
    expect(events.map(({ sequence, payload }) => ({ sequence, payload }))).toEqual([
      { sequence: 1, payload: { type: 'ROLL_DICE', value: 6 } },
      { sequence: 2, payload: { type: 'ENTER_PAWN', pawn: 0 } },
      { sequence: 3, payload: { type: 'MOVE_PAWN', pawn: 0 } },
    ]);
  });

  it('rejects a non-contiguous event batch without changing the sequence watermark', async () => {
    const match = await createMatch();

    await expect(
      repository.withLockedMatch(match.id, async (tx) =>
        repository.appendOrderedEvents(tx, {
          matchId: match.id,
          events: [{ sequence: 2, stateVersion: 1, payload: { type: 'ROLL_DICE' } }],
        }),
      ),
    ).rejects.toThrow('must begin at 1');

    await expect(repository.loadCurrentMatch(match.id)).resolves.toMatchObject({ lastSequence: 0 });
    await expect(database.prisma.matchEvent.count()).resolves.toBe(0);
  });

  it('rejects writes for a match other than the match row held by the transaction lock', async () => {
    const first = await createMatch();
    const second = await database.prisma.match.create({
      data: {
        roomKey: 'single-room',
        firstPlayerId: 'user-1',
        seatOrder: ['user-1', 'user-2'],
        snapshot: { version: 0 },
      },
    });

    await expect(
      repository.withLockedMatch(first.id, async (tx) =>
        repository.updateCurrentSnapshot(tx, {
          matchId: second.id,
          snapshot: { version: 1 },
          stateVersion: 1,
        }),
      ),
    ).rejects.toThrow('does not match the locked match');
    await expect(repository.loadCurrentMatch(second.id)).resolves.toMatchObject({ stateVersion: 0 });
  });

  it('stores processed actions durably with a match-scoped action identity', async () => {
    const first = await createMatch();
    const second = await database.prisma.match.create({
      data: {
        roomKey: 'single-room',
        firstPlayerId: 'user-1',
        seatOrder: ['user-1', 'user-2'],
        snapshot: { version: 0 },
      },
    });

    await repository.withLockedMatch(first.id, async (tx) => {
      await repository.recordProcessedAction(tx, {
        matchId: first.id,
        actionId: 'action-1',
        requestFingerprint: 'fingerprint-1',
        result: { ok: true, stateVersion: 1 },
      });
    });
    await repository.withLockedMatch(second.id, async (tx) => {
      await repository.recordProcessedAction(tx, {
        matchId: second.id,
        actionId: 'action-1',
        requestFingerprint: 'fingerprint-2',
        result: { ok: true, stateVersion: 1 },
      });
    });

    await expect(
      repository.withLockedMatch(first.id, async (tx) =>
        repository.recordProcessedAction(tx, {
          matchId: first.id,
          actionId: 'action-1',
          requestFingerprint: 'fingerprint-1',
          result: { ok: true, stateVersion: 1 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await database.prisma.processedAction.count()).toBe(2);
  });

  it('rolls back the snapshot, journal, action, and outbox row together on transaction failure', async () => {
    const match = await createMatch();

    await expect(
      repository.withLockedMatch(match.id, async (tx) => {
        await repository.updateCurrentSnapshot(tx, {
          matchId: match.id,
          snapshot: { version: 1 },
          stateVersion: 1,
        });
        await repository.appendOrderedEvents(tx, {
          matchId: match.id,
          events: [{ sequence: 1, stateVersion: 1, payload: { type: 'ROLL_DICE' } }],
        });
        await repository.recordProcessedAction(tx, {
          matchId: match.id,
          actionId: 'action-1',
          requestFingerprint: 'fingerprint-1',
          result: { ok: true },
        });
        await repository.insertOutboxRow(tx, {
          matchId: match.id,
          resultingStateVersion: 1,
          payload: { matchId: match.id, stateVersion: 1 },
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    await expect(repository.loadCurrentMatch(match.id)).resolves.toMatchObject({
      snapshot: { version: 0 },
      stateVersion: 0,
    });
    await expect(database.prisma.matchEvent.count()).resolves.toBe(0);
    await expect(database.prisma.processedAction.count()).resolves.toBe(0);
    await expect(database.prisma.outboxRow.count()).resolves.toBe(0);
  });

  it('keeps terminal snapshot and result durable when the room pointer is reset', async () => {
    const match = await createMatch();
    await database.prisma.room.update({
      where: { key: 'single-room' },
      data: { currentMatchId: match.id },
    });

    await repository.withLockedMatch(match.id, async (tx) => {
      await repository.updateCurrentSnapshot(tx, {
        matchId: match.id,
        snapshot: { version: 9, status: 'FINISHED' },
        stateVersion: 9,
        terminalResult: { winnerId: 'user-1' },
      });
      await tx.room.update({
        where: { key: 'single-room' },
        data: { currentMatchId: null },
      });
    });

    await expect(repository.loadCurrentMatch(match.id)).resolves.toMatchObject({
      status: 'FINISHED',
      snapshot: { version: 9, status: 'FINISHED' },
      terminalResult: { winnerId: 'user-1' },
    });
  });
});
