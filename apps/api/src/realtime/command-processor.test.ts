import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActiveGameState, transition as engineTransition } from '@zamanushka/game-engine';

import { createMatchRepository } from '../match/match-repository.js';
import { createTestDatabase } from '../test/test-database.js';
import { createCommandProcessor } from './command-processor.js';

const database = createTestDatabase();
const repository = createMatchRepository(database.prisma);

async function createMatch() {
  await database.prisma.room.create({ data: { key: 'single-room' } });
  const snapshot = createActiveGameState({
    playerCount: 2,
    seatOrder: ['user-1', 'user-2'],
    firstPlayerId: 'user-1',
  });
  return database.prisma.match.create({
    data: {
      roomKey: 'single-room',
      firstPlayerId: 'user-1',
      seatOrder: ['user-1', 'user-2'],
      snapshot,
    },
  });
}

function createProcessor(options?: { onTerminalMatch?: (input: { matchId: string }) => Promise<void> | void }) {
  const dice = vi.fn(() => 6 as const);
  const transition = vi.fn(engineTransition);
  return {
    dice,
    transition,
    processor: createCommandProcessor({ repository, rollDice: dice, transition, ...options }),
  };
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('transactional realtime command processor', () => {
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
      command: { type: 'ROLL_DICE', matchId: match.id, actionId: 'action-1', expectedStateVersion: 0 },
    });

    const result = await processor.process({
      authenticatedUserId: 'user-1',
      command: { type: 'SURRENDER', matchId: match.id, actionId: 'action-1', expectedStateVersion: 1 },
    });

    expect(result).toMatchObject({ ok: false, code: 'ACTION_ID_CONFLICT' });
    expect(await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      stateVersion: 1,
    });
  });

  it('rejects a stale version without changing durable state', async () => {
    const match = await createMatch();
    const { processor } = createProcessor();
    const before = await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } });

    const result = await processor.process({
      authenticatedUserId: 'user-1',
      command: { type: 'ROLL_DICE', matchId: match.id, actionId: 'action-1', expectedStateVersion: 9 },
    });

    expect(result).toMatchObject({ ok: false, code: 'STALE_STATE_VERSION', stateVersion: 0 });
    expect(await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toEqual(before);
    expect(await database.prisma.processedAction.count()).toBe(0);
  });

  it('preserves all durable state when the engine rejects a command', async () => {
    const match = await createMatch();
    const { processor } = createProcessor();
    const before = await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } });

    const result = await processor.process({
      authenticatedUserId: 'user-2',
      command: { type: 'ROLL_DICE', matchId: match.id, actionId: 'action-1', expectedStateVersion: 0 },
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(await database.prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toEqual(before);
    expect(await database.prisma.matchEvent.count()).toBe(0);
    expect(await database.prisma.processedAction.count()).toBe(0);
    expect(await database.prisma.outboxRow.count()).toBe(0);
  });

  it('retries the terminal boundary hook when a committed terminal action is replayed', async () => {
    const match = await createMatch();
    const onTerminalMatch = vi.fn().mockRejectedValueOnce(new Error('room reset unavailable'));
    const { processor } = createProcessor({ onTerminalMatch });
    const command = {
      type: 'SURRENDER' as const,
      matchId: match.id,
      actionId: 'terminal-action',
      expectedStateVersion: 0,
    };

    await expect(processor.process({ authenticatedUserId: 'user-1', command })).rejects.toThrow(
      'room reset unavailable',
    );
    await expect(processor.process({ authenticatedUserId: 'user-1', command })).resolves.toMatchObject({
      ok: true,
      stateVersion: 1,
    });

    expect(onTerminalMatch).toHaveBeenCalledTimes(2);
    expect(await database.prisma.processedAction.count()).toBe(1);
  });
});
