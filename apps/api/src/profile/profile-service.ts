import type { MatchHistoryPageDto, ProfileResponseDto } from '@zamanushka/shared';

import type { ProfileRepository } from './profile-repository.js';

export function createProfileService(options: { repository: ProfileRepository }) {
  return {
    async loadProfile(userId: string): Promise<ProfileResponseDto> {
      const user = await options.repository.loadProfileUser(userId);
      if (!user) {
        throw new Error('PROFILE_USER_NOT_FOUND');
      }
      const [stats, recentResults] = await Promise.all([
        options.repository.loadStats(userId),
        options.repository.listRecentResults(userId),
      ]);
      return {
        user,
        stats,
        recentResults,
      };
    },

    async loadHistory(input: {
      userId: string;
      limit?: number;
      cursor?: string | null;
    }): Promise<MatchHistoryPageDto> {
      const limit = Math.min(Math.max(Math.trunc(input.limit ?? 20), 1), 50);
      return options.repository.listHistory({
        userId: input.userId,
        limit,
        cursor: input.cursor ?? null,
      });
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
