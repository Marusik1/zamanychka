import { pathToFileURL } from 'node:url';

import type { AppPrismaClient } from '../infrastructure/prisma.js';
import { createPrismaClient } from '../infrastructure/prisma.js';

export type LegacyRoomCleanupCandidate = Readonly<{
  roomId: string;
  status: string;
  currentMatchId: string | null;
  humanMembershipCount: number;
  humanSeatCount: number;
  botSeatCount: number;
  updatedAt: string;
  reason: string;
}>;

type CleanupPrismaClient = Pick<AppPrismaClient, 'room' | '$disconnect'>;

export async function findLegacyRoomCleanupCandidates(
  connectionString: string,
  createClient: (connectionString: string) => CleanupPrismaClient = createPrismaClient,
) {
  const prisma = createClient(connectionString);
  try {
    const rooms = await prisma.room.findMany({
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

    return rooms.flatMap<LegacyRoomCleanupCandidate>((room) => {
      const humanMembershipCount = room.memberships.length;
      const humanSeatCount = room.seats.filter((seat) => seat.userId !== null).length;
      const botSeatCount = room.seats.filter(
        (seat) => seat.userId === null && seat.participantKind === 'BOT',
      ).length;

      if (humanMembershipCount > 0 || humanSeatCount > 0) return [];

      return [
        {
          roomId: room.key,
          status: room.status,
          currentMatchId: room.currentMatchId,
          humanMembershipCount,
          humanSeatCount,
          botSeatCount,
          updatedAt: room.updatedAt.toISOString(),
          reason: 'WAITING room with no active match, no HUMAN membership, and no seated HUMAN',
        },
      ];
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required for legacy cleanup dry-run');
    process.exitCode = 1;
  } else {
    findLegacyRoomCleanupCandidates(connectionString)
      .then((candidates) => {
        console.log(
          JSON.stringify(
            {
              mode: 'DRY_RUN',
              mutates: false,
              candidateCount: candidates.length,
              candidates,
            },
            null,
            2,
          ),
        );
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
