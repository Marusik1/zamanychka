import type { Prisma } from '../generated/prisma/client.js';
import type { AppPrismaClient } from '../infrastructure/prisma.js';
import type { PersistedRoom, RoomSeatIndex, RoomSeatRecord } from './domain.js';

export const SINGLETON_ROOM_KEY = 'single-room';
const DEFAULT_SEAT_INDICES: readonly RoomSeatIndex[] = [0, 1, 2, 3];

type TxClient = Prisma.TransactionClient;

function sortSeats(seats: readonly RoomSeatRecord[]): RoomSeatRecord[] {
  return [...seats].sort((left, right) => left.seatIndex - right.seatIndex);
}

function toDomain(room: {
  key: string;
  version: number;
  currentMatchId: string | null;
  seats: { seatIndex: number; userId: string | null; ready: boolean }[];
}): PersistedRoom {
  return {
    roomId: room.key,
    version: room.version,
    currentMatchId: room.currentMatchId,
    seats: sortSeats(
      room.seats.map((seat) => ({
        seatIndex: seat.seatIndex as 0 | 1 | 2 | 3,
        userId: seat.userId,
        ready: seat.ready,
      })),
    ),
  };
}

async function ensureSingletonRoom(tx: TxClient) {
  await tx.room.upsert({
    where: { key: SINGLETON_ROOM_KEY },
    create: {
      key: SINGLETON_ROOM_KEY,
      seats: {
        create: DEFAULT_SEAT_INDICES.map((seatIndex) => ({
          seatIndex,
          ready: false,
        })),
      },
    },
    update: {},
  });
}

async function loadRoom(tx: TxClient): Promise<PersistedRoom | null> {
  const room = await tx.room.findUnique({
    where: { key: SINGLETON_ROOM_KEY },
    include: { seats: { orderBy: { seatIndex: 'asc' } } },
  });
  return room ? toDomain(room) : null;
}

export async function lockSingletonRoomInTransaction(tx: TxClient): Promise<PersistedRoom> {
  await tx.$queryRaw`
    SELECT "key"
    FROM "Room"
    WHERE "key" = ${SINGLETON_ROOM_KEY}
    FOR UPDATE
  `;
  const room = await loadRoom(tx);
  if (!room) {
    throw new Error('singleton room lock failed');
  }
  return room;
}

export async function persistSingletonRoom(
  tx: TxClient,
  room: PersistedRoom,
): Promise<PersistedRoom> {
  await tx.room.update({
    where: { key: SINGLETON_ROOM_KEY },
    data: {
      version: room.version,
      currentMatchId: room.currentMatchId,
    },
  });

  for (const seat of room.seats) {
    await tx.roomSeat.upsert({
      where: {
        roomKey_seatIndex: {
          roomKey: SINGLETON_ROOM_KEY,
          seatIndex: seat.seatIndex,
        },
      },
      create: {
        roomKey: SINGLETON_ROOM_KEY,
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        ready: seat.ready,
      },
      update: {
        userId: seat.userId,
        ready: seat.ready,
      },
    });
  }

  const saved = await loadRoom(tx);
  if (!saved) {
    throw new Error('singleton room save failed');
  }
  return saved;
}

export function createRoomRepository(prisma: AppPrismaClient) {
  return {
    async loadParticipantDisplayNames(userIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
      if (userIds.length === 0) return new Map();

      const users = await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, firstName: true, lastName: true },
      });

      return new Map(
        users.map((user) => [
          user.id,
          [user.firstName, user.lastName].filter(Boolean).join(' '),
        ]),
      );
    },

    async bootstrapSingletonRoom(): Promise<PersistedRoom> {
      return prisma.$transaction(async (tx) => {
        await ensureSingletonRoom(tx);
        const room = await loadRoom(tx);
        if (!room) {
          throw new Error('singleton room bootstrap failed');
        }
        return room;
      });
    },

    async loadSingletonRoom(): Promise<PersistedRoom | null> {
      return prisma.$transaction(async (tx) => loadRoom(tx));
    },

    async saveSingletonRoom(room: PersistedRoom): Promise<PersistedRoom> {
      return prisma.$transaction(async (tx) => {
        await ensureSingletonRoom(tx);
        return persistSingletonRoom(tx, room);
      });
    },

    async withLockedSingletonRoom<T>(
      handler: (tx: TxClient, room: PersistedRoom) => Promise<T>,
    ): Promise<T> {
      return prisma.$transaction(async (tx) => {
        await ensureSingletonRoom(tx);
        return handler(tx, await lockSingletonRoomInTransaction(tx));
      });
    },
  };
}
