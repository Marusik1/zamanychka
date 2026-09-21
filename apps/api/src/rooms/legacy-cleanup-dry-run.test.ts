import { describe, expect, it, vi } from 'vitest';

import { findLegacyRoomCleanupCandidates } from './legacy-cleanup-dry-run.js';

describe('legacy room cleanup dry-run', () => {
  it('reports only WAITING rooms without active match, human membership, or seated humans', async () => {
    const updatedAt = new Date('2026-09-21T10:00:00.000Z');
    const prisma = {
      room: {
        findMany: vi.fn(async () => [
          {
            key: 'candidate-room',
            status: 'WAITING',
            currentMatchId: null,
            updatedAt,
            memberships: [],
            seats: [
              {
                userId: null,
                participantKind: 'BOT',
              },
              {
                userId: null,
                participantKind: null,
              },
            ],
          },
          {
            key: 'human-member-room',
            status: 'WAITING',
            currentMatchId: null,
            updatedAt,
            memberships: [{ userId: 'human-1' }],
            seats: [],
          },
          {
            key: 'human-seat-room',
            status: 'WAITING',
            currentMatchId: null,
            updatedAt,
            memberships: [],
            seats: [{ userId: 'human-2', participantKind: null }],
          },
        ]),
      },
      $disconnect: vi.fn(async () => undefined),
    };

    const candidates = await findLegacyRoomCleanupCandidates(
      'postgresql://user:pass@localhost:5432/zamanushka_test',
      () => prisma as never,
    );

    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: {
        status: 'WAITING',
        currentMatchId: null,
      },
      include: {
        memberships: true,
        seats: true,
      },
      orderBy: {
        updatedAt: 'asc',
      },
    });
    expect(candidates).toEqual([
      {
        roomId: 'candidate-room',
        status: 'WAITING',
        currentMatchId: null,
        humanMembershipCount: 0,
        humanSeatCount: 0,
        botSeatCount: 1,
        updatedAt: '2026-09-21T10:00:00.000Z',
        reason: 'WAITING room with no active match, no HUMAN membership, and no seated HUMAN',
      },
    ]);
    expect(prisma.$disconnect).toHaveBeenCalled();
  });
});
