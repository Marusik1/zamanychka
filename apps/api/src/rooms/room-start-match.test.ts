import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createActiveGameState } from '@zamanushka/game-engine';
import { createRoomRepository } from './room-repository.js';
import { createRoomService, type StartMatchStore, type RoomPresenceStore } from './room-service.js';
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

function createService(options?: {
  selectFirstPlayerId?: (participants: ReadonlyArray<{ userId: string; seatIndex: 0 | 1 | 2 | 3 }>) => string;
  matchStore?: StartMatchStore;
}) {
  return createRoomService({
    repository,
    presenceStore: presenceStoreInstance,
    ...options,
  });
}

const database = createTestDatabase();
const repository = createRoomRepository(database.prisma);
let presenceStoreInstance = new InMemoryRoomPresenceStore();

beforeEach(async () => {
  await database.clean();
  presenceStoreInstance = new InMemoryRoomPresenceStore();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

async function seedSeats(count: 2 | 3 | 4) {
  const users = Array.from({ length: count }, (_, index) => ({
    id: `user-${index + 1}`,
    firstName: `User ${index + 1}`,
  }));
  await database.prisma.user.createMany({ data: users });

  const service = createService();
  for (const [index, user] of users.entries()) {
    await service.takeSeat(user.id, { seatIndex: index as 0 | 1 | 2 | 3 });
    await service.connectPresence(user.id);
    await service.setReady(user.id, { ready: true });
  }

  return { service, users };
}

describe('start match orchestration', () => {
  it('rejects non-seated users and keeps ready from auto-starting', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'user-1', firstName: 'User 1' },
        { id: 'user-2', firstName: 'User 2' },
        { id: 'user-3', firstName: 'User 3' },
      ],
    });
    const service = createService();
    await service.takeSeat('user-1', { seatIndex: 0 });
    await service.takeSeat('user-2', { seatIndex: 1 });
    await service.connectPresence('user-1');
    await service.connectPresence('user-2');
    await service.setReady('user-1', { ready: true });
    await service.setReady('user-2', { ready: true });

    await expect(service.startMatch('user-3', {})).resolves.toEqual({
      ok: false,
      error: {
        code: 'SEAT_NOT_OWNED',
        message: 'Seat is not owned by this participant',
      },
    });

    const before = await repository.loadSingletonRoom();
    await service.setReady('user-1', { ready: true });
    const after = await repository.loadSingletonRoom();
    expect(after?.currentMatchId).toBeNull();
    expect(after).toEqual(before);
  });

  it('starts a match for ready connected seats and persists the canonical initial snapshot', async () => {
    const { service, users } = await seedSeats(3);
    expect(await database.prisma.match.findMany()).toHaveLength(0);
    const result = await service.startMatch(users[0]?.id ?? '', {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room.currentMatchId).toBe(result.matchId);

    const room = await repository.loadSingletonRoom();
    expect(room?.currentMatchId).toBe(result.matchId);

    const match = await database.prisma.match.findUnique({
      where: { roomKey: 'single-room' },
    });
    expect(match).not.toBeNull();
    expect(match?.firstPlayerId).toBe('user-1');
    expect(match?.seatOrder).toEqual(['user-1', 'user-2', 'user-3']);
    expect(match?.snapshot).toEqual(
      createActiveGameState({
        playerCount: 3,
        firstPlayerId: 'user-1',
        seatOrder: ['user-1', 'user-2', 'user-3'],
      }),
    );
  });

  it('rejects fewer than two occupied seats and disconnected or unready participants', async () => {
    await database.prisma.user.create({ data: { id: 'user-1', firstName: 'User 1' } });
    const service = createService();
    await service.takeSeat('user-1', { seatIndex: 0 });
    await service.connectPresence('user-1');

    await expect(service.startMatch('user-1', {})).resolves.toEqual({
      ok: false,
      error: { code: 'ROOM_NOT_READY', message: 'Room is not ready' },
    });

    await database.prisma.user.create({ data: { id: 'user-2', firstName: 'User 2' } });
    await service.takeSeat('user-2', { seatIndex: 1 });
    await service.setReady('user-1', { ready: true });
    await service.setReady('user-2', { ready: true });
    await service.disconnectPresence('user-2');

    await expect(service.startMatch('user-1', {})).resolves.toEqual({
      ok: false,
      error: { code: 'SEATED_PARTICIPANT_DISCONNECTED', message: 'Seated participant is disconnected' },
    });
  });

  it('starts matches for two and four ready connected players', async () => {
    const two = await seedSeats(2);
    const twoResult = await two.service.startMatch(two.users[0]?.id ?? '', {});
    expect(twoResult.ok).toBe(true);

    await database.clean();
    const four = await seedSeats(4);
    const fourResult = await four.service.startMatch(four.users[1]?.id ?? '', {});
    expect(fourResult.ok).toBe(true);
  });

  it('serializes concurrent START_MATCH attempts so exactly one match is created', async () => {
    const { service, users } = await seedSeats(2);

    const [first, second] = await Promise.all([
      service.startMatch(users[0]?.id ?? '', {}),
      service.startMatch(users[1]?.id ?? '', {}),
    ]);

    expect(first.ok !== second.ok).toBe(true);
    expect(await database.prisma.match.findMany()).toHaveLength(1);
    const room = await repository.loadSingletonRoom();
    expect(room?.currentMatchId).toBeTruthy();
  });

  it('uses the server-side first-player selector and does not accept client input', async () => {
    const { users } = await seedSeats(3);
    const customService = createService({
      selectFirstPlayerId: (participants) => participants[1]?.userId ?? participants[0]?.userId ?? '',
    });

    const result = await customService.startMatch(users[0]?.id ?? '', {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const match = await database.prisma.match.findUnique({ where: { roomKey: 'single-room' } });
    expect(match?.firstPlayerId).toBe('user-2');
    expect(match?.snapshot).toEqual(
      createActiveGameState({
        playerCount: 3,
        firstPlayerId: 'user-2',
        seatOrder: ['user-1', 'user-2', 'user-3'],
      }),
    );
  });

  it('rolls back both match and room changes if match persistence fails after create', async () => {
    const { service, users } = await seedSeats(2);
    const failingMatchStore: StartMatchStore = {
      async createInitialMatch({ tx, roomId, firstPlayerId, seatOrder, snapshot }) {
        const created = await tx.match.create({
          data: {
            roomKey: roomId,
            firstPlayerId,
            seatOrder,
            snapshot,
          },
          select: { id: true },
        });
        throw new Error(`boom:${created.id}`);
      },
    };
    const failingService = createService({ matchStore: failingMatchStore });

    await expect(failingService.startMatch(users[0]?.id ?? '', {})).rejects.toThrow(/boom:/);
    expect(await repository.loadSingletonRoom()).toEqual({
      roomId: 'single-room',
      version: 4,
      currentMatchId: null,
      seats: [
        { seatIndex: 0, userId: 'user-1', ready: true },
        { seatIndex: 1, userId: 'user-2', ready: true },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
    });
    expect(await database.prisma.match.findMany()).toHaveLength(0);
  });
});
