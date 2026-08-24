import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoomRepository } from './room-repository.js';
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

function createService() {
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

describe('room service', () => {
  it('takes a free seat and keeps readiness cleared', async () => {
    await database.prisma.user.create({ data: { id: 'user-1', firstName: 'User 1' } });
    const service = createService();

    const result = await service.takeSeat('user-1', { seatIndex: 0 });

    expect(result).toEqual({
      ok: true,
      room: {
        roomId: 'single-room',
        version: 1,
        currentMatchId: null,
        participants: [{ userId: 'user-1', seatIndex: 0, ready: false }],
      },
    });
  });

  it('rejects an occupied seat and a second seat for the same user', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'user-1', firstName: 'User 1' },
        { id: 'user-2', firstName: 'User 2' },
      ],
    });
    const service = createService();
    await service.takeSeat('user-1', { seatIndex: 0 });

    await expect(service.takeSeat('user-2', { seatIndex: 0 })).resolves.toEqual({
      ok: false,
      error: {
        code: 'SEAT_TAKEN',
        message: 'Seat is already taken',
      },
    });

    await expect(service.takeSeat('user-1', { seatIndex: 1 })).resolves.toEqual({
      ok: false,
      error: {
        code: 'SEAT_TAKEN',
        message: 'Seat is already taken',
      },
    });
  });

  it('leaves the owned seat and preserves other seats', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'user-1', firstName: 'User 1' },
        { id: 'user-2', firstName: 'User 2' },
      ],
    });
    const service = createService();
    await service.takeSeat('user-1', { seatIndex: 0 });
    await service.takeSeat('user-2', { seatIndex: 1 });
    await service.setReady('user-2', { ready: true });

    const result = await service.leaveSeat('user-1');

    expect(result).toEqual({
      ok: true,
      room: {
        roomId: 'single-room',
        version: 4,
        currentMatchId: null,
        participants: [{ userId: 'user-2', seatIndex: 1, ready: true }],
      },
    });
  });

  it('sets readiness only for the seated participant', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'user-1', firstName: 'User 1' },
        { id: 'user-2', firstName: 'User 2' },
      ],
    });
    const service = createService();
    await service.takeSeat('user-1', { seatIndex: 0 });

    await expect(service.setReady('user-1', { ready: true })).resolves.toEqual({
      ok: true,
      room: {
        roomId: 'single-room',
        version: 2,
        currentMatchId: null,
        participants: [{ userId: 'user-1', seatIndex: 0, ready: true }],
      },
    });

    await expect(service.setReady('user-1', { ready: false })).resolves.toEqual({
      ok: true,
      room: {
        roomId: 'single-room',
        version: 3,
        currentMatchId: null,
        participants: [{ userId: 'user-1', seatIndex: 0, ready: false }],
      },
    });

    await expect(service.setReady('user-2', { ready: true })).resolves.toEqual({
      ok: false,
      error: {
        code: 'SEAT_NOT_OWNED',
        message: 'Seat is not owned by this participant',
      },
    });
  });

  it('preserves seat and readiness across disconnect and reconnect presence changes', async () => {
    await database.prisma.user.create({ data: { id: 'user-1', firstName: 'User 1' } });
    const service = createService();
    await service.takeSeat('user-1', { seatIndex: 0 });
    await service.setReady('user-1', { ready: true });

    const disconnected = await service.disconnectPresence('user-1');
    expect(disconnected.participantViews).toEqual([
      { userId: 'user-1', seatIndex: 0, ready: true, connected: false },
    ]);
    expect(disconnected.presence).toEqual([{ userId: 'user-1', connected: false }]);

    const reconnected = await service.connectPresence('user-1');
    expect(reconnected.participantViews).toEqual([
      { userId: 'user-1', seatIndex: 0, ready: true, connected: true },
    ]);
    expect(reconnected.presence).toEqual([{ userId: 'user-1', connected: true }]);

    const room = await repository.loadSingletonRoom();
    expect(room?.seats).toEqual([
      { seatIndex: 0, userId: 'user-1', ready: true },
      { seatIndex: 1, userId: null, ready: false },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);
  });

  it('does not mutate the room roster during active-match disconnect presence changes', async () => {
    await database.prisma.user.create({ data: { id: 'user-1', firstName: 'User 1' } });
    await repository.bootstrapSingletonRoom();
    await repository.saveSingletonRoom({
      roomId: 'single-room',
      version: 9,
      currentMatchId: 'match-1',
      seats: [
        { seatIndex: 0, userId: 'user-1', ready: true },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
    });
    const service = createService();

    const before = await repository.loadSingletonRoom();
    const result = await service.disconnectPresence('user-1');
    const after = await repository.loadSingletonRoom();

    expect(before).toEqual(after);
    expect(result.participantViews).toEqual([
      { userId: 'user-1', seatIndex: 0, ready: true, connected: false },
    ]);
  });

  it('serializes concurrent claims for the same seat', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'user-1', firstName: 'User 1' },
        { id: 'user-2', firstName: 'User 2' },
      ],
    });
    const service = createService();
    await repository.bootstrapSingletonRoom();

    const [first, second] = await Promise.all([
      service.takeSeat('user-1', { seatIndex: 0 }),
      service.takeSeat('user-2', { seatIndex: 0 }),
    ]);

    const loser = first.ok ? second : first;

    expect(first.ok !== second.ok).toBe(true);
    expect(loser).toEqual({
      ok: false,
      error: {
        code: 'SEAT_TAKEN',
        message: 'Seat is already taken',
      },
    });
    expect(await repository.loadSingletonRoom()).toEqual({
      roomId: 'single-room',
      version: 1,
      currentMatchId: null,
      seats: [
        { seatIndex: 0, userId: 'user-1', ready: false },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
    });
  });
});
