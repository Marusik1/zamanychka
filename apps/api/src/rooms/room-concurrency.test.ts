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

function createService() {
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
  service: ReturnType<typeof createService>,
  ids: readonly string[],
) {
  if (ids.length < 1) throw new Error('fixture requires at least one member');

  await seedUsers(ids);

  const room = await service.createRoom(ids[0] ?? '', {});
  const roomId = room.id;

  for (const id of ids.slice(1)) {
    const joined = await service.joinRoom(id, roomId, {});
    expect(joined.ok).toBe(true);
  }

  return roomId;
}

async function seedReadyRoom(ids: readonly string[]) {
  const service = createService();
  const roomId = await createRoomWithMembers(service, ids);

  for (const [index, id] of ids.entries()) {
    const seated = await service.takeSeat(id, roomId, {
      seatIndex: index as 0 | 1 | 2 | 3,
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(seated.ok).toBe(true);

    await service.connectPresence(id, roomId);

    const ready = await service.setReady(id, roomId, {
      ready: true,
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(ready.ok).toBe(true);
  }

  return { service, roomId };
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('room concurrency', () => {
  it('keeps one durable occupant when two users race for the same seat', async () => {
    const service = createService();
    const roomId = await createRoomWithMembers(service, ['user-1', 'user-2']);
    const version = await roomVersion(roomId);

    const [first, second] = await Promise.all([
      service.takeSeat('user-1', roomId, {
        seatIndex: 0,
        expectedRoomVersion: version,
      }),
      service.takeSeat('user-2', roomId, {
        seatIndex: 0,
        expectedRoomVersion: version,
      }),
    ]);

    const room = await repository.loadRoom(roomId);

    expect(room?.seats.filter((seat) => seat.userId !== null)).toHaveLength(1);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect([first, second].some((result) => !result.ok && result.error.code === 'STALE_ROOM_VERSION'))
      .toBe(true);
  });

  it('keeps at most one seat for the same user when two seat claims race', async () => {
    const service = createService();
    const roomId = await createRoomWithMembers(service, ['user-1']);
    const version = await roomVersion(roomId);

    const [first, second] = await Promise.all([
      service.takeSeat('user-1', roomId, {
        seatIndex: 0,
        expectedRoomVersion: version,
      }),
      service.takeSeat('user-1', roomId, {
        seatIndex: 1,
        expectedRoomVersion: version,
      }),
    ]);

    const room = await repository.loadRoom(roomId);

    expect(room?.seats.filter((seat) => seat.userId === 'user-1')).toHaveLength(1);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
  });

  it('keeps take-seat versus leave-seat deterministic under the same room version', async () => {
    const service = createService();
    const roomId = await createRoomWithMembers(service, ['user-1']);

    const initialSeat = await service.takeSeat('user-1', roomId, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(initialSeat.ok).toBe(true);

    const version = await roomVersion(roomId);

    await Promise.all([
      service.takeSeat('user-1', roomId, {
        seatIndex: 0,
        expectedRoomVersion: version,
      }),
      service.leaveSeat('user-1', roomId, {
        expectedRoomVersion: version,
      }),
    ]);

    const room = await repository.loadRoom(roomId);

    expect(room?.seats).toEqual([
      { seatIndex: 0, userId: null, ready: false },
      { seatIndex: 1, userId: null, ready: false },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);
  });

  it('never persists READY without a seated participant when READY races LEAVE_SEAT', async () => {
    const service = createService();
    const roomId = await createRoomWithMembers(service, ['user-1']);

    const initialSeat = await service.takeSeat('user-1', roomId, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(roomId),
    });
    expect(initialSeat.ok).toBe(true);

    const version = await roomVersion(roomId);

    await Promise.all([
      service.setReady('user-1', roomId, {
        ready: true,
        expectedRoomVersion: version,
      }),
      service.leaveSeat('user-1', roomId, {
        expectedRoomVersion: version,
      }),
    ]);

    const room = await repository.loadRoom(roomId);
    const seat = room?.seats[0];

    expect(seat).toBeDefined();

    if (seat?.userId === null) {
      expect(seat.ready).toBe(false);
    } else {
      expect(seat).toEqual({
        seatIndex: 0,
        userId: 'user-1',
        ready: true,
      });
    }
  });

  it('creates exactly one match when two seated users race START_MATCH', async () => {
    const { service, roomId } = await seedReadyRoom(['user-1', 'user-2']);
    const version = await roomVersion(roomId);

    const [first, second] = await Promise.all([
      service.startMatch('user-1', roomId, {
        expectedRoomVersion: version,
      }),
      service.startMatch('user-2', roomId, {
        expectedRoomVersion: version,
      }),
    ]);

    const room = await repository.loadRoom(roomId);
    const matches = await database.prisma.match.findMany({
      where: { roomKey: roomId },
    });

    expect(matches).toHaveLength(1);
    expect(room?.currentMatchId).toBe(matches[0]?.id ?? null);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
  });

  it('does not create a second match when START_MATCH is repeated after commit', async () => {
    const { service, roomId } = await seedReadyRoom(['user-1', 'user-2']);

    const first = await service.startMatch('user-1', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });

    expect(first.ok).toBe(true);

    const second = await service.startMatch('user-2', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('ROOM_ALREADY_ACTIVE');
    }

    const matches = await database.prisma.match.findMany({
      where: { roomKey: roomId },
    });

    expect(matches).toHaveLength(1);
  });

  it('blocks START_MATCH when a seated participant is disconnected and restores eligibility on reconnect', async () => {
    const { service, roomId } = await seedReadyRoom(['user-1', 'user-2']);

    await service.disconnectPresence('user-2', roomId);

    await expect(
      service.startMatch('user-1', roomId, {
        expectedRoomVersion: await roomVersion(roomId),
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'SEATED_PARTICIPANT_DISCONNECTED',
        message: 'Seated participant is disconnected',
      },
    });

    await service.connectPresence('user-2', roomId);

    const started = await service.startMatch('user-1', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });

    expect(started.ok).toBe(true);
  });

  it('keeps an already committed match valid when disconnect happens after start', async () => {
    const { service, roomId } = await seedReadyRoom(['user-1', 'user-2']);

    const started = await service.startMatch('user-1', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });

    expect(started.ok).toBe(true);

    await service.disconnectPresence('user-1', roomId);

    const room = await repository.loadRoom(roomId);
    expect(room?.currentMatchId).toBeTruthy();

    const match = await database.prisma.match.findFirstOrThrow({
      where: { roomKey: roomId },
    });

    expect(match.status).toBe('ACTIVE');
  });

  it('keeps old completion stale after a new match starts in the same room', async () => {
    const players = ['user-1', 'user-2'] as const;
    const { service: firstLobby, roomId } = await seedReadyRoom(players);

    const matchA = await firstLobby.startMatch('user-1', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });

    expect(matchA.ok).toBe(true);
    if (!matchA.ok) throw new Error('match A failed');

    await database.prisma.match.update({
      where: { id: matchA.matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });
    await completion.completeTerminalMatch(matchA.matchId);

    const secondLobby = createService();

    for (const [index, id] of players.entries()) {
      const seated = await secondLobby.takeSeat(id, roomId, {
        seatIndex: index as 0 | 1,
        expectedRoomVersion: await roomVersion(roomId),
      });
      expect(seated.ok).toBe(true);

      await secondLobby.connectPresence(id, roomId);

      const ready = await secondLobby.setReady(id, roomId, {
        ready: true,
        expectedRoomVersion: await roomVersion(roomId),
      });
      expect(ready.ok).toBe(true);
    }

    const matchB = await secondLobby.startMatch('user-1', roomId, {
      expectedRoomVersion: await roomVersion(roomId),
    });

    expect(matchB.ok).toBe(true);
    if (!matchB.ok) throw new Error('match B failed');

    await expect(completion.completeTerminalMatch(matchA.matchId)).resolves.toEqual({
      ok: false,
      error: {
        code: 'MATCH_NOT_CURRENT',
        message: 'Match is not the current room match',
      },
    });

    const room = await repository.loadRoom(roomId);
    expect(room?.status).toBe('ACTIVE');
    expect(room?.currentMatchId).toBe(matchB.matchId);
    expect(room?.seats.filter((seat) => seat.userId !== null)).toHaveLength(2);
  });

  it('allows independent START_MATCH operations in different rooms', async () => {
    const first = await seedReadyRoom(['user-1', 'user-2']);
    const second = await seedReadyRoom(['user-3', 'user-4']);

    const [matchA, matchB] = await Promise.all([
      first.service.startMatch('user-1', first.roomId, {
        expectedRoomVersion: await roomVersion(first.roomId),
      }),
      second.service.startMatch('user-3', second.roomId, {
        expectedRoomVersion: await roomVersion(second.roomId),
      }),
    ]);

    expect(matchA.ok).toBe(true);
    expect(matchB.ok).toBe(true);

    const [roomA, roomB] = await Promise.all([
      repository.loadRoom(first.roomId),
      repository.loadRoom(second.roomId),
    ]);

    expect(roomA?.status).toBe('ACTIVE');
    expect(roomB?.status).toBe('ACTIVE');
    expect(roomA?.currentMatchId).toBeTruthy();
    expect(roomB?.currentMatchId).toBeTruthy();
    expect(roomA?.currentMatchId).not.toBe(roomB?.currentMatchId);

    const matches = await database.prisma.match.findMany();
    expect(matches).toHaveLength(2);
  });
});
