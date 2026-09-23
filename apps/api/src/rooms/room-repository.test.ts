import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createRoomRepository,
  persistRoom,
  SINGLETON_ROOM_KEY,
} from './room-repository.js';
import { createTestDatabase } from '../test/test-database.js';

const database = createTestDatabase();
const repository = createRoomRepository(database.prisma);

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('room repository', () => {
  it('creates and loads independent rooms with durable memberships', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'u1', firstName: 'User 1' },
        { id: 'u2', firstName: 'User 2' },
      ],
    });

    const first = await repository.createRoom('u1');
    const second = await repository.createRoom('u2');

    expect(first.roomId).not.toBe(second.roomId);
    expect(first.code).not.toBe(second.code);

    await expect(repository.loadRoom(first.roomId)).resolves.toMatchObject({
      roomId: first.roomId,
      members: [expect.objectContaining({ userId: 'u1' })],
    });
    await expect(repository.loadRoom(second.roomId)).resolves.toMatchObject({
      roomId: second.roomId,
      members: [expect.objectContaining({ userId: 'u2' })],
    });

    await expect(database.prisma.roomMembership.count()).resolves.toBe(2);
  });

  it('lists independent non-closed rooms', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'u1', firstName: 'User 1' },
        { id: 'u2', firstName: 'User 2' },
      ],
    });

    const first = await repository.createRoom('u1');
    const second = await repository.createRoom('u2');

    const rooms = await repository.listRooms();

    expect(rooms.map((room) => room.roomId)).toEqual(
      expect.arrayContaining([first.roomId, second.roomId]),
    );
  });

  it('loads the one active membership for a user', async () => {
    await database.prisma.user.create({
      data: { id: 'u1', firstName: 'User 1' },
    });

    const room = await repository.createRoom('u1');

    await expect(repository.loadMembershipForUser('u1')).resolves.toMatchObject({
      roomKey: room.roomId,
      userId: 'u1',
    });
    await expect(repository.loadMembershipForUser('missing-user')).resolves.toBeNull();
  });

  it('creates a new waiting room from plus by moving the user out of the old room', async () => {
    await database.prisma.user.create({
      data: { id: 'u1', firstName: 'User 1' },
    });

    const first = await repository.createRoom('u1');
    const second = await repository.createRoom('u1');

    expect(second.roomId).not.toBe(first.roomId);
    await expect(
      database.prisma.roomMembership.count({ where: { userId: 'u1' } }),
    ).resolves.toBe(1);
    await expect(repository.loadMembershipForUser('u1')).resolves.toMatchObject({
      roomKey: second.roomId,
      userId: 'u1',
    });
    await expect(repository.loadRoom(first.roomId)).resolves.toMatchObject({
      roomId: first.roomId,
      status: 'CLOSED',
    });
  });

  it('database constraint prevents one user from belonging to two rooms', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'u1', firstName: 'User 1' },
        { id: 'u2', firstName: 'User 2' },
      ],
    });

    const first = await repository.createRoom('u1');
    const second = await repository.createRoom('u2');

    expect(first.roomId).not.toBe(second.roomId);

    await expect(
      database.prisma.roomMembership.create({
        data: {
          roomKey: second.roomId,
          userId: 'u1',
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      database.prisma.roomMembership.count({ where: { userId: 'u1' } }),
    ).resolves.toBe(1);
  });

  it('persists seat/readiness/match state only inside the addressed room', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'u1', firstName: 'User 1' },
        { id: 'u2', firstName: 'User 2' },
        { id: 'u3', firstName: 'User 3' },
      ],
    });

    const first = await repository.createRoom('u1');
    const second = await repository.createRoom('u3');

    await database.prisma.roomMembership.create({
      data: { roomKey: first.roomId, userId: 'u2' },
    });

    await database.prisma.match.create({
      data: {
        id: 'match-1',
        roomKey: first.roomId,
        firstPlayerId: 'u1',
        seatOrder: ['u1', 'u2'],
        snapshot: {},
      },
    });

    const saved = await repository.withLockedRoom(first.roomId, async (tx, locked) =>
      persistRoom(tx, {
        ...locked,
        status: 'ACTIVE',
        version: locked.version + 1,
        currentMatchId: 'match-1',
        seats: [
          { seatIndex: 0, userId: 'u1', ready: true },
          { seatIndex: 1, userId: null, ready: false },
          { seatIndex: 2, userId: 'u2', ready: false },
          { seatIndex: 3, userId: null, ready: false },
        ],
      }),
    );

    expect(saved).toMatchObject({
      roomId: first.roomId,
      status: 'ACTIVE',
      currentMatchId: 'match-1',
    });

    await expect(repository.loadRoom(first.roomId)).resolves.toEqual(saved);

    await expect(repository.loadRoom(second.roomId)).resolves.toMatchObject({
      roomId: second.roomId,
      status: 'WAITING',
      currentMatchId: null,
      members: [expect.objectContaining({ userId: 'u3' })],
      seats: [
        { seatIndex: 0, userId: null, ready: false },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
    });
  });

  it('keeps create room blocked while the user still belongs to an active match', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'u1', firstName: 'User 1' },
        { id: 'u2', firstName: 'User 2' },
      ],
    });

    const room = await repository.createRoom('u1');
    await database.prisma.match.create({
      data: {
        id: 'active-match-for-u1',
        roomKey: room.roomId,
        firstPlayerId: 'u1',
        seatOrder: ['u1', 'u2'],
        snapshot: {},
        status: 'ACTIVE',
      },
    });
    await repository.withLockedRoom(room.roomId, async (tx, locked) =>
      persistRoom(tx, {
        ...locked,
        status: 'ACTIVE',
        version: locked.version + 1,
        currentMatchId: 'active-match-for-u1',
      }),
    );

    const result = await repository.createRoom('u1');

    expect(result).toMatchObject({
      roomId: room.roomId,
      status: 'ACTIVE',
      currentMatchId: 'active-match-for-u1',
    });
    await expect(
      database.prisma.roomMembership.count({ where: { userId: 'u1' } }),
    ).resolves.toBe(1);
  });

  it('repairs a stale finished currentMatchId before creating a new room', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'u1', firstName: 'User 1' },
        { id: 'u2', firstName: 'User 2' },
      ],
    });

    const room = await repository.createRoom('u1');
    await database.prisma.match.create({
      data: {
        id: 'finished-match-for-u1',
        roomKey: room.roomId,
        firstPlayerId: 'u1',
        seatOrder: ['u1', 'u2'],
        snapshot: {},
        status: 'FINISHED',
        finishedAt: new Date(),
      },
    });
    await repository.withLockedRoom(room.roomId, async (tx, locked) =>
      persistRoom(tx, {
        ...locked,
        status: 'ACTIVE',
        version: locked.version + 1,
        currentMatchId: 'finished-match-for-u1',
        seats: locked.seats.map((seat) =>
          seat.seatIndex === 0
            ? {
                ...seat,
                userId: 'u1',
                participantId: 'u1',
                participantKind: 'HUMAN',
                ready: true,
              }
            : seat,
        ),
      }),
    );

    const nextRoom = await repository.createRoom('u1');

    expect(nextRoom.roomId).not.toBe(room.roomId);
    expect(nextRoom).toMatchObject({
      status: 'WAITING',
      currentMatchId: null,
      members: [expect.objectContaining({ userId: 'u1' })],
    });
    await expect(repository.loadRoom(room.roomId)).resolves.toMatchObject({
      roomId: room.roomId,
      status: 'CLOSED',
      currentMatchId: null,
      seats: expect.arrayContaining([
        expect.objectContaining({
          seatIndex: 0,
          userId: null,
          participantId: null,
          participantKind: null,
          ready: false,
        }),
      ]),
    });
  });

  it('loads a room through the transaction that owns its room-scoped lock', async () => {
    await database.prisma.user.create({
      data: { id: 'u1', firstName: 'User 1' },
    });

    const room = await repository.createRoom('u1');

    const result = await repository.withLockedRoom(room.roomId, async (tx, locked) => {
      expect(locked.roomId).toBe(room.roomId);

      const loaded = await repository.loadRoomInTransaction(tx, room.roomId);
      return loaded?.roomId ?? null;
    });

    expect(result).toBe(room.roomId);
  });

  it('throws ROOM_NOT_FOUND when a room-scoped lock targets a missing room', async () => {
    await expect(
      repository.withLockedRoom('missing-room', async () => null),
    ).rejects.toThrow('ROOM_NOT_FOUND');
  });

  it('resolves a match back to its owning room', async () => {
    await database.prisma.user.create({
      data: { id: 'u1', firstName: 'User 1' },
    });

    const room = await repository.createRoom('u1');

    await database.prisma.match.create({
      data: {
        id: 'match-1',
        roomKey: room.roomId,
        firstPlayerId: 'u1',
        seatOrder: ['u1'],
        snapshot: {},
      },
    });

    await expect(repository.loadMatchRoomKey('match-1')).resolves.toMatchObject({
      roomKey: room.roomId,
    });
    await expect(repository.loadMatchRoomKey('missing-match')).resolves.toBeNull();
  });

  it('keeps singleton bootstrap only as a compatibility path', async () => {
    const first = await repository.bootstrapSingletonRoom();
    const second = await repository.bootstrapSingletonRoom();

    expect(first.roomId).toBe(SINGLETON_ROOM_KEY);
    expect(second).toEqual(first);
    expect(first.seats).toHaveLength(4);
    expect(first.seats.map((seat) => seat.seatIndex)).toEqual([0, 1, 2, 3]);
  });

  it('does not store gameplay state in the room aggregate', async () => {
    await database.prisma.user.create({
      data: { id: 'u1', firstName: 'User 1' },
    });

    const room = await repository.createRoom('u1');

    expect(room).toEqual(
      expect.objectContaining({
        roomId: room.roomId,
        currentMatchId: null,
      }),
    );
    expect(room).not.toEqual(
      expect.objectContaining({
        pawns: expect.anything(),
        dice: expect.anything(),
        turnNumber: expect.anything(),
      }),
    );
  });
});
