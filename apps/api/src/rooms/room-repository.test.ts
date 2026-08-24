import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoomRepository, SINGLETON_ROOM_KEY } from './room-repository.js';
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
  it('bootstraps the singleton room and returns the same room on repeated bootstrap', async () => {
    const first = await repository.bootstrapSingletonRoom();
    const second = await repository.bootstrapSingletonRoom();

    expect(first.roomId).toBe(SINGLETON_ROOM_KEY);
    expect(second).toEqual(first);
    expect(first.seats).toHaveLength(4);
    expect(first.seats.map((seat) => seat.seatIndex)).toEqual([0, 1, 2, 3]);
  });

  it('round-trips room state, seat assignment, readiness, and current match pointer', async () => {
    const created = await repository.bootstrapSingletonRoom();
    await database.prisma.user.createMany({
      data: [
        { id: 'u1', firstName: 'User 1' },
        { id: 'u2', firstName: 'User 2' },
      ],
    });
    const saved = await repository.saveSingletonRoom({
      ...created,
      version: 7,
      currentMatchId: 'match-1',
      seats: [
        { seatIndex: 0, userId: 'u1', ready: true },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: 'u2', ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
    });

    expect(saved.version).toBe(7);
    expect(saved.currentMatchId).toBe('match-1');
    expect(saved.seats).toEqual([
      { seatIndex: 0, userId: 'u1', ready: true },
      { seatIndex: 1, userId: null, ready: false },
      { seatIndex: 2, userId: 'u2', ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);

    const loaded = await repository.loadSingletonRoom();
    expect(loaded).toEqual(saved);
  });

  it('exposes a serialized mutation boundary through the singleton room lock', async () => {
    const result = await repository.withLockedSingletonRoom(async (tx, room) => {
      expect(room.roomId).toBe(SINGLETON_ROOM_KEY);
      const roomRow = await tx.room.findUnique({
        where: { key: SINGLETON_ROOM_KEY },
      });
      return roomRow?.key ?? null;
    });

    expect(result).toBe(SINGLETON_ROOM_KEY);
  });

  it('does not store gameplay state in the room', async () => {
    const room = await repository.bootstrapSingletonRoom();
    expect(room).toEqual(
      expect.objectContaining({
        roomId: SINGLETON_ROOM_KEY,
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
