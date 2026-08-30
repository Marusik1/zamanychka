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
  const room = await repository.loadRoom(roomId);
  if (!room) throw new Error(`room ${roomId} not found in fixture`);
  return room.version;
}

async function createRoomWithMembers(
  lobby: ReturnType<typeof createLobbyService>,
  playerIds: readonly string[],
) {
  if (playerIds.length < 1) throw new Error('fixture requires at least one player');

  await seedUsers(playerIds);

  const room = await lobby.createRoom(playerIds[0] ?? '', {});
  const roomId = room.id;

  for (const userId of playerIds.slice(1)) {
    const joined = await lobby.joinRoom(userId, roomId, {});
    expect(joined.ok).toBe(true);
  }

  return roomId;
}

async function seatAndReadyPlayers(
  lobby: ReturnType<typeof createLobbyService>,
  roomId: string,
  playerIds: readonly string[],
) {
  for (const [index, userId] of playerIds.entries()) {
    const seated = await lobby.takeSeat(userId, roomId, {
      seatIndex: index as 0 | 1 | 2 | 3,
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(seated.ok).toBe(true);

    await lobby.connectPresence(userId, roomId);

    const ready = await lobby.setReady(userId, roomId, {
      ready: true,
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(ready.ok).toBe(true);
  }
}

async function startCanonicalMatch(playerIds: readonly string[]) {
  const lobby = createLobbyService();
  const roomId = await createRoomWithMembers(lobby, playerIds);

  await seatAndReadyPlayers(lobby, roomId, playerIds);

  const started = await lobby.startMatch(playerIds[0] ?? '', roomId, {
    expectedRoomVersion: await roomVersion(roomId),
  });

  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error('match start failed in test fixture');

  return {
    lobby,
    roomId,
    matchId: started.matchId,
  };
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('match completion', () => {
  it('clears currentMatchId and empties all seats while preserving memberships', async () => {
    const { roomId, matchId } = await startCanonicalMatch(['user-1', 'user-2']);

    await database.prisma.match.update({
      where: { id: matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });
    const result = await completion.completeTerminalMatch(matchId);

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        matchId,
        room: expect.objectContaining({
          id: roomId,
          status: 'WAITING',
          currentMatchId: null,
          counts: expect.objectContaining({
            memberCount: 2,
            seatedCount: 0,
            readyCount: 0,
          }),
        }),
      }),
    );

    const room = await repository.loadRoom(roomId);
    expect(room?.roomId).toBe(roomId);
    expect(room?.status).toBe('WAITING');
    expect(room?.currentMatchId).toBeNull();
    expect(room?.members.map((member) => member.userId)).toEqual(['user-1', 'user-2']);
    expect(room?.seats).toEqual([
      { seatIndex: 0, userId: null, ready: false },
      { seatIndex: 1, userId: null, ready: false },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);

    const match = await database.prisma.match.findUnique({ where: { id: matchId } });
    expect(match?.status).toBe('FINISHED');
    expect(match?.roomKey).toBe(roomId);
  });

  it('does not release a room for a non-terminal match or an unrelated match', async () => {
    const { roomId, matchId } = await startCanonicalMatch(['user-1', 'user-2']);
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

    const room = await repository.loadRoom(roomId);
    expect(room?.status).toBe('ACTIVE');
    expect(room?.currentMatchId).toBe(matchId);
  });

  it('allows a rematch after completion and rejects stale completion for the old match', async () => {
    const players = ['user-1', 'user-2'] as const;
    const { roomId, matchId: matchA } = await startCanonicalMatch(players);

    await database.prisma.match.update({
      where: { id: matchA },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });

    await expect(completion.completeTerminalMatch(matchA)).resolves.toEqual(
      expect.objectContaining({ ok: true, matchId: matchA }),
    );

    const lobby = createLobbyService();
    await seatAndReadyPlayers(lobby, roomId, players);

    const matchB = await lobby.startMatch('user-1', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });

    expect(matchB.ok).toBe(true);
    if (!matchB.ok) throw new Error('match B start failed');

    await expect(completion.completeTerminalMatch(matchA)).resolves.toEqual({
      ok: false,
      error: {
        code: 'MATCH_NOT_CURRENT',
        message: 'Match is not the current room match',
      },
    });

    const room = await repository.loadRoom(roomId);
    expect(room?.status).toBe('ACTIVE');
    expect(room?.currentMatchId).toBe(matchB.matchId);
    expect(room?.seats).toEqual([
      { seatIndex: 0, userId: 'user-1', ready: true },
      { seatIndex: 1, userId: 'user-2', ready: true },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);
  });

  it('keeps the completed match durable and makes repeated completion harmless', async () => {
    const { matchId } = await startCanonicalMatch(['user-1', 'user-2', 'user-3']);

    await database.prisma.match.update({
      where: { id: matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });

    const first = await completion.completeTerminalMatch(matchId);
    expect(first.ok).toBe(true);

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
    const players = ['user-1', 'user-2'] as const;
    const { roomId, matchId } = await startCanonicalMatch(players);

    await database.prisma.match.update({
      where: { id: matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });
    await completion.completeTerminalMatch(matchId);

    const resetRoom = await repository.loadRoom(roomId);
    expect(resetRoom?.seats.every((seat) => seat.userId === null && !seat.ready)).toBe(true);

    const lobby = createLobbyService();

    await expect(
      lobby.startMatch('user-1', roomId, {
        expectedRoomVersion: await roomVersion(roomId),
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'SEAT_NOT_OWNED',
        message: 'Seat is not owned by this participant',
      },
    });

    await seatAndReadyPlayers(lobby, roomId, players);

    const next = await lobby.startMatch('user-1', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });

    expect(next.ok).toBe(true);
  });

  it('resets only the room that owns the completed match', async () => {
    const lobbyA = createLobbyService();
    const roomA = await createRoomWithMembers(lobbyA, ['user-1', 'user-2']);
    await seatAndReadyPlayers(lobbyA, roomA, ['user-1', 'user-2']);

    const startedA = await lobbyA.startMatch('user-1', roomA, {
      expectedRoomVersion: await roomVersion(roomA),
    });
    expect(startedA.ok).toBe(true);
    if (!startedA.ok) throw new Error('match A start failed');

    const lobbyB = createLobbyService();
    const roomB = await createRoomWithMembers(lobbyB, ['user-3', 'user-4']);
    await seatAndReadyPlayers(lobbyB, roomB, ['user-3', 'user-4']);

    const startedB = await lobbyB.startMatch('user-3', roomB, {
      expectedRoomVersion: await roomVersion(roomB),
    });
    expect(startedB.ok).toBe(true);
    if (!startedB.ok) throw new Error('match B start failed');

    await database.prisma.match.update({
      where: { id: startedA.matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });
    const completedA = await completion.completeTerminalMatch(startedA.matchId);
    expect(completedA.ok).toBe(true);

    const [afterA, afterB] = await Promise.all([
      repository.loadRoom(roomA),
      repository.loadRoom(roomB),
    ]);

    expect(afterA).toMatchObject({
      roomId: roomA,
      status: 'WAITING',
      currentMatchId: null,
    });
    expect(afterA?.seats.every((seat) => seat.userId === null && !seat.ready)).toBe(true);

    expect(afterB).toMatchObject({
      roomId: roomB,
      status: 'ACTIVE',
      currentMatchId: startedB.matchId,
    });
    expect(afterB?.seats.filter((seat) => seat.userId !== null)).toHaveLength(2);
  });
});
