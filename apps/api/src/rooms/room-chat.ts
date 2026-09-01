import type { RoomChatHistory, RoomChatMessage, SendRoomChatMessageRequest } from '@zamanushka/shared';

import type { AppPrismaClient } from '../infrastructure/prisma.js';
import type { RoomId } from './domain.js';

function toMessage(row: {
  id: string;
  roomKey: string;
  userId: string;
  text: string;
  createdAt: Date;
  user: { firstName: string; lastName: string | null };
}): RoomChatMessage {
  return {
    id: row.id,
    roomId: row.roomKey,
    userId: row.userId,
    displayName: [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.userId,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface RoomChatService {
  list(actorUserId: string, roomId: RoomId): Promise<RoomChatHistory>;
  send(actorUserId: string, roomId: RoomId, request: SendRoomChatMessageRequest): Promise<RoomChatMessage>;
}

export function createRoomChatService(prisma: AppPrismaClient): RoomChatService {
  async function requireMembership(actorUserId: string, roomId: RoomId) {
    const membership = await prisma.roomMembership.findUnique({
      where: { userId: actorUserId },
      select: { roomKey: true },
    });

    if (!membership || membership.roomKey !== roomId) {
      throw new Error('NOT_ROOM_MEMBER');
    }
  }

  return {
    async list(actorUserId, roomId) {
      await requireMembership(actorUserId, roomId);

      const rows = await prisma.roomChatMessage.findMany({
        where: { roomKey: roomId },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });

      return { messages: rows.map(toMessage) };
    },

    async send(actorUserId, roomId, request) {
      await requireMembership(actorUserId, roomId);

      const row = await prisma.roomChatMessage.create({
        data: {
          roomKey: roomId,
          userId: actorUserId,
          text: request.text.trim(),
        },
        include: { user: { select: { firstName: true, lastName: true } } },
      });

      return toMessage(row);
    },
  };
}
