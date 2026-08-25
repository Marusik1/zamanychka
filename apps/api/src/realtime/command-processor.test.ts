import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActiveGameState, transition as engineTransition } from '@zamanushka/game-engine';
import type { Prisma } from '../generated/prisma/client.js';

import { createMatchRepository } from '../match/match-repository.js';
import { createMatchCompletionService } from '../rooms/match-completion.js';
import { createRoomRepository } from '../rooms/room-repository.js';
import { createTestDatabase } from '../test/test-database.js';
import { createCommandProcessor } from './command-processor.js';

const database = createTestDatabase();
const repository = createMatchRepository(database.prisma);
const roomRepository = createRoomRepository(database.prisma);

async function createMatch() {
  await database.prisma.user.createMany({
    data: [
      { id: 'user-1', firstName: 'User 1' },
      { id: 'user-2', firstName: 'User 2' },
    ],
  });
  await database.prisma.room.create({
    data: {
      key: 'single-room',
      seats: {
        create: [
          { seatIndex: 0, userId: 'user-1', ready: true },
          { seatIndex: 1, userId: 'user-2', ready: true },
          { seatIndex: 2, ready: false },
          { seatIndex: 3, ready: false },
        ],
      },
    },
  });
  const snapshot = createActiveGameState({
    playerCount: 2,
    seatOrder: ['user-1', 'user-2'],
    firstPlayerId: 'user-1',
  });
  const match = await database.prisma.match.create({
    data: {
      roomKey: 'single-room',
      firstPlayerId: 'user-1',
      seatOrder: ['user-1', 'user-2'],
      snapshot,
    },
  });
  await database.prisma.room.update({
    where: { key: 'single-room' },
    data: { currentMatchId: match.id },
  });
  return match;
}

async function prepareHomeDiagonalWin(matchId: string) {
  const match = await database.prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  const state = match.snapshot as unknown as ReturnType<typeof createActiveGameState>;
  const snapshot = {
    ...state,
    diceValue: 1 as const,
    turnPhase: 'WAITING_FOR_ACTION' as const,
    pawns: state.pawns.map((pawn) => {
      if (pawn.pawnId === 'user-1-pawn-1')
        return { ...pawn, position: { zone: 'HOME' as const, homeIndex: 1 as const } };
      if (pawn.pawnId === 'user-1-pawn-2')
        return { ...pawn, position: { zone: 'HOME' as const, homeIndex: 2 as const } };
      if (pawn.pawnId === 'user-1-pawn-3')
        return { ...pawn, position: { zone: 'HOME' as const, homeIndex: 3 as const } };
      if (pawn.pawnId === 'user-1-pawn-4')
        return { ...pawn, position: { zone: 'PERIMETER' as const, progress: 27 } };
      return pawn;
    }),
  };
  await database.prisma.match.update({ where: { id: matchId }, data: { snapshot } });
}

