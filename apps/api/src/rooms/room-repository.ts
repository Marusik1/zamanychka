import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import type { AppPrismaClient } from '../infrastructure/prisma.js';
import type { PersistedRoom, RoomSeatIndex } from './domain.js';

export const SINGLETON_ROOM_KEY = 'single-room';
const SEATS: readonly RoomSeatIndex[] = [0, 1, 2, 3];
type TxClient = Prisma.TransactionClient;

function toDomain(room: {
  key: string;
  code: string;
  status: string;
  version: number;
  currentMatchId: string | null;
  seats: {
    seatIndex: number;
    userId: string | null;
    participantId: string | null;
    participantKind: 'HUMAN' | 'BOT' | null;
    ready: boolean;
  }[];
  memberships: { userId: string; joinedAt: Date }[];
}): PersistedRoom {
  return {
    roomId: room.key,
    code: room.code,
    status: room.status as PersistedRoom['status'],
    version: room.version,
    currentMatchId: room.currentMatchId,
    members: room.memberships
      .map((membership) => ({
        userId: membership.userId,
        joinedAt: membership.joinedAt.toISOString(),
      }))
      .sort(
        (left, right) =>
          left.joinedAt.localeCompare(right.joinedAt) || left.userId.localeCompare(right.userId),
      ),
    seats: room.seats
      .map((seat) => ({
        seatIndex: seat.seatIndex as RoomSeatIndex,
        userId: seat.userId,
        participantId: seat.participantId ?? seat.userId,
        participantKind: seat.participantKind ?? (seat.userId ? 'HUMAN' : null),
        ready: seat.ready,
      }))
      .sort((left, right) => left.seatIndex - right.seatIndex),
  };
}

async function loadRoomTx(tx: TxClient, roomId: string) {
  const row = await tx.room.findUnique({
    where: { key: roomId },
    include: {
      seats: { orderBy: { seatIndex: 'asc' } },
      memberships: { orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }] },
    },
  });
  return row ? toDomain(row) : null;
}

export async function lockRoomInTransaction(tx: TxClient, roomId: string): Promise<PersistedRoom> {
  await tx.$queryRaw`SELECT "key" FROM "Room" WHERE "key" = ${roomId} FOR UPDATE`;
  const room = await loadRoomTx(tx, roomId);
  if (!room) throw new Error('ROOM_NOT_FOUND');
  return room;
}

export async function persistRoom(tx: TxClient, room: PersistedRoom) {
  await tx.room.update({
    where: { key: room.roomId },
    data: {
      version: room.version,
      status: room.status,
      currentMatchId: room.currentMatchId,
    },
  });

  for (const seat of room.seats) {
    await tx.roomSeat.update({
      where: {
        roomKey_seatIndex: {
          roomKey: room.roomId,
          seatIndex: seat.seatIndex,
        },
      },
      data: {
        userId: seat.userId,
        participantId: seat.participantId ?? seat.userId,
        participantKind: seat.participantKind ?? (seat.userId ? 'HUMAN' : null),
        ready: seat.ready,
      },
    });
  }

  const saved = await loadRoomTx(tx, room.roomId);
  if (!saved) throw new Error('ROOM_NOT_FOUND');
  return saved;
}

export const lockSingletonRoomInTransaction = (tx: TxClient) =>
  lockRoomInTransaction(tx, SINGLETON_ROOM_KEY);
export const persistSingletonRoom = (tx: TxClient, room: PersistedRoom) => persistRoom(tx, room);

