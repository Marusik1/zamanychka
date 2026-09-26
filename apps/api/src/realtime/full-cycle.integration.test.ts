import {
  createActiveGameState,
  getLegalActions,
  transition as engineTransition,
  type GameState,
  type LegalAction,
} from '@zamanushka/game-engine';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { BotRunner } from '../bots/bot-runner.js';
import { InMemoryBotMatchLease } from '../bots/redis-lease.js';
import { createBotRuntimeAdapter } from '../bots/runtime-adapter.js';
import { createMatchRepository } from '../match/match-repository.js';
import { createProfileRepository } from '../profile/profile-repository.js';
import { createProfileService } from '../profile/profile-service.js';
import { createMatchCompletionService } from '../rooms/match-completion.js';
import { createRoomRepository } from '../rooms/room-repository.js';
import { createRoomService, type RoomPresenceStore } from '../rooms/room-service.js';
import { createTestDatabase } from '../test/test-database.js';
import { createCommandProcessor } from './command-processor.js';

class InMemoryRoomPresenceStore implements RoomPresenceStore {
  private readonly states = new Map<string, Map<string, boolean>>();

  private room(roomId: string) {
    const current = this.states.get(roomId);
    if (current) return current;

    const created = new Map<string, boolean>();
    this.states.set(roomId, created);
    return created;
  }

  async connect(input: { roomId: string; userId: string }) {
    this.room(input.roomId).set(input.userId, true);
  }

  async disconnect(input: { roomId: string; userId: string }) {
    this.room(input.roomId).set(input.userId, false);
  }

  async snapshot(roomId: string) {
    return new Map(this.room(roomId));
  }
}

const database = createTestDatabase();
const roomRepository = createRoomRepository(database.prisma);
const matchRepository = createMatchRepository(database.prisma);
const profileRepository = createProfileRepository(database.prisma);
const profileService = createProfileService({ repository: profileRepository });

function createServices() {
  const presenceStore = new InMemoryRoomPresenceStore();
  const roomService = createRoomService({
    repository: roomRepository,
    presenceStore,
    selectFirstPlayerId: (participants) =>
      [...participants].sort((left, right) => left.seatIndex - right.seatIndex)[0]?.userId ?? '',
  });
  const matchCompletion = createMatchCompletionService({ repository: roomRepository });
  const queuedRolls: Array<1 | 2 | 3 | 4 | 5 | 6> = [];
  const processor = createCommandProcessor({
    repository: matchRepository,
    rollDice: () => {
      const next = queuedRolls.shift();
      if (!next) {
        throw new Error('TEST_ROLL_QUEUE_EMPTY');
      }
      return next;
    },
    onTerminalMatch: async ({ tx, matchId }) => {
      await matchCompletion.completeTerminalMatchInTransaction(tx, matchId);
    },
  });

  return { presenceStore, roomService, queuedRolls, processor };
}

async function seedUsers(ids: readonly string[]) {
  await database.prisma.user.createMany({
    data: ids.map((id, index) => ({
      id,
      firstName: `User ${index + 1}`,
    })),
    skipDuplicates: true,
  });
}

async function roomVersion(roomId: string) {
  const room = await roomRepository.loadRoom(roomId);
  if (!room) throw new Error(`ROOM_NOT_FOUND:${roomId}`);
  return room.version;
}

