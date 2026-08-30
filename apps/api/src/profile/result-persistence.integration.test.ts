import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase } from '../test/test-database.js';

const database = createTestDatabase();

beforeEach(async () => {
  await database.prisma.matchParticipantResult.deleteMany();
  await database.prisma.matchResult.deleteMany();
  await database.prisma.outboxRow.deleteMany();
  await database.prisma.processedAction.deleteMany();
  await database.prisma.matchEvent.deleteMany();
  await database.prisma.roomSeat.deleteMany();
  await database.prisma.match.deleteMany();
  await database.prisma.room.deleteMany();
  await database.prisma.authSession.deleteMany();
  await database.prisma.user.deleteMany();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('match result persistence schema', () => {
  it('stores one durable result per match and snapshots participant outcomes', async () => {
    const user = await database.prisma.user.create({
      data: {
        firstName: 'Мария',
      },
    });
    const room = await database.prisma.room.create({
      data: { key: 'single-room', code: 'MAIN', status: 'WAITING' },
    });
    const match = await database.prisma.match.create({
      data: {
        roomKey: room.key,
        firstPlayerId: user.id,
        seatOrder: [user.id, 'user-2'],
        snapshot: { status: 'FINISHED' },
        status: 'FINISHED',
        terminalResult: { winnerPlayerId: user.id, reason: 'HOME_DIAGONAL_COMPLETED' },
        finishedAt: new Date('2026-08-29T12:10:00.000Z'),
      },
    });

    const result = await database.prisma.matchResult.create({
      data: {
        matchId: match.id,
        roomKey: room.key,
        winnerUserId: user.id,
        victoryReason: 'HOME_DIAGONAL_COMPLETED',
        startedAt: new Date('2026-08-29T12:00:00.000Z'),
        finishedAt: new Date('2026-08-29T12:10:00.000Z'),
        participantCount: 2,
        participants: {
          create: [
            {
              userId: user.id,
              displayName: 'Мария',
              color: 'RED',
              outcome: 'WIN',
            },
            {
              userId: 'user-2',
              displayName: 'Ольга',
              color: 'BLUE',
              outcome: 'LOSS',
            },
          ],
        },
      },
      include: { participants: true },
    });

    expect(result.participants).toHaveLength(2);
  });

  it('enforces unique matchId and participant uniqueness within one result', async () => {
    const room = await database.prisma.room.create({
      data: { key: 'single-room', code: 'MAIN', status: 'WAITING' },
    });
    const firstUser = await database.prisma.user.create({ data: { firstName: 'Мария' } });
    const secondUser = await database.prisma.user.create({ data: { firstName: 'Ольга' } });
    const match = await database.prisma.match.create({
      data: {
        roomKey: room.key,
        firstPlayerId: firstUser.id,
        seatOrder: [firstUser.id, secondUser.id],
        snapshot: { status: 'FINISHED' },
        status: 'FINISHED',
        terminalResult: { winnerPlayerId: firstUser.id, reason: 'LAST_ACTIVE_PLAYER' },
        finishedAt: new Date('2026-08-29T12:10:00.000Z'),
      },
    });

    await database.prisma.matchResult.create({
      data: {
        matchId: match.id,
        roomKey: room.key,
        winnerUserId: firstUser.id,
        victoryReason: 'LAST_ACTIVE_PLAYER',
        startedAt: new Date('2026-08-29T12:00:00.000Z'),
        finishedAt: new Date('2026-08-29T12:10:00.000Z'),
        participantCount: 2,
        participants: {
          create: [
            {
              userId: firstUser.id,
              displayName: 'Мария',
              color: 'RED',
              outcome: 'WIN',
            },
            {
              userId: secondUser.id,
              displayName: 'Ольга',
              color: 'BLUE',
              outcome: 'LOSS',
            },
          ],
        },
      },
    });

    await expect(
      database.prisma.matchResult.create({
        data: {
          matchId: match.id,
          roomKey: room.key,
          winnerUserId: firstUser.id,
          victoryReason: 'LAST_ACTIVE_PLAYER',
          startedAt: new Date('2026-08-29T12:00:00.000Z'),
          finishedAt: new Date('2026-08-29T12:10:00.000Z'),
          participantCount: 2,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const anotherMatch = await database.prisma.match.create({
      data: {
        roomKey: room.key,
        firstPlayerId: firstUser.id,
        seatOrder: [firstUser.id, secondUser.id],
        snapshot: { status: 'FINISHED' },
        status: 'FINISHED',
        terminalResult: { winnerPlayerId: firstUser.id, reason: 'LAST_ACTIVE_PLAYER' },
        finishedAt: new Date('2026-08-29T12:20:00.000Z'),
      },
    });

    await expect(
      database.prisma.matchResult.create({
        data: {
          matchId: anotherMatch.id,
          roomKey: room.key,
          winnerUserId: firstUser.id,
          victoryReason: 'LAST_ACTIVE_PLAYER',
          startedAt: new Date('2026-08-29T12:11:00.000Z'),
          finishedAt: new Date('2026-08-29T12:20:00.000Z'),
          participantCount: 2,
          participants: {
            create: [
              {
                userId: firstUser.id,
                displayName: 'Мария',
                color: 'RED',
                outcome: 'WIN',
              },
              {
                userId: firstUser.id,
                displayName: 'Мария',
                color: 'BLUE',
                outcome: 'LOSS',
              },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