function createProcessor(options?: {
  onTerminalMatch?: Parameters<typeof createCommandProcessor>[0]['onTerminalMatch'];
}) {
  const dice = vi.fn(() => 6 as const);
  const transition = vi.fn(engineTransition);
  const completion = createMatchCompletionService({ repository: roomRepository });
  return {
    dice,
    transition,
    processor: createCommandProcessor({
      repository,
      rollDice: dice,
      transition,
      onTerminalMatch:
        options?.onTerminalMatch ??
        (async ({ tx, matchId }) => {
          await completion.completeTerminalMatchInTransaction(tx, matchId);
        }),
    }),
  };
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('transactional realtime command processor', () => {
  it('persists HOME_DIAGONAL_COMPLETED and resets only its matching room inside PostgreSQL', async () => {
    const match = await createMatch();
    await prepareHomeDiagonalWin(match.id);
    const completion = createMatchCompletionService({ repository: roomRepository });
    const { processor } = createProcessor({
      onTerminalMatch: async ({ tx, matchId }) => {
        await completion.completeTerminalMatchInTransaction(tx, matchId);
      },
    });

    await expect(
      processor.process({
        authenticatedUserId: 'user-1',
        command: {
          type: 'MOVE_PAWN',
          matchId: match.id,
          actionId: 'home-win',
          expectedStateVersion: 0,
          pawnId: 'user-1-pawn-4',
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      snapshot: { status: 'FINISHED', winReason: 'HOME_DIAGONAL_COMPLETED' },
    });

    await expect(
      database.prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
    ).resolves.toMatchObject({
      status: 'FINISHED',
      terminalResult: { winnerPlayerId: 'user-1', reason: 'HOME_DIAGONAL_COMPLETED' },
    });
    expect(await database.prisma.outboxRow.count({ where: { matchId: match.id } })).toBe(1);
    expect(await roomRepository.loadSingletonRoom()).toMatchObject({ currentMatchId: null });
  });

  it('replays an exact committed retry without rerunning RNG or the game engine', async () => {
    const match = await createMatch();
    const { processor, dice, transition } = createProcessor();
    const command = {
      type: 'ROLL_DICE' as const,
      matchId: match.id,
      actionId: 'action-1',
      expectedStateVersion: 0,
    };

    const first = await processor.process({ authenticatedUserId: 'user-1', command });
    const retry = await processor.process({ authenticatedUserId: 'user-1', command });

    expect(retry).toEqual(first);
    expect(dice).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledTimes(1);
    expect(await database.prisma.processedAction.count()).toBe(1);
  });

  it('rejects a reused action id with a conflicting fingerprint before mutation', async () => {
    const match = await createMatch();
    const { processor } = createProcessor();
    await processor.process({
      authenticatedUserId: 'user-1',
      command: {
        type: 'ROLL_DICE',
        matchId: match.id,
        actionId: 'action-1',
        expectedStateVersion: 0,
      },
    });

    const result = await processor.process({
      authenticatedUserId: 'user-1',
      command: {
        type: 'SURRENDER',
        matchId: match.id,
        actionId: 'action-1',
        expectedStateVersion: 1,
      },
    });

    expect(result).toMatchObject({ ok: false, code: 'ACTION_ID_CONFLICT' });
    expect(
      await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
    ).toMatchObject({
      stateVersion: 1,
    });
  });

  it('rejects a stale version without changing durable state', async () => {
    const match = await createMatch();
    const { processor } = createProcessor();
    const before = await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } });

    const result = await processor.process({
      authenticatedUserId: 'user-1',
      command: {
        type: 'ROLL_DICE',
        matchId: match.id,
        actionId: 'action-1',
        expectedStateVersion: 9,
      },
    });

    expect(result).toMatchObject({ ok: false, code: 'STALE_STATE_VERSION', stateVersion: 0 });
    expect(await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toEqual(
      before,
    );
    expect(await database.prisma.processedAction.count()).toBe(0);
  });

  it('preserves all durable state when the engine rejects a command', async () => {
    const match = await createMatch();
    const { processor } = createProcessor();
    const before = await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } });

    const result = await processor.process({
      authenticatedUserId: 'user-2',
      command: {
        type: 'ROLL_DICE',
        matchId: match.id,
        actionId: 'action-1',
        expectedStateVersion: 0,
      },
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toEqual(
      before,
    );
    expect(await database.prisma.matchEvent.count()).toBe(0);
    expect(await database.prisma.processedAction.count()).toBe(0);
    expect(await database.prisma.outboxRow.count()).toBe(0);
  });

  it('persists a terminal surrender, outbox, and matching EPIC-04 room reset atomically', async () => {
    const match = await createMatch();
    const completion = createMatchCompletionService({ repository: roomRepository });
    const onTerminalMatch = vi.fn(
      async (input: {
        tx: Parameters<typeof completion.completeTerminalMatchInTransaction>[0];
        matchId: string;
      }) => {
        await completion.completeTerminalMatchInTransaction(input.tx, input.matchId);
      },
    );
    const { processor } = createProcessor({ onTerminalMatch });
    const command = {
      type: 'SURRENDER' as const,
      matchId: match.id,
      actionId: 'terminal-action',
      expectedStateVersion: 0,
    };

    const first = await processor.process({ authenticatedUserId: 'user-1', command });
    expect(first).toMatchObject({
      ok: true,
      stateVersion: 1,
    });
    expect(
      await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
    ).toMatchObject({
      status: 'FINISHED',
      terminalResult: { winnerPlayerId: 'user-2', reason: 'LAST_ACTIVE_PLAYER' },
    });
    expect(
      await database.prisma.matchEvent.count({ where: { matchId: match.id } }),
    ).toBeGreaterThan(0);
    expect(await database.prisma.processedAction.count({ where: { matchId: match.id } })).toBe(1);
    expect(await database.prisma.outboxRow.count({ where: { matchId: match.id } })).toBe(1);
    expect(await roomRepository.loadSingletonRoom()).toMatchObject({
      currentMatchId: null,
      seats: [
        { seatIndex: 0, userId: null, ready: false },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
    });

    await expect(processor.process({ authenticatedUserId: 'user-1', command })).resolves.toEqual(
      first,
    );
    expect(onTerminalMatch).toHaveBeenCalledTimes(1);
    expect(await database.prisma.processedAction.count()).toBe(1);
  });

  it('rolls back terminal match, events, action, outbox, and room when reset fails', async () => {
    const match = await createMatch();
    const { processor } = createProcessor({
      onTerminalMatch: () => {
        throw new Error('room reset failed');
      },
    });

    await expect(
      processor.process({
        authenticatedUserId: 'user-1',
        command: {
          type: 'SURRENDER',
          matchId: match.id,
          actionId: 'terminal-action',
          expectedStateVersion: 0,
        },
      }),
    ).rejects.toThrow('room reset failed');

    await expect(
      database.prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
    ).resolves.toMatchObject({ status: 'ACTIVE', stateVersion: 0 });
    expect(await database.prisma.matchEvent.count()).toBe(0);
    expect(await database.prisma.processedAction.count()).toBe(0);
    expect(await database.prisma.outboxRow.count()).toBe(0);
    expect(await roomRepository.loadSingletonRoom()).toMatchObject({ currentMatchId: match.id });
  });

  it('rolls back a terminal transition and room reset when outbox persistence fails', async () => {
    const match = await createMatch();
    const completion = createMatchCompletionService({ repository: roomRepository });
    const insertOutboxRow = vi
      .spyOn(repository, 'insertOutboxRow')
      .mockRejectedValueOnce(new Error('outbox failed'));
    const { processor } = createProcessor({
      onTerminalMatch: async ({ tx, matchId }) => {
        await completion.completeTerminalMatchInTransaction(tx, matchId);
      },
    });

    await expect(
      processor.process({
        authenticatedUserId: 'user-1',
        command: {
          type: 'SURRENDER',
          matchId: match.id,
          actionId: 'terminal-action',
          expectedStateVersion: 0,
        },
      }),
    ).rejects.toThrow('outbox failed');

    expect(insertOutboxRow).toHaveBeenCalledTimes(1);
    await expect(
      database.prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
    ).resolves.toMatchObject({ status: 'ACTIVE', stateVersion: 0 });
    expect(await database.prisma.matchEvent.count()).toBe(0);
    expect(await database.prisma.processedAction.count()).toBe(0);
    expect(await database.prisma.outboxRow.count()).toBe(0);
    expect(await roomRepository.loadSingletonRoom()).toMatchObject({ currentMatchId: match.id });
  });

  it('does not reset a newer room match when a stale terminal match completes', async () => {
    const matchA = await createMatch();
    const matchB = await database.prisma.match.create({
      data: {
        roomKey: 'single-room',
        firstPlayerId: 'user-1',
        seatOrder: ['user-1', 'user-2'],
        snapshot: matchA.snapshot as Prisma.InputJsonValue,
      },
    });
    await database.prisma.room.update({
      where: { key: 'single-room' },
      data: { currentMatchId: matchB.id },
    });
    const completion = createMatchCompletionService({ repository: roomRepository });
    const { processor } = createProcessor({
      onTerminalMatch: async ({ tx, matchId }) => {
        await completion.completeTerminalMatchInTransaction(tx, matchId);
      },
    });

    await expect(
      processor.process({
        authenticatedUserId: 'user-1',
        command: {
          type: 'SURRENDER',
          matchId: matchA.id,
          actionId: 'terminal-action',
          expectedStateVersion: 0,
        },
      }),
    ).resolves.toMatchObject({ ok: true, snapshot: { status: 'FINISHED' } });

    await expect(
      database.prisma.match.findUniqueOrThrow({ where: { id: matchA.id } }),
    ).resolves.toMatchObject({ status: 'FINISHED' });
    expect(await database.prisma.outboxRow.count({ where: { matchId: matchA.id } })).toBe(1);
    expect(await roomRepository.loadSingletonRoom()).toMatchObject({
      currentMatchId: matchB.id,
      seats: expect.arrayContaining([
        { seatIndex: 0, userId: 'user-1', ready: true },
        { seatIndex: 1, userId: 'user-2', ready: true },
      ]),
    });
  });
});
