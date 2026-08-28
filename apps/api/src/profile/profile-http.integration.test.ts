import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAuthRepository } from '../auth/auth-repository.js';
import { createAuthService } from '../auth/auth-service.js';
import { createTestDatabase } from '../test/test-database.js';
import { createProfileRepository } from './profile-repository.js';
import { createProfileService } from './profile-service.js';

const database = createTestDatabase();

function cookiePair(header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new Error('expected session cookie');
  }
  const pair = value.split(';')[0];
  if (!pair) {
    throw new Error('expected cookie pair');
  }
  return pair;
}

async function createApp() {
  const authRepository = createAuthRepository(database.prisma);
  const authService = createAuthService({
    repository: authRepository,
    sessionTtlSeconds: 600,
    devUsers: [
      { devUserKey: 'one', displayName: 'One' },
      { devUserKey: 'two', displayName: 'Two' },
      { devUserKey: 'three', displayName: 'Three' },
    ],
  });
  return buildApp({
    probes: [],
    auth: {
      service: authService,
      config: {
        mode: 'development',
        users: [
          { devUserKey: 'one', displayName: 'One' },
          { devUserKey: 'two', displayName: 'Two' },
          { devUserKey: 'three', displayName: 'Three' },
        ],
        allowedOrigins: ['http://localhost:3000'],
        cookie: {
          name: 'zamanushka-session',
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
        },
        sessionTtlSeconds: 600,
      },
    },
    profile: {
      service: createProfileService({
        repository: createProfileRepository(database.prisma),
      }),
    },
  });
}

async function login(app: Awaited<ReturnType<typeof createApp>>, devUserKey: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/dev',
    headers: {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    },
    payload: { devUserKey },
  });
  return cookiePair(response.headers['set-cookie']);
}

