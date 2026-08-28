import { z } from 'zod';

export const playerMatchOutcomeSchema = z.enum(['WIN', 'LOSS', 'SURRENDERED']);
export const victoryReasonSchema = z.enum(['HOME_DIAGONAL_COMPLETED', 'LAST_ACTIVE_PLAYER']);

export const matchResultParticipantSummarySchema = z
  .object({
    userId: z.string().min(1),
    displayName: z.string().min(1),
    color: z.enum(['RED', 'BLUE', 'GREEN', 'YELLOW']),
  })
  .strict();

export const matchResultCardSchema = z
  .object({
    id: z.string().min(1),
    matchId: z.string().min(1),
    startedAt: z.string().datetime({ offset: true }),
    finishedAt: z.string().datetime({ offset: true }),
    participantCount: z.number().int().min(2).max(4),
    winnerUserId: z.string().min(1),
    winnerDisplayName: z.string().min(1),
    victoryReason: victoryReasonSchema,
    currentUserOutcome: playerMatchOutcomeSchema,
    participants: z.array(matchResultParticipantSummarySchema).min(2).max(4),
  })
  .strict();

export const profileUserSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    telegramUsername: z.string().min(1).nullable(),
    avatarUrl: z.string().url().nullable(),
  })
  .strict();

export const profileStatsSchema = z
  .object({
    gamesPlayed: z.number().int().min(0),
    wins: z.number().int().min(0),
    losses: z.number().int().min(0),
    winRate: z.number().min(0).max(1),
  })
  .strict()
  .refine((value) => value.gamesPlayed === value.wins + value.losses, {
    message: 'gamesPlayed must equal wins + losses',
  });

export const profileResponseSchema = z
  .object({
    user: profileUserSchema,
    stats: profileStatsSchema,
    recentResults: z.array(matchResultCardSchema).max(5),
  })
  .strict();

export const matchHistoryPageSchema = z
  .object({
    items: z.array(matchResultCardSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export type PlayerMatchOutcome = z.infer<typeof playerMatchOutcomeSchema>;
export type VictoryReason = z.infer<typeof victoryReasonSchema>;
export type MatchResultParticipantSummaryDto = z.infer<typeof matchResultParticipantSummarySchema>;
export type MatchResultCardDto = z.infer<typeof matchResultCardSchema>;
export type ProfileUserDto = z.infer<typeof profileUserSchema>;
export type ProfileStatsDto = z.infer<typeof profileStatsSchema>;
export type ProfileResponseDto = z.infer<typeof profileResponseSchema>;
export type MatchHistoryPageDto = z.infer<typeof matchHistoryPageSchema>;