export function createRoomRepository(prisma: AppPrismaClient) {
  async function ensureLegacy(tx: TxClient) {
    await tx.room.upsert({
      where: { key: SINGLETON_ROOM_KEY },
      create: {
        key: SINGLETON_ROOM_KEY,
        code: 'MAIN',
        seats: { create: SEATS.map((seatIndex) => ({ seatIndex })) },
      },
      update: {},
    });
  }

  return {
    async createRoom(userId: string) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.roomMembership.findUnique({ where: { userId } });
        if (existing) {
          const existingRoom = await loadRoomTx(tx, existing.roomKey);
          if (
            existingRoom &&
            (existingRoom.status === 'ACTIVE' || existingRoom.currentMatchId !== null)
          ) {
            return existingRoom;
          }
          if (existingRoom && existingRoom.status !== 'CLOSED') {
            // Room ownership is intentionally derived from the oldest HUMAN membership.
            // When the current owner creates a new room, deleting their old
            // membership below atomically transfers ownership to the next human
            // member. Bots are only seats/participants, never room memberships,
            // so ownership cannot move to a bot. If no other human remains, the
            // old waiting room is closed and any bot seats are cleared.
            const nextRoom: PersistedRoom = {
              ...existingRoom,
              version: existingRoom.version + 1,
              status: existingRoom.members.length <= 1 ? 'CLOSED' : existingRoom.status,
              seats: existingRoom.seats.map((seat) =>
                seat.userId === userId
                  ? {
                      ...seat,
                      userId: null,
                      participantId: null,
                      participantKind: null,
                      ready: false,
                    }
                  : seat,
              ),
            };
            if (nextRoom.status === 'CLOSED') {
              nextRoom.seats = nextRoom.seats.map((seat) => ({
                ...seat,
                userId: null,
                participantId: null,
                participantKind: null,
                ready: false,
              }));
            }
            await persistRoom(tx, nextRoom);
          }
          await tx.roomMembership.delete({ where: { userId } });
        }

        const roomId = randomUUID();
        const code = randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase();

        await tx.room.create({
          data: {
            key: roomId,
            code,
            seats: { create: SEATS.map((seatIndex) => ({ seatIndex })) },
            memberships: { create: { userId } },
          },
        });

        const created = await loadRoomTx(tx, roomId);
        if (!created) throw new Error('ROOM_NOT_FOUND');
        return created;
      });
    },

    async listRooms() {
      return (
        await prisma.room.findMany({
          where: { status: { not: 'CLOSED' } },
          include: { seats: true, memberships: true },
          orderBy: { createdAt: 'asc' },
        })
      ).map(toDomain);
    },

    async loadRoom(roomId: string) {
      return prisma.$transaction((tx) => loadRoomTx(tx, roomId));
    },

    async loadRoomInTransaction(tx: TxClient, roomId: string) {
      return loadRoomTx(tx, roomId);
    },

    async loadMembershipForUser(userId: string) {
      return prisma.roomMembership.findUnique({ where: { userId } });
    },

    async loadCurrentMembershipRoom(userId: string) {
      const membership = await prisma.roomMembership.findUnique({
        where: { userId },
        include: { room: true },
      });
      if (!membership) return null;
      return {
        roomId: membership.room.key,
        code: membership.room.code,
        status: membership.room.status as PersistedRoom['status'],
        version: membership.room.version,
        currentMatchId: membership.room.currentMatchId,
      };
    },

    async loadMatchRoomKey(matchId: string) {
      return prisma.match.findUnique({
        where: { id: matchId },
        select: { roomKey: true },
      });
    },

    async withLockedRoom<T>(
      roomId: string,
      handler: (tx: TxClient, room: PersistedRoom) => Promise<T>,
    ) {
      return prisma.$transaction(async (tx) =>
        handler(tx, await lockRoomInTransaction(tx, roomId)),
      );
    },

    async loadParticipantDisplayNames(userIds: readonly string[]) {
      if (!userIds.length) return new Map<string, string>();

      const users = await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, firstName: true, lastName: true },
      });

      return new Map(
        users.map((user) => [
          user.id,
          [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id,
        ]),
      );
    },

    async bootstrapSingletonRoom() {
      return prisma.$transaction(async (tx) => {
        await ensureLegacy(tx);
        return (await loadRoomTx(tx, SINGLETON_ROOM_KEY))!;
      });
    },

    async loadSingletonRoom() {
      return prisma.$transaction((tx) => loadRoomTx(tx, SINGLETON_ROOM_KEY));
    },

    async saveSingletonRoom(room: PersistedRoom) {
      return prisma.$transaction(async (tx) => {
        await ensureLegacy(tx);
        return persistRoom(tx, room);
      });
    },

    async withLockedSingletonRoom<T>(
      handler: (tx: TxClient, room: PersistedRoom) => Promise<T>,
    ) {
      return prisma.$transaction(async (tx) => {
        await ensureLegacy(tx);
        return handler(tx, await lockRoomInTransaction(tx, SINGLETON_ROOM_KEY));
      });
    },
  };
}
