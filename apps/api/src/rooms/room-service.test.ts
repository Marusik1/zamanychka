import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoomRepository, SINGLETON_ROOM_KEY } from './room-repository.js';
import { createRoomService, type RoomPresenceStore } from './room-service.js';
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

function createService(options?: { enableSoloGameDebug?: boolean }) {
  return createRoomService({
    repository,
    presenceStore: new InMemoryRoomPresenceStore(),
    ...(options?.enableSoloGameDebug === undefined
      ? {}
      : { enableSoloGameDebug: options.enableSoloGameDebug }),
  });
}

async function seedUsers(ids: string[]) {
  await database.prisma.user.createMany({
    data: ids.map((id, index) => ({ id, firstName: `User ${index + 1}` })),
  });
}

async function joinSingleton(ids: string[]) {
  await repository.bootstrapSingletonRoom();
  await database.prisma.roomMembership.createMany({
    data: ids.map((userId) => ({ roomKey: SINGLETON_ROOM_KEY, userId })),
    skipDuplicates: true,
  });
}

async function roomVersion(roomId = SINGLETON_ROOM_KEY) {
  const room = await repository.loadRoom(roomId);
  if (!room) throw new Error('missing room');
  return room.version;
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('room service', () => {
  it('keeps one-player start rejected when solo debug is disabled', async () => {
    await seedUsers(['user-1']);
    await joinSingleton(['user-1']);
    const service = createService();
    await service.takeSeat('user-1', SINGLETON_ROOM_KEY, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(),
    });
    await service.setReady('user-1', SINGLETON_ROOM_KEY, {
      ready: true,
      expectedRoomVersion: await roomVersion(),
    });
    await service.connectPresence('user-1', SINGLETON_ROOM_KEY);

    await expect(
      service.startMatch('user-1', SINGLETON_ROOM_KEY, {
        expectedRoomVersion: await roomVersion(),
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'ROOM_NOT_READY', message: 'Room is not ready' },
    });
  });

  it('starts a marked two-player solo debug match with a yellow debug dummy', async () => {
    await seedUsers(['user-1']);
    await joinSingleton(['user-1']);
    const service = createService({ enableSoloGameDebug: true });
    await service.takeSeat('user-1', SINGLETON_ROOM_KEY, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(),
    });
    await service.setReady('user-1', SINGLETON_ROOM_KEY, {
      ready: true,
      expectedRoomVersion: await roomVersion(),
    });
    await service.connectPresence('user-1', SINGLETON_ROOM_KEY);

    const result = await service.startMatch('user-1', SINGLETON_ROOM_KEY, {
      expectedRoomVersion: await roomVersion(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const match = await database.prisma.match.findUniqueOrThrow({
      where: { id: result.matchId },
    });
    const snapshot = match.snapshot as unknown as {
      debugMode?: string;
      players: Array<{
        playerId: string;
        color: string;
        participantKind?: string;
      }>;
      pawns: Array<{ playerId: string; color: string; position: { zone: string } }>;
    };
    expect(match.seatOrder).toEqual(['user-1', 'debug-dummy:single-room']);
    expect(snapshot.debugMode).toBe('SOLO');
    expect(snapshot.players).toEqual([
      expect.objectContaining({ playerId: 'user-1', color: 'RED', participantKind: 'REAL' }),
      expect.objectContaining({
        playerId: 'debug-dummy:single-room',
        color: 'YELLOW',
        participantKind: 'DEBUG_DUMMY',
      }),
    ]);
    expect(snapshot.pawns.filter((pawn) => pawn.playerId === 'debug-dummy:single-room')).toHaveLength(4);
    expect(snapshot.pawns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: 'debug-dummy:single-room',
          color: 'YELLOW',
          position: { zone: 'OFF_BOARD' },
        }),
      ]),
    );
  });

  it('takes a free seat for a room member', async () => {
    await seedUsers(['user-1']);
    await joinSingleton(['user-1']);
    const service = createService();

    const result = await service.takeSeat('user-1', SINGLETON_ROOM_KEY, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room.id).toBe(SINGLETON_ROOM_KEY);
    expect(result.room.seats[0]).toEqual({ seatIndex: 0, userId: 'user-1', ready: false });
    expect(result.room.counts).toEqual({ memberCount: 1, seatedCount: 1, readyCount: 0 });
  });

  it('rejects occupied seat and requires membership', async () => {
    await seedUsers(['user-1', 'user-2']);
    await joinSingleton(['user-1']);
    const service = createService();

    await service.takeSeat('user-1', SINGLETON_ROOM_KEY, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(),
    });

    await expect(
      service.takeSeat('user-2', SINGLETON_ROOM_KEY, {
        seatIndex: 0,
        expectedRoomVersion: await roomVersion(),
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'NOT_ROOM_MEMBER', message: 'User is not a member of this room' },
    });
  });

  it('leaves the owned seat and keeps membership', async () => {
    await seedUsers(['user-1']);
    await joinSingleton(['user-1']);
    const service = createService();
    await service.takeSeat('user-1', SINGLETON_ROOM_KEY, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(),
    });

    const result = await service.leaveSeat('user-1', SINGLETON_ROOM_KEY, {
      expectedRoomVersion: await roomVersion(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room.counts).toEqual({ memberCount: 1, seatedCount: 0, readyCount: 0 });
    expect(result.room.currentUser.isMember).toBe(true);
    expect(result.room.currentUser.seatIndex).toBeNull();
  });

  it('sets readiness only for the seated participant', async () => {
    await seedUsers(['user-1', 'user-2']);
    await joinSingleton(['user-1', 'user-2']);
    const service = createService();
    await service.takeSeat('user-1', SINGLETON_ROOM_KEY, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(),
    });

    await expect(
      service.setReady('user-2', SINGLETON_ROOM_KEY, {
        ready: true,
        expectedRoomVersion: await roomVersion(),
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'SEAT_NOT_OWNED', message: 'Seat is not owned by this participant' },
    });

    const result = await service.setReady('user-1', SINGLETON_ROOM_KEY, {
      ready: true,
      expectedRoomVersion: await roomVersion(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room.seats[0]?.ready).toBe(true);
    expect(result.room.counts.readyCount).toBe(1);
  });

  it('preserves seat and ready across disconnect and reconnect', async () => {
    await seedUsers(['user-1']);
    await joinSingleton(['user-1']);
    const service = createService();
    await service.takeSeat('user-1', SINGLETON_ROOM_KEY, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(),
    });
    await service.setReady('user-1', SINGLETON_ROOM_KEY, {
      ready: true,
      expectedRoomVersion: await roomVersion(),
    });

    const disconnected = await service.disconnectPresence('user-1', SINGLETON_ROOM_KEY);
    expect(disconnected.presence).toEqual([{ userId: 'user-1', connected: false }]);

    const reconnected = await service.connectPresence('user-1', SINGLETON_ROOM_KEY);
    expect(reconnected.presence).toEqual([{ userId: 'user-1', connected: true }]);
    expect(reconnected.currentUser.ready).toBe(true);
    expect(reconnected.currentUser.seatIndex).toBe(0);
  });

  it('supports create, list, join, and leave room with room-scoped state', async () => {
    await seedUsers(['user-1', 'user-2']);
    const service = createService();
    const created = await service.createRoom('user-1', {});
    const rooms = await service.listRooms('user-1');

    expect(rooms.rooms.some((room) => room.id === created.id)).toBe(true);

    const joined = await service.joinRoom('user-2', created.id, {});
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.room.counts.memberCount).toBe(2);

    const left = await service.leaveRoom('user-2', created.id, {
      expectedRoomVersion: joined.room.version,
    });
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    expect(left.room.counts.memberCount).toBe(1);
  });
});
