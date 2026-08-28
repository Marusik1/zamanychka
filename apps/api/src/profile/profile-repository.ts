import type { MatchHistoryPageDto, MatchResultCardDto, ProfileResponseDto, ProfileStatsDto } from '@zamanushka/shared';

import type { AppPrismaClient } from '../infrastructure/prisma.js';

interface HistoryCursor {
  finishedAt: string;
  id: string;
}

function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): HistoryCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<HistoryCursor>;
    if (
      typeof parsed.finishedAt === 'string' &&
      parsed.finishedAt.length > 0 &&
      typeof parsed.id === 'string' &&
      parsed.id.length > 0
    ) {
      return { finishedAt: parsed.finishedAt, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

function displayName(input: { firstName: string; lastName: string | null }): string {
  return [input.firstName, input.lastName].filter(Boolean).join(' ');
}

interface ResultParticipantRow {
  userId: string;
  displayName: string;
  color: string;
  outcome: string;
}

interface ResultRow {
  id: string;
  matchId: string;
  startedAt: Date;
  finishedAt: Date;
  participantCount: number;
  winnerUserId: string;
  victoryReason: string;
  participants: ResultParticipantRow[];
}

function toCard(result: ResultRow, userId: string): MatchResultCardDto {
  const currentParticipant = result.participants.find((participant) => participant.userId === userId);
  if (!currentParticipant) {
    throw new Error(`PROFILE_RESULT_PARTICIPANT_NOT_FOUND:${result.id}:${userId}`);
  }
  const winnerParticipant = result.participants.find(
    (participant) => participant.userId === result.winnerUserId,
  );
  if (!winnerParticipant) {
    throw new Error(`PROFILE_RESULT_WINNER_NOT_FOUND:${result.id}:${result.winnerUserId}`);
  }
  return {
    id: result.id,
    matchId: result.matchId,
    startedAt: result.startedAt.toISOString(),
    finishedAt: result.finishedAt.toISOString(),
    participantCount: result.participantCount,
    winnerUserId: result.winnerUserId,
    winnerDisplayName: winnerParticipant.displayName,
    victoryReason: result.victoryReason as MatchResultCardDto['victoryReason'],
    currentUserOutcome: currentParticipant.outcome as MatchResultCardDto['currentUserOutcome'],
    participants: result.participants.map((participant) => ({
      userId: participant.userId,
      displayName: participant.displayName,
      color: participant.color as MatchResultCardDto['participants'][number]['color'],
    })),
  };
}

export function createProfileRepository(prisma: AppPrismaClient) {
  return {
    async loadProfileUser(userId: string): Promise<ProfileResponseDto['user'] | null> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          photoUrl: true,
        },
      });
      if (!user) return null;
      return {
        id: user.id,
        displayName: displayName(user),
        telegramUsername: user.username ?? null,
        avatarUrl: user.photoUrl ?? null,
      };
    },

    async loadStats(userId: string): Promise<ProfileStatsDto> {
      const grouped = await prisma.matchParticipantResult.groupBy({
        by: ['outcome'],
        where: { userId },
        _count: { _all: true },
      });
      const wins =
        grouped.find((row) => row.outcome === 'WIN')?._count._all ?? 0;
      const normalLosses =
        grouped.find((row) => row.outcome === 'LOSS')?._count._all ?? 0;
      const surrendered =
        grouped.find((row) => row.outcome === 'SURRENDERED')?._count._all ?? 0;
      const losses = normalLosses + surrendered;
      const gamesPlayed = wins + losses;
      return {
        gamesPlayed,
        wins,
        losses,
        winRate: gamesPlayed === 0 ? 0 : wins / gamesPlayed,
      };
    },

    async listRecentResults(userId: string): Promise<MatchResultCardDto[]> {
      const results = await prisma.matchResult.findMany({
        where: {
          participants: {
            some: { userId },
          },
        },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        include: {
          participants: {
            orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
          },
        },
      });
      return results.map((result) => toCard(result, userId));
    },

    async listHistory(input: {
      userId: string;
      limit: number;
      cursor: string | null;
    }): Promise<MatchHistoryPageDto> {
      const decodedCursor = input.cursor ? decodeCursor(input.cursor) : null;
      const results = await prisma.matchResult.findMany({
        where: {
          participants: {
            some: { userId: input.userId },
          },
          ...(decodedCursor
            ? {
                OR: [
                  { finishedAt: { lt: new Date(decodedCursor.finishedAt) } },
                  {
                    finishedAt: new Date(decodedCursor.finishedAt),
                    id: { lt: decodedCursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        include: {
          participants: {
            orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
          },
        },
      });

      const hasMore = results.length > input.limit;
      const pageItems = hasMore ? results.slice(0, input.limit) : results;
      const last = pageItems.at(-1);
      return {
        items: pageItems.map((result) => toCard(result, input.userId)),
        nextCursor:
          hasMore && last
            ? encodeCursor({ finishedAt: last.finishedAt.toISOString(), id: last.id })
            : null,
      };
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