async function seedResult(input: {
  roomKey?: string;
  finishedAt: string;
  winnerUserId: string;
  victoryReason: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER';
  participants: Array<{
    userId: string;
    displayName: string;
    color: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
    outcome: 'WIN' | 'LOSS' | 'SURRENDERED';
  }>;
}) {
  const roomKey = input.roomKey ?? 'single-room';
  await database.prisma.room.upsert({
    where: { key: roomKey },
    update: {},
    create: { key: roomKey },
  });
  const startedAt = new Date(new Date(input.finishedAt).getTime() - 60_000);
  const match = await database.prisma.match.create({
    data: {
      roomKey,
      firstPlayerId: input.participants[0]?.userId ?? input.winnerUserId,
      seatOrder: input.participants.map((participant) => participant.userId),
      snapshot: { status: 'FINISHED' },
      status: 'FINISHED',
      stateVersion: 1,
      terminalResult: {
        winnerPlayerId: input.winnerUserId,
        reason: input.victoryReason,
      },
      finishedAt: new Date(input.finishedAt),
      result: {
        create: {
          roomKey,
          winnerUserId: input.winnerUserId,
          victoryReason: input.victoryReason,
          startedAt,
          finishedAt: new Date(input.finishedAt),
          participantCount: input.participants.length,
          participants: {
            create: input.participants,
          },
        },
      },
    },
    include: { result: true },
  });
  return match.result;
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('profile + history HTTP', () => {
  it(
    'returns authenticated profile, derived stats, latest five recent results, and excludes other-user-only results',
    async () => {
    const app = await createApp();
    const cookie = await login(app, 'one');
    await login(app, 'two');
    await login(app, 'three');
    const currentUser = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'one' } });
    const secondUser = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'two' } });
    const thirdUser = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'three' } });

    await database.prisma.user.update({
      where: { id: currentUser.id },
      data: { username: 'one_user', photoUrl: 'https://example.com/one.png' },
    });

    for (const [index, outcome] of (
      ['WIN', 'LOSS', 'SURRENDERED', 'WIN', 'LOSS', 'WIN'] as const
    ).entries()) {
      const winnerUserId = outcome === 'WIN' ? currentUser.id : secondUser.id;
      await seedResult({
        finishedAt: `2026-08-29T12:0${index}:00.000Z`,
        winnerUserId,
        victoryReason: outcome === 'SURRENDERED' ? 'LAST_ACTIVE_PLAYER' : 'HOME_DIAGONAL_COMPLETED',
        participants: [
          {
            userId: currentUser.id,
            displayName: 'One',
            color: 'RED',
            outcome,
          },
          {
            userId: secondUser.id,
            displayName: 'Two',
            color: 'YELLOW',
            outcome: outcome === 'WIN' ? 'LOSS' : 'WIN',
          },
        ],
      });
    }

    await seedResult({
      finishedAt: '2026-08-29T12:59:00.000Z',
      winnerUserId: thirdUser.id,
      victoryReason: 'LAST_ACTIVE_PLAYER',
      participants: [
        {
          userId: thirdUser.id,
          displayName: 'Three',
          color: 'GREEN',
          outcome: 'WIN',
        },
        {
          userId: secondUser.id,
          displayName: 'Two',
          color: 'YELLOW',
          outcome: 'LOSS',
        },
      ],
    });

    const response = await app.inject({
      url: '/api/profile',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        id: currentUser.id,
        displayName: 'One',
        telegramUsername: 'one_user',
        avatarUrl: 'https://example.com/one.png',
      },
      stats: {
        gamesPlayed: 6,
        wins: 3,
        losses: 3,
      },
    });
    expect(response.json().stats.winRate).toBeCloseTo(0.5);
    expect(response.json().recentResults).toHaveLength(5);
    expect(response.json().recentResults.map((item: { finishedAt: string }) => item.finishedAt)).toEqual([
      '2026-08-29T12:05:00.000Z',
      '2026-08-29T12:04:00.000Z',
      '2026-08-29T12:03:00.000Z',
      '2026-08-29T12:02:00.000Z',
      '2026-08-29T12:01:00.000Z',
    ]);
    expect(
      response.json().recentResults.every(
        (item: { participants: Array<{ userId: string }> }) =>
          item.participants.some((participant) => participant.userId === currentUser.id),
      ),
    ).toBe(true);
    await app.close();
    },
    15_000,
  );

  it('returns zero-game profile state and rejects unauthenticated access', async () => {
    const app = await createApp();
    const cookie = await login(app, 'one');

    const authenticated = await app.inject({
      url: '/api/profile',
      headers: { cookie },
    });
    const unauthenticated = await app.inject('/api/profile');

    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.json()).toEqual({
      user: {
        id: expect.any(String),
        displayName: 'One',
        telegramUsername: null,
        avatarUrl: null,
      },
      stats: {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      },
      recentResults: [],
    });
    expect(unauthenticated.statusCode).toBe(401);
    await app.close();
  });

  it('returns only own history with stable newest-first pagination and no duplicate rows across pages', async () => {
    const app = await createApp();
    const cookie = await login(app, 'one');
    await login(app, 'two');
    await login(app, 'three');
    const currentUser = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'one' } });
    const secondUser = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'two' } });
    const thirdUser = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'three' } });

    const timestamps = [
      '2026-08-29T12:05:00.000Z',
      '2026-08-29T12:04:00.000Z',
      '2026-08-29T12:04:00.000Z',
      '2026-08-29T12:03:00.000Z',
      '2026-08-29T12:02:00.000Z',
      '2026-08-29T12:01:00.000Z',
    ];
    for (const [index, finishedAt] of timestamps.entries()) {
      await seedResult({
        finishedAt,
        winnerUserId: index % 2 === 0 ? currentUser.id : secondUser.id,
        victoryReason: 'HOME_DIAGONAL_COMPLETED',
        participants: [
          {
            userId: currentUser.id,
            displayName: 'One',
            color: 'RED',
            outcome: index % 3 === 0 ? 'SURRENDERED' : index % 2 === 0 ? 'WIN' : 'LOSS',
          },
          {
            userId: secondUser.id,
            displayName: 'Two',
            color: 'YELLOW',
            outcome: index % 2 === 0 ? 'LOSS' : 'WIN',
          },
        ],
      });
    }
    await seedResult({
      finishedAt: '2026-08-29T12:06:00.000Z',
      winnerUserId: thirdUser.id,
      victoryReason: 'LAST_ACTIVE_PLAYER',
      participants: [
        { userId: thirdUser.id, displayName: 'Three', color: 'GREEN', outcome: 'WIN' },
        { userId: secondUser.id, displayName: 'Two', color: 'YELLOW', outcome: 'LOSS' },
      ],
    });

    const firstPage = await app.inject({
      url: '/api/profile/history?limit=2',
      headers: { cookie },
    });
    const secondPage = await app.inject({
      url: `/api/profile/history?limit=2&cursor=${encodeURIComponent(firstPage.json().nextCursor)}`,
      headers: { cookie },
    });
    const maxed = await app.inject({
      url: '/api/profile/history?limit=999',
      headers: { cookie },
    });
    const unauthenticated = await app.inject('/api/profile/history');

    expect(firstPage.statusCode).toBe(200);
    expect(secondPage.statusCode).toBe(200);
    expect(unauthenticated.statusCode).toBe(401);
    expect(firstPage.json().items).toHaveLength(2);
    expect(maxed.json().items).toHaveLength(6);
    const firstIds = firstPage.json().items.map((item: { id: string }) => item.id);
    const secondIds = secondPage.json().items.map((item: { id: string }) => item.id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
    expect(firstPage.json().items[0].finishedAt >= firstPage.json().items[1].finishedAt).toBe(true);
    expect(
      [...firstPage.json().items, ...secondPage.json().items].every(
        (item: { participants: Array<{ userId: string }>; currentUserOutcome: string }) =>
          item.participants.some((participant) => participant.userId === currentUser.id) &&
          ['WIN', 'LOSS', 'SURRENDERED'].includes(item.currentUserOutcome),
      ),
    ).toBe(true);
    await app.close();
  });

  it('uses a default history page size of 20 and ignores arbitrary userId query noise', async () => {
    const app = await createApp();
    const cookie = await login(app, 'one');
    await login(app, 'two');
    const currentUser = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'one' } });
    const secondUser = await database.prisma.user.findFirstOrThrow({ where: { devUserKey: 'two' } });

    for (let index = 0; index < 21; index += 1) {
      await seedResult({
        finishedAt: new Date(Date.UTC(2026, 7, 29, 12, index, 0)).toISOString(),
        winnerUserId: currentUser.id,
        victoryReason: 'HOME_DIAGONAL_COMPLETED',
        participants: [
          { userId: currentUser.id, displayName: 'One', color: 'RED', outcome: 'WIN' },
          { userId: secondUser.id, displayName: 'Two', color: 'YELLOW', outcome: 'LOSS' },
        ],
      });
    }

    const response = await app.inject({
      url: `/api/profile/history?userId=${encodeURIComponent(secondUser.id)}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(20);
    expect(response.json().nextCursor).toEqual(expect.any(String));
    expect(
      response.json().items.every((item: { participants: Array<{ userId: string }> }) =>
        item.participants.some((participant) => participant.userId === currentUser.id),
      ),
    ).toBe(true);
    await app.close();
  });
});
