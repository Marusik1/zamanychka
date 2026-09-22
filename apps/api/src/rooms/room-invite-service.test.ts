import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase } from '../test/test-database.js';
import {
  RoomInviteServiceError,
  createRoomInviteService,
  hashRoomInviteToken,
} from './room-invite-service.js';

const database = createTestDatabase();

beforeEach(async () => {
  await database.clean();
  await database.prisma.user.createMany({
    data: [
      { id: 'user-1', firstName: 'User 1' },
      { id: 'user-2', firstName: 'User 2' },
      { id: 'user-3', firstName: 'User 3' },
      { id: 'user-4', firstName: 'User 4' },
    ],
  });
  await database.prisma.room.create({
    data: {
      key: 'room-1',
      code: 'ROOM1',
      status: 'WAITING',
      memberships: { create: [{ userId: 'user-1' }] },
      seats: {
        create: [
          { seatIndex: 0, userId: 'user-1', participantId: 'user-1', participantKind: 'HUMAN' },
          { seatIndex: 1 },
          { seatIndex: 2 },
          { seatIndex: 3 },
        ],
      },
    },
  });
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('room invite service', () => {
  it('returns the raw token once and stores only a hash', async () => {
    const service = createRoomInviteService(database.prisma, {
      generateToken: () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQR0123456789_-',
      now: () => new Date('2026-09-22T00:00:00.000Z'),
    });

    const invite = await service.createInvite('user-1', 'room-1');

    expect(invite).toEqual({
      token: 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQR0123456789_-',
      expiresAt: new Date('2026-09-29T00:00:00.000Z'),
    });
    const row = await database.prisma.roomInvite.findFirstOrThrow();
    expect(row.tokenHash).toBe(hashRoomInviteToken(invite.token));
    expect(JSON.stringify(row)).not.toContain(invite.token);
  });

  it('resolves a valid raw token and rejects a one-character modified token', async () => {
    const service = createRoomInviteService(database.prisma);
    const invite = await service.createInvite('user-1', 'room-1');

    await expect(service.resolveInvite(invite.token)).resolves.toEqual({
      roomId: 'room-1',
      roomStatus: 'WAITING',
    });

    await expect(service.resolveInvite(`${invite.token.slice(0, -1)}A`)).rejects.toMatchObject({
      code: 'INVITE_NOT_FOUND',
    });
  });

  it('does not create membership or bypass full-room rules when resolving an invite', async () => {
    await database.prisma.room.update({
      where: { key: 'room-1' },
      data: {
        memberships: {
          create: [{ userId: 'user-3' }, { userId: 'user-4' }],
        },
        seats: {
          update: [
            {
              where: { roomKey_seatIndex: { roomKey: 'room-1', seatIndex: 1 } },
              data: { userId: 'user-3', participantId: 'user-3', participantKind: 'HUMAN' },
            },
            {
              where: { roomKey_seatIndex: { roomKey: 'room-1', seatIndex: 2 } },
              data: { userId: 'user-4', participantId: 'user-4', participantKind: 'HUMAN' },
            },
            {
              where: { roomKey_seatIndex: { roomKey: 'room-1', seatIndex: 3 } },
              data: { participantId: 'bot-room-1-3', participantKind: 'BOT' },
            },
          ],
        },
      },
    });
    const service = createRoomInviteService(database.prisma);
    const invite = await service.createInvite('user-1', 'room-1');

    await expect(service.resolveInvite(invite.token)).resolves.toEqual({
      roomId: 'room-1',
      roomStatus: 'WAITING',
    });

    await expect(
      database.prisma.roomMembership.count({ where: { roomId: 'room-1', userId: 'user-2' } }),
    ).resolves.toBe(0);
    await expect(
      database.prisma.roomSeat.count({ where: { roomId: 'room-1', userId: 'user-2' } }),
    ).resolves.toBe(0);
  });

  it('rejects expired and revoked invites', async () => {
    const service = createRoomInviteService(database.prisma, {
      generateToken: () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQR0123456789_-',
      now: () => new Date('2026-09-22T00:00:00.000Z'),
    });
    const invite = await service.createInvite('user-1', 'room-1');

    const expired = createRoomInviteService(database.prisma, {
      now: () => new Date('2026-09-30T00:00:00.000Z'),
    });
    await expect(expired.resolveInvite(invite.token)).rejects.toMatchObject({
      code: 'INVITE_EXPIRED',
    });

    await database.prisma.roomInvite.updateMany({
      data: { revokedAt: new Date('2026-09-23T00:00:00.000Z'), expiresAt: null },
    });
    await expect(service.resolveInvite(invite.token)).rejects.toMatchObject({
      code: 'INVITE_REVOKED',
    });
  });

  it('rejects closed rooms and unrelated invite creators', async () => {
    const service = createRoomInviteService(database.prisma);

    await expect(service.createInvite('user-2', 'room-1')).rejects.toBeInstanceOf(
      RoomInviteServiceError,
    );
    await expect(service.createInvite('user-2', 'room-1')).rejects.toMatchObject({
      code: 'NOT_ROOM_MEMBER',
    });

    const invite = await service.createInvite('user-1', 'room-1');
    await database.prisma.room.update({ where: { key: 'room-1' }, data: { status: 'CLOSED' } });
    await expect(service.resolveInvite(invite.token)).rejects.toMatchObject({
      code: 'ROOM_CLOSED',
    });
  });

  it('rejects invite creation for an active room', async () => {
    await database.prisma.match.create({
      data: {
        id: 'match-1',
        roomKey: 'room-1',
        firstPlayerId: 'user-1',
        seatOrder: ['user-1', 'user-2'],
        snapshot: {},
      },
    });
    await database.prisma.room.update({
      where: { key: 'room-1' },
      data: { status: 'ACTIVE', currentMatchId: 'match-1' },
    });

    await expect(createRoomInviteService(database.prisma).createInvite('user-1', 'room-1')).rejects.toMatchObject({
      code: 'ROOM_ALREADY_ACTIVE',
    });
  });
});
