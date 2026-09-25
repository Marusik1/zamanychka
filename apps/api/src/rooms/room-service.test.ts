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
      expect.objectContaining({ playerId: 'user-1', color: 'RED', participantKind: 'HUMAN' }),
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
    expect(result.room.seats[0]).toMatchObject({
      seatIndex: 0,
      userId: 'user-1',
      participantId: 'user-1',
      participantKind: 'HUMAN',
      ready: false,
    });
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

  it('creates a distinct new room from plus instead of reusing the previous waiting room', async () => {
    await seedUsers(['user-1']);
    const service = createService();

    const roomA = await service.createRoom('user-1', {});
    const roomB = await service.createRoom('user-1', {});

    expect(roomB.id).not.toBe(roomA.id);
    const list = await service.listRooms('user-1');
    expect(list.currentMembershipRoom).toMatchObject({
      roomId: roomB.id,
      code: roomB.code,
      status: 'WAITING',
      currentMatchId: null,
    });
    expect(list.rooms.some((room) => room.id === roomB.id)).toBe(true);
    expect(list.rooms.some((room) => room.id === roomA.id)).toBe(false);
    await expect(service.getRoom('user-1', roomB.id)).resolves.toMatchObject({
      id: roomB.id,
      currentUser: { isMember: true, canManageBots: true },
    });
    await expect(service.getRoom('user-1', roomA.id)).rejects.toThrow('ROOM_NOT_FOUND');
  });

  it('transfers ownership to the next human when an owner creates a new room', async () => {
    await seedUsers(['user-1', 'user-2']);
    const service = createService();

    const roomA = await service.createRoom('user-1', {});
    const joined = await service.joinRoom('user-2', roomA.id, {});
    expect(joined.ok).toBe(true);

    const hostSeat = await service.takeSeat('user-1', roomA.id, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(roomA.id),
    });
    expect(hostSeat.ok).toBe(true);
    const secondHumanSeat = await service.takeSeat('user-2', roomA.id, {
      seatIndex: 1,
      expectedRoomVersion: await roomVersion(roomA.id),
    });
    expect(secondHumanSeat.ok).toBe(true);
    const botSeat = await service.addBot('user-1', roomA.id, {
      seatIndex: 2,
      expectedRoomVersion: await roomVersion(roomA.id),
    });
    expect(botSeat.ok).toBe(true);

    const roomB = await service.createRoom('user-1', {});
    expect(roomB.id).not.toBe(roomA.id);

    const oldRoomForRemainingHuman = await service.getRoom('user-2', roomA.id);
    expect(oldRoomForRemainingHuman.status).toBe('WAITING');
    expect(oldRoomForRemainingHuman.currentMatchId).toBeNull();
    expect(oldRoomForRemainingHuman.counts).toMatchObject({
      memberCount: 1,
      seatedCount: 2,
    });
    expect(oldRoomForRemainingHuman.currentUser).toMatchObject({
      isMember: true,
      canManageBots: true,
    });
    expect(oldRoomForRemainingHuman.seats[0]).toMatchObject({
      userId: null,
      participantId: null,
      participantKind: null,
      ready: false,
    });
    expect(oldRoomForRemainingHuman.seats[1]).toMatchObject({
      userId: 'user-2',
      participantId: 'user-2',
      participantKind: 'HUMAN',
    });
    expect(oldRoomForRemainingHuman.seats[2]).toMatchObject({
      userId: null,
      participantKind: 'BOT',
    });

    const oldRoomForMovedUser = await service.getRoom('user-1', roomA.id);
    expect(oldRoomForMovedUser.currentUser).toMatchObject({
      isMember: false,
      canManageBots: false,
    });
  });

  it('closes the old room instead of leaving bot-only ownership when the owner creates a new room', async () => {
    await seedUsers(['user-1']);
    const service = createService();

    const roomA = await service.createRoom('user-1', {});
    const hostSeat = await service.takeSeat('user-1', roomA.id, {
      seatIndex: 0,
      expectedRoomVersion: await roomVersion(roomA.id),
    });
    expect(hostSeat.ok).toBe(true);
    const botSeat = await service.addBot('user-1', roomA.id, {
      seatIndex: 1,
      expectedRoomVersion: await roomVersion(roomA.id),
    });
    expect(botSeat.ok).toBe(true);

    const roomB = await service.createRoom('user-1', {});
    expect(roomB.id).not.toBe(roomA.id);

    await expect(service.getRoom('user-1', roomA.id)).rejects.toThrow('ROOM_NOT_FOUND');
    await expect(repository.loadRoom(roomA.id)).resolves.toMatchObject({
      status: 'CLOSED',
      members: [],
      seats: expect.arrayContaining([
        expect.objectContaining({
          seatIndex: 0,
          userId: null,
          participantId: null,
          participantKind: null,
          ready: false,
        }),
        expect.objectContaining({
          seatIndex: 1,
          userId: null,
          participantId: null,
          participantKind: null,
          ready: false,
        }),
      ]),
    });
  });

  it('soft-deletes a waiting room only for the owner', async () => {
    await seedUsers(['user-1', 'user-2']);
    const service = createService();
    const created = await service.createRoom('user-1', {});
    const joined = await service.joinRoom('user-2', created.id, {});
    expect(joined.ok).toBe(true);

    await expect(
      service.deleteRoom('user-2', created.id, { expectedRoomVersion: await roomVersion(created.id) }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'NOT_ALLOWED', message: 'Operation is not allowed' },
    });

    const deleted = await service.deleteRoom('user-1', created.id, {
      expectedRoomVersion: await roomVersion(created.id),
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.room.status).toBe('CLOSED');
    expect(deleted.room.currentUser.isMember).toBe(false);

    const rooms = await service.listRooms('user-1');
    expect(rooms.rooms.some((room) => room.id === created.id)).toBe(false);
    expect(rooms.currentMembershipRoom).toBeNull();
    await expect(service.getRoom('user-1', created.id)).rejects.toThrow('ROOM_NOT_FOUND');
  });

  it('rejects deleting a room with an active match', async () => {
    await seedUsers(['user-1', 'user-2']);
    const service = createService();
    const room = await service.createRoom('user-1', {});
    const joined = await service.joinRoom('user-2', room.id, {});
    expect(joined.ok).toBe(true);
    for (const [index, userId] of ['user-1', 'user-2'].entries()) {
      const seated = await service.takeSeat(userId, room.id, {
        seatIndex: index as 0 | 1,
        expectedRoomVersion: await roomVersion(room.id),
      });
      expect(seated.ok).toBe(true);
      await service.connectPresence(userId, room.id);
      const ready = await service.setReady(userId, room.id, {
        ready: true,
        expectedRoomVersion: await roomVersion(room.id),
      });
      expect(ready.ok).toBe(true);
    }
    const started = await service.startMatch('user-1', room.id, {
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(started.ok).toBe(true);

    await expect(
      service.deleteRoom('user-1', room.id, { expectedRoomVersion: await roomVersion(room.id) }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'ROOM_ALREADY_ACTIVE', message: 'Room already has an active match' },
    });
  });

  it('repairs a stale terminal current match before deleting a room', async () => {
    await seedUsers(['user-1', 'user-2']);
    const service = createService();
    const room = await service.createRoom('user-1', {});
    const joined = await service.joinRoom('user-2', room.id, {});
    expect(joined.ok).toBe(true);
    for (const [index, userId] of ['user-1', 'user-2'].entries()) {
      const seated = await service.takeSeat(userId, room.id, {
        seatIndex: index as 0 | 1,
        expectedRoomVersion: await roomVersion(room.id),
      });
      expect(seated.ok).toBe(true);
      await service.connectPresence(userId, room.id);
      const ready = await service.setReady(userId, room.id, {
        ready: true,
        expectedRoomVersion: await roomVersion(room.id),
      });
      expect(ready.ok).toBe(true);
    }
    const started = await service.startMatch('user-1', room.id, {
      expectedRoomVersion: await roomVersion(room.id),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await database.prisma.match.update({
      where: { id: started.matchId },
      data: { status: 'FINISHED', finishedAt: new Date('2026-09-01T10:10:00.000Z') },
    });

    const deleted = await service.deleteRoom('user-1', room.id, {
      expectedRoomVersion: await roomVersion(room.id),
    });

    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.room.status).toBe('CLOSED');
    await expect(repository.loadRoom(room.id)).resolves.toMatchObject({
      status: 'CLOSED',
      currentMatchId: null,
    });
  });
});