async function setupLobby(input: {
  roomService: ReturnType<typeof createServices>['roomService'];
  roomOwnerId: string;
  participantIds: readonly string[];
  seatIndices: readonly (0 | 1 | 2 | 3)[];
}) {
  const { roomService, roomOwnerId, participantIds, seatIndices } = input;
  const created = await roomService.createRoom(roomOwnerId, {});
  const roomId = created.id;

  for (const participantId of participantIds.slice(1)) {
    const joined = await roomService.joinRoom(participantId, roomId, {});
    expect(joined).toMatchObject({ ok: true });
  }

  for (const [index, participantId] of participantIds.entries()) {
    const seated = await roomService.takeSeat(participantId, roomId, {
      seatIndex: seatIndices[index] ?? 0,
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(seated).toMatchObject({ ok: true });
    await roomService.connectPresence(participantId, roomId);
    const ready = await roomService.setReady(participantId, roomId, {
      ready: true,
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(ready).toMatchObject({ ok: true });
  }

  return roomId;
}

async function waitForCondition(assertion: () => Promise<boolean>, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let lastResult = false;
  while (Date.now() < deadline) {
    lastResult = await assertion();
    if (lastResult) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(lastResult).toBe(true);
}

function scorePosition(position: GameState['pawns'][number]['position']) {
  switch (position.zone) {
    case 'OFF_BOARD':
      return 0;
    case 'PERIMETER':
      return 10 + position.progress;
    case 'HOME':
      return 100 + position.homeIndex * 10;
    case 'REMOVED':
      return -1000;
  }
}

function scoreState(state: GameState, playerId: string) {
  if (state.status === 'FINISHED' && state.winnerPlayerId === playerId) {
    return Number.POSITIVE_INFINITY;
  }

  return state.pawns
    .filter((pawn) => pawn.playerId === playerId)
    .reduce((total, pawn) => total + scorePosition(pawn.position), 0);
}

function toActionCommand(
  matchId: string,
  stateVersion: number,
  actorPlayerId: string,
  action: Extract<LegalAction, { type: 'ENTER_PAWN' | 'MOVE_PAWN' }>,
) {
  return {
    type: action.type,
    matchId,
    actionId: `sim-${matchId}-${stateVersion}-${action.pawnId}`,
    expectedStateVersion: stateVersion,
    pawnId: action.pawnId,
    actorPlayerId,
  } as const;
}

function planNextTurn(state: GameState, preferredWinnerId: string) {
  const actorPlayerId = state.currentPlayerId;
  if (!actorPlayerId) throw new Error('MATCH_ALREADY_TERMINAL');

  if (actorPlayerId !== preferredWinnerId) {
    return { diceValue: 1 as const, action: null };
  }

  let best:
    | {
        diceValue: 1 | 2 | 3 | 4 | 5 | 6;
        action: Extract<LegalAction, { type: 'ENTER_PAWN' | 'MOVE_PAWN' }>;
        score: number;
      }
    | null = null;

  for (const diceValue of [1, 2, 3, 4, 5, 6] as const) {
    const rolled = engineTransition(
      state,
      {
        type: 'ROLL_DICE',
        matchId: 'planning',
        expectedStateVersion: state.stateVersion,
        actorPlayerId,
      },
      { actorPlayerId, diceValue },
    );

    if (!rolled.ok) continue;

    const actions = getLegalActions(rolled.state, actorPlayerId).filter(
      (action): action is Extract<LegalAction, { type: 'ENTER_PAWN' | 'MOVE_PAWN' }> =>
        action.type === 'ENTER_PAWN' || action.type === 'MOVE_PAWN',
    );

    for (const action of actions) {
      const moved = engineTransition(
        rolled.state,
        toActionCommand('planning', rolled.state.stateVersion, actorPlayerId, action),
        { actorPlayerId },
      );
      if (!moved.ok) continue;

      const score = scoreState(moved.state, preferredWinnerId);
      if (!best || score > best.score) {
        best = { diceValue, action, score };
      }
    }
  }

  if (!best) {
    throw new Error(`NO_PRODUCTIVE_PLAN:${preferredWinnerId}:${state.stateVersion}`);
  }

  return best;
}

async function loadSnapshot(matchId: string) {
  const match = await database.prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  return match.snapshot as unknown as GameState;
}

async function playHomeDiagonalCompletedScenario(input: {
  processor: ReturnType<typeof createServices>['processor'];
  queuedRolls: ReturnType<typeof createServices>['queuedRolls'];
  matchId: string;
  winnerId: string;
  loserId: string;
}) {
  const { processor, queuedRolls, matchId, winnerId, loserId } = input;
  let state = await loadSnapshot(matchId);
  let commandCount = 0;

  while (state.status === 'ACTIVE') {
    const plan = planNextTurn(state, winnerId);

    queuedRolls.push(plan.diceValue);
    const rolled = await processor.process({
      authenticatedUserId: state.currentPlayerId,
      command: {
        type: 'ROLL_DICE',
        matchId,
        actionId: `action-${commandCount + 1}`,
        expectedStateVersion: state.stateVersion,
      },
    });
    expect(rolled).toMatchObject({ ok: true });
    if (!rolled.ok) throw new Error('ROLL_FAILED');
    commandCount += 1;
    state = rolled.snapshot as GameState;

    if (plan.action) {
      const resolvedAction = getLegalActions(state, winnerId).find(
        (candidate) =>
          candidate.type === plan.action.type &&
          'pawnId' in candidate &&
          candidate.pawnId === plan.action.pawnId,
      );
      expect(resolvedAction).toBeDefined();
      if (!resolvedAction || resolvedAction.type === 'ROLL_DICE' || resolvedAction.type === 'SURRENDER') {
        throw new Error('PLANNED_ACTION_MISSING');
      }

      const moved = await processor.process({
        authenticatedUserId: winnerId,
        command: {
          type: resolvedAction.type,
          matchId,
          actionId: `action-${commandCount + 1}`,
          expectedStateVersion: state.stateVersion,
          pawnId: resolvedAction.pawnId,
        },
      });
      expect(moved).toMatchObject({ ok: true });
      if (!moved.ok) throw new Error('MOVE_FAILED');
      commandCount += 1;
      state = moved.snapshot as GameState;
    } else {
      expect(state.currentPlayerId).toBe(winnerId);
      expect(state.turnPhase).toBe('WAITING_FOR_ROLL');
      expect(state.diceValue).toBeNull();
    }

    expect(commandCount).toBeLessThan(400);
  }

  expect(state).toMatchObject({
    status: 'FINISHED',
    winnerPlayerId: winnerId,
    winReason: 'HOME_DIAGONAL_COMPLETED',
  });

  return { commandCount, finalState: state };
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('beta full-cycle gameplay', () => {
  it('lets a room BOT execute visible-flow commands through the normal command processor', async () => {
    await seedUsers(['user-a']);
    const { roomService, processor, queuedRolls } = createServices();

    const room = await roomService.createRoom('user-a', {});
    const botSeat = await roomService.addBot('user-a', room.id, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(botSeat).toMatchObject({ ok: true });

    const humanSeat = await roomService.takeSeat('user-a', room.id, {
      seatIndex: 1,
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(humanSeat).toMatchObject({ ok: true });
    await roomService.connectPresence('user-a', room.id);
    const ready = await roomService.setReady('user-a', room.id, {
      ready: true,
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(ready).toMatchObject({ ok: true });

    const started = await roomService.startMatch('user-a', room.id, {
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error('ROOM_BOT_START_FAILED');

    const initial = await matchRepository.loadCurrentMatch(started.matchId);
    expect(initial?.snapshot).toMatchObject({
      currentPlayerId: expect.stringContaining('bot:'),
      players: expect.arrayContaining([
        expect.objectContaining({ participantKind: 'BOT' }),
        expect.objectContaining({ playerId: 'user-a', participantKind: 'HUMAN' }),
      ]),
    });

    queuedRolls.push(6, 1);
    const runner = new BotRunner(
      createBotRuntimeAdapter({
        matchRepository,
        processCommand: (input) => processor.process(input),
      }),
      new InMemoryBotMatchLease(),
      {
        minDelayMs: 1,
        maxDelayMs: 1,
        followupMinDelayMs: 1,
        followupMaxDelayMs: 1,
      },
    );

    runner.kick(started.matchId);

    await waitForCondition(async () => {
      const current = await matchRepository.loadCurrentMatch(started.matchId);
      const state = current?.snapshot as GameState | undefined;
      const botPlayer = state?.players.find((player) => player.participantKind === 'BOT');
      const botPawn = state?.pawns.find(
        (pawn) => botPlayer && pawn.playerId === botPlayer.playerId && pawn.position.zone !== 'OFF_BOARD',
      );
      return Boolean(
        state &&
          state.stateVersion >= 4 &&
          state.currentPlayerId === 'user-a' &&
          state.turnPhase === 'WAITING_FOR_ROLL' &&
          botPawn,
      );
    });
  });

  it('wakes a room BOT after a HUMAN command advances the turn to the bot', async () => {
    await seedUsers(['user-a']);
    const { roomService, processor, queuedRolls } = createServices();

    const room = await roomService.createRoom('user-a', {});
    const humanSeat = await roomService.takeSeat('user-a', room.id, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(humanSeat).toMatchObject({ ok: true });
    await roomService.connectPresence('user-a', room.id);
    const ready = await roomService.setReady('user-a', room.id, {
      ready: true,
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(ready).toMatchObject({ ok: true });
    const botSeat = await roomService.addBot('user-a', room.id, {
      seatIndex: 1,
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(botSeat).toMatchObject({ ok: true });

    const started = await roomService.startMatch('user-a', room.id, {
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error('ROOM_HUMAN_BOT_START_FAILED');

    queuedRolls.push(1);
    const humanRoll = await processor.process({
      authenticatedUserId: 'user-a',
      command: {
        type: 'ROLL_DICE',
        matchId: started.matchId,
        actionId: 'human-roll-no-move',
        expectedStateVersion: 0,
      },
    });
    expect(humanRoll).toMatchObject({ ok: true });
    if (!humanRoll.ok) throw new Error('HUMAN_ROLL_FAILED');
    expect(humanRoll.snapshot).toMatchObject({
      currentPlayerId: expect.stringContaining('bot:'),
      turnPhase: 'WAITING_FOR_ROLL',
    });

    queuedRolls.push(6, 1);
    const runner = new BotRunner(
      createBotRuntimeAdapter({
        matchRepository,
        processCommand: (input) => processor.process(input),
      }),
      new InMemoryBotMatchLease(),
      {
        minDelayMs: 1,
        maxDelayMs: 1,
        followupMinDelayMs: 1,
        followupMaxDelayMs: 1,
      },
    );

    runner.kick(started.matchId);

    await waitForCondition(async () => {
      const current = await matchRepository.loadCurrentMatch(started.matchId);
      const state = current?.snapshot as GameState | undefined;
      const botPlayer = state?.players.find((player) => player.participantKind === 'BOT');
      const botPawn = state?.pawns.find(
        (pawn) => botPlayer && pawn.playerId === botPlayer.playerId && pawn.position.zone !== 'OFF_BOARD',
      );
      return Boolean(
        state &&
          state.stateVersion >= 5 &&
          state.currentPlayerId === 'user-a' &&
          state.turnPhase === 'WAITING_FOR_ROLL' &&
          botPawn,
      );
    });
  });

  it('reaches HOME_DIAGONAL_COMPLETED through real room, match, and gameplay commands, then persists results and resets only its room', async () => {
    await seedUsers(['user-a', 'user-b', 'user-c', 'user-d']);
    const { roomService, processor, queuedRolls } = createServices();

    const roomA = await setupLobby({
      roomService,
      roomOwnerId: 'user-a',
      participantIds: ['user-a', 'user-b'],
      seatIndices: [0, 1],
    });
    const roomB = await setupLobby({
      roomService,
      roomOwnerId: 'user-c',
      participantIds: ['user-c', 'user-d'],
      seatIndices: [0, 1],
    });

    const started = await roomService.startMatch('user-a', roomA, {
      expectedRoomVersion: await roomVersion(roomA),
    });
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error('ROOM_A_START_FAILED');

    const { commandCount } = await playHomeDiagonalCompletedScenario({
      processor,
      queuedRolls,
      matchId: started.matchId,
      winnerId: 'user-a',
      loserId: 'user-b',
    });

    const match = await database.prisma.match.findUniqueOrThrow({ where: { id: started.matchId } });
    expect(match).toMatchObject({
      status: 'FINISHED',
      terminalResult: { winnerPlayerId: 'user-a', reason: 'HOME_DIAGONAL_COMPLETED' },
    });

    await expect(
      database.prisma.matchResult.findUniqueOrThrow({
        where: { matchId: started.matchId },
        include: { participants: { orderBy: { userId: 'asc' } } },
      }),
    ).resolves.toMatchObject({
      roomKey: roomA,
      winnerUserId: 'user-a',
      victoryReason: 'HOME_DIAGONAL_COMPLETED',
      participantCount: 2,
      participants: [
        { userId: 'user-a', outcome: 'WIN' },
        { userId: 'user-b', outcome: 'LOSS' },
      ],
    });

    await expect(profileService.loadProfile('user-a')).resolves.toMatchObject({
      stats: { gamesPlayed: 1, wins: 1, losses: 0 },
      recentResults: [
        {
          matchId: started.matchId,
          victoryReason: 'HOME_DIAGONAL_COMPLETED',
          currentUserOutcome: 'WIN',
        },
      ],
    });
    await expect(profileService.loadProfile('user-b')).resolves.toMatchObject({
      stats: { gamesPlayed: 1, wins: 0, losses: 1 },
      recentResults: [
        {
          matchId: started.matchId,
          victoryReason: 'HOME_DIAGONAL_COMPLETED',
          currentUserOutcome: 'LOSS',
        },
      ],
    });

    await expect(profileService.loadHistory({ userId: 'user-a' })).resolves.toMatchObject({
      items: [{ matchId: started.matchId, victoryReason: 'HOME_DIAGONAL_COMPLETED', currentUserOutcome: 'WIN' }],
    });
    await expect(profileService.loadHistory({ userId: 'user-b' })).resolves.toMatchObject({
      items: [{ matchId: started.matchId, victoryReason: 'HOME_DIAGONAL_COMPLETED', currentUserOutcome: 'LOSS' }],
    });

    expect(await roomRepository.loadRoom(roomA)).toMatchObject({
      status: 'WAITING',
      currentMatchId: null,
      seats: [
        { seatIndex: 0, userId: 'user-a', participantId: 'user-a', participantKind: 'HUMAN', ready: false },
        { seatIndex: 1, userId: 'user-b', participantId: 'user-b', participantKind: 'HUMAN', ready: false },
        { seatIndex: 2, userId: null, participantId: null, participantKind: null, ready: false },
        { seatIndex: 3, userId: null, participantId: null, participantKind: null, ready: false },
      ],
      members: [
        { userId: 'user-a' },
        { userId: 'user-b' },
      ],
    });
    expect(await roomRepository.loadRoom(roomB)).toMatchObject({
      status: 'WAITING',
      currentMatchId: null,
      seats: [
        { seatIndex: 0, userId: 'user-c', participantId: 'user-c', participantKind: 'HUMAN', ready: true },
        { seatIndex: 1, userId: 'user-d', participantId: 'user-d', participantKind: 'HUMAN', ready: true },
        { seatIndex: 2, userId: null, participantId: null, participantKind: null, ready: false },
        { seatIndex: 3, userId: null, participantId: null, participantKind: null, ready: false },
      ],
    });

    const reseat = await roomService.takeSeat('user-a', roomA, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(roomA),
    });
    expect(reseat).toMatchObject({ ok: true });

    expect(commandCount).toBeGreaterThan(0);
  });

  it('reaches LAST_ACTIVE_PLAYER through real surrender and persists results, room reset, and idempotent terminal durability', async () => {
    await seedUsers(['user-a', 'user-b']);
    const { roomService, processor } = createServices();

    const roomId = await setupLobby({
      roomService,
      roomOwnerId: 'user-a',
      participantIds: ['user-a', 'user-b'],
      seatIndices: [0, 1],
    });

    const started = await roomService.startMatch('user-a', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error('ROOM_START_FAILED');

    const first = await processor.process({
      authenticatedUserId: 'user-b',
      command: {
        type: 'SURRENDER',
        matchId: started.matchId,
        actionId: 'terminal-surrender',
        expectedStateVersion: 0,
      },
    });
    expect(first).toMatchObject({
      ok: true,
      snapshot: {
        status: 'FINISHED',
        winnerPlayerId: 'user-a',
        winReason: 'LAST_ACTIVE_PLAYER',
      },
    });
    if (!first.ok) throw new Error('SURRENDER_FAILED');

    const retry = await processor.process({
      authenticatedUserId: 'user-b',
      command: {
        type: 'SURRENDER',
        matchId: started.matchId,
        actionId: 'terminal-surrender',
        expectedStateVersion: 0,
      },
    });
    expect(retry).toEqual(first);

    const finalMatch = await database.prisma.match.findUniqueOrThrow({ where: { id: started.matchId } });
    expect(finalMatch).toMatchObject({
      status: 'FINISHED',
      terminalResult: { winnerPlayerId: 'user-a', reason: 'LAST_ACTIVE_PLAYER' },
    });

    await expect(
      database.prisma.matchResult.findUniqueOrThrow({
        where: { matchId: started.matchId },
        include: { participants: { orderBy: { userId: 'asc' } } },
      }),
    ).resolves.toMatchObject({
      winnerUserId: 'user-a',
      victoryReason: 'LAST_ACTIVE_PLAYER',
      participantCount: 2,
      participants: [
        { userId: 'user-a', outcome: 'WIN' },
        { userId: 'user-b', outcome: 'SURRENDERED' },
      ],
    });

    await expect(profileService.loadProfile('user-a')).resolves.toMatchObject({
      stats: { gamesPlayed: 1, wins: 1, losses: 0 },
      recentResults: [
        {
          matchId: started.matchId,
          victoryReason: 'LAST_ACTIVE_PLAYER',
          currentUserOutcome: 'WIN',
        },
      ],
    });
    await expect(profileService.loadProfile('user-b')).resolves.toMatchObject({
      stats: { gamesPlayed: 1, wins: 0, losses: 1 },
      recentResults: [
        {
          matchId: started.matchId,
          victoryReason: 'LAST_ACTIVE_PLAYER',
          currentUserOutcome: 'SURRENDERED',
        },
      ],
    });

    await expect(profileService.loadHistory({ userId: 'user-a' })).resolves.toMatchObject({
      items: [{ matchId: started.matchId, currentUserOutcome: 'WIN', victoryReason: 'LAST_ACTIVE_PLAYER' }],
    });
    await expect(profileService.loadHistory({ userId: 'user-b' })).resolves.toMatchObject({
      items: [{ matchId: started.matchId, currentUserOutcome: 'SURRENDERED', victoryReason: 'LAST_ACTIVE_PLAYER' }],
    });

    expect(await database.prisma.matchResult.count({ where: { matchId: started.matchId } })).toBe(1);
    expect(await roomRepository.loadRoom(roomId)).toMatchObject({
      status: 'WAITING',
      currentMatchId: null,
      seats: [
        { seatIndex: 0, userId: 'user-a', participantId: 'user-a', participantKind: 'HUMAN', ready: false },
        { seatIndex: 1, userId: 'user-b', participantId: 'user-b', participantKind: 'HUMAN', ready: false },
        { seatIndex: 2, userId: null, participantId: null, participantKind: null, ready: false },
        { seatIndex: 3, userId: null, participantId: null, participantKind: null, ready: false },
      ],
      members: [
        { userId: 'user-a' },
        { userId: 'user-b' },
      ],
    });
  });
});
