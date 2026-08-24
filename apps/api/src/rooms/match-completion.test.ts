import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoomRepository } from './room-repository.js';
import { createRoomService, type RoomPresenceStore } from './room-service.js';
import { createMatchCompletionService } from './match-completion.js';
import { createTestDatabase } from '../test/test-database.js';

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
const repository = createRoomRepository(database.prisma);

function createLobbyService() {
  return createRoomService({
    repository,
    presenceStore: new InMemoryRoomPresenceStore(),
  });
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

async function startCanonicalMatch(playerIds: string[]) {
  await database.prisma.user.createMany({
    data: playerIds.map((id, index) => ({ id, firstName: `User ${index + 1}` })),
  });

  const lobby = createLobbyService();
  for (const [index, userId] of playerIds.entries()) {
    await lobby.takeSeat(userId, { seatIndex: index as 0 | 1 | 2 | 3 });
    await lobby.connectPresence(userId);
    await lobby.setReady(userId, { ready: true });
  }

  const started = await lobby.startMatch(playerIds[0] ?? '', {});
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error('match start failed in test fixture');
  return started.matchId;
}

describe('match completion', () => {
  it('clears currentMatchId and empties all seats after terminal completion', async () => {
    const matchId = await startCanonicalMatch(['user-1', 'user-2']);
    await database.prisma.match.update({
      where: { id: matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });
    const result = await completion.completeTerminalMatch(matchId);

    expect(result).toEqual({
      ok: true,
      matchId,
      room: {
        roomId: 'single-room',
        version: expect.any(Number),
        currentMatchId: null,
        participants: [],
      },
    });

    const room = await repository.loadSingletonRoom();
    expect(room?.roomId).toBe('single-room');
    expect(room?.currentMatchId).toBeNull();
    expect(room?.seats).toEqual([
      { seatIndex: 0, userId: null, ready: false },
      { seatIndex: 1, userId: null, ready: false },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);

    const match = await database.prisma.match.findUnique({ where: { id: matchId } });
    expect(match?.status).toBe('FINISHED');
    expect(match?.roomKey).toBe('single-room');
  });

  it('does not release room for a non-terminal match or an unrelated match', async () => {
    const matchId = await startCanonicalMatch(['user-1', 'user-2']);
    const completion = createMatchCompletionService({ repository });

    await expect(completion.completeTerminalMatch(matchId)).resolves.toEqual({
      ok: false,
      error: {
        code: 'MATCH_NOT_TERMINAL',
        message: 'Match is not terminal',
      },
    });

    await database.prisma.match.update({
      where: { id: matchId },
      data: { status: 'FINISHED' },
    });
    await expect(completion.completeTerminalMatch('unknown-match')).resolves.toEqual({
      ok: false,
      error: {
        code: 'MATCH_NOT_FOUND',
        message: 'Match was not found',
      },
    });

    const room = await repository.loadSingletonRoom();
    expect(room?.currentMatchId).toBe(matchId);
  });

  it('allows a rematch after terminal completion and blocks stale completion for the old match', async () => {
    const matchA = await startCanonicalMatch(['user-1', 'user-2']);
    await database.prisma.match.update({
      where: { id: matchA },
      data: { status: 'FINISHED' },
    });
    const completion = createMatchCompletionService({ repository });
    await expect(completion.completeTerminalMatch(matchA)).resolves.toEqual(
      expect.objectContaining({ ok: true, matchId: matchA }),
    );

    const lobby = createLobbyService();
    await database.prisma.user.createMany({
      data: [
        { id: 'user-3', firstName: 'User 3' },
        { id: 'user-4', firstName: 'User 4' },
      ],
    });
    await lobby.takeSeat('user-3', { seatIndex: 0 });
    await lobby.takeSeat('user-4', { seatIndex: 1 });
    await lobby.connectPresence('user-3');
    await lobby.connectPresence('user-4');
    await lobby.setReady('user-3', { ready: true });
    await lobby.setReady('user-4', { ready: true });
    const matchB = await lobby.startMatch('user-3', {});
    expect(matchB.ok).toBe(true);
    if (!matchB.ok) throw new Error('match B start failed');

    await expect(completion.completeTerminalMatch(matchA)).resolves.toEqual({
      ok: false,
      error: {
        code: 'MATCH_NOT_CURRENT',
        message: 'Match is not the current room match',
      },
    });

    const room = await repository.loadSingletonRoom();
    expect(room?.currentMatchId).toBe(matchB.matchId);
    expect(room?.seats).toEqual([
      { seatIndex: 0, userId: 'user-3', ready: true },
      { seatIndex: 1, userId: 'user-4', ready: true },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);
  });

  it('keeps the completed match durable and allows repeated completion to be harmless', async () => {
    const matchId = await startCanonicalMatch(['user-1', 'user-2', 'user-3']);
    await database.prisma.match.update({
      where: { id: matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });
    const first = await completion.completeTerminalMatch(matchId);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('first completion failed');

    const second = await completion.completeTerminalMatch(matchId);
    expect(second).toEqual({
      ok: false,
      error: {
        code: 'MATCH_NOT_CURRENT',
        message: 'Match is not the current room match',
      },
    });

    const match = await database.prisma.match.findUnique({ where: { id: matchId } });
    expect(match?.status).toBe('FINISHED');
    expect(match?.snapshot).toBeTruthy();
  });

  it('requires TAKE_SEAT and READY again after the room reset', async () => {
    const matchId = await startCanonicalMatch(['user-1', 'user-2']);
    await database.prisma.match.update({
      where: { id: matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });
    await completion.completeTerminalMatch(matchId);

    const room = await repository.loadSingletonRoom();
    expect(room?.seats).toEqual([
      { seatIndex: 0, userId: null, ready: false },
      { seatIndex: 1, userId: null, ready: false },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);

    const lobby = createLobbyService();
    await database.prisma.user.createMany({
      data: [
        { id: 'user-3', firstName: 'User 3' },
        { id: 'user-4', firstName: 'User 4' },
      ],
    });
    await lobby.takeSeat('user-3', { seatIndex: 0 });
    await lobby.takeSeat('user-4', { seatIndex: 1 });
    await lobby.connectPresence('user-3');
    await lobby.connectPresence('user-4');
    await lobby.setReady('user-3', { ready: true });
    await lobby.setReady('user-4', { ready: true });
    const next = await lobby.startMatch('user-3', {});
    expect(next.ok).toBe(true);
  });
});
