import { createHash, randomBytes } from 'node:crypto';
import type { RoomInviteErrorCode } from '@zamanushka/shared';

import type { AppPrismaClient } from '../infrastructure/prisma.js';

const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export class RoomInviteServiceError extends Error {
  constructor(readonly code: RoomInviteErrorCode) {
    super(code);
  }
}

export function generateRoomInviteToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashRoomInviteToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createRoomInviteService(
  prisma: AppPrismaClient,
  options: {
    now?: () => Date;
    generateToken?: () => string;
    inviteTtlMs?: number;
  } = {},
) {
  const now = options.now ?? (() => new Date());
  const generateToken = options.generateToken ?? generateRoomInviteToken;
  const inviteTtlMs = options.inviteTtlMs ?? DEFAULT_INVITE_TTL_MS;

  return {
    async createInvite(userId: string, roomId: string) {
      const room = await prisma.room.findUnique({
        where: { key: roomId },
        include: { memberships: { where: { userId }, take: 1 } },
      });

      if (!room) throw new RoomInviteServiceError('ROOM_NOT_FOUND');
      if (room.status === 'CLOSED') throw new RoomInviteServiceError('ROOM_CLOSED');
      if (room.status === 'ACTIVE' || room.currentMatchId)
        throw new RoomInviteServiceError('ROOM_ALREADY_ACTIVE');
      if (room.memberships.length === 0) throw new RoomInviteServiceError('NOT_ROOM_MEMBER');

      const token = generateToken();
      if (!TOKEN_PATTERN.test(token)) throw new Error('Generated room invite token is invalid');
      const expiresAt = new Date(now().getTime() + inviteTtlMs);

      await prisma.roomInvite.create({
        data: {
          tokenHash: hashRoomInviteToken(token),
          roomId,
          createdByUserId: userId,
          expiresAt,
        },
      });

      return { token, expiresAt };
    },

    async resolveInvite(token: string) {
      if (!TOKEN_PATTERN.test(token)) throw new RoomInviteServiceError('INVITE_NOT_FOUND');

      const invite = await prisma.roomInvite.findUnique({
        where: { tokenHash: hashRoomInviteToken(token) },
        include: { room: true },
      });

      if (!invite) throw new RoomInviteServiceError('INVITE_NOT_FOUND');
      if (invite.revokedAt) throw new RoomInviteServiceError('INVITE_REVOKED');
      if (invite.expiresAt && invite.expiresAt.getTime() <= now().getTime())
        throw new RoomInviteServiceError('INVITE_EXPIRED');
      if (!invite.room) throw new RoomInviteServiceError('ROOM_NOT_FOUND');
      if (invite.room.status === 'CLOSED') throw new RoomInviteServiceError('ROOM_CLOSED');

      return { roomId: invite.room.key, roomStatus: invite.room.status as 'WAITING' | 'ACTIVE' };
    },
  };
}

export type RoomInviteService = ReturnType<typeof createRoomInviteService>;
