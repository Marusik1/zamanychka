import { describe, expect, it } from 'vitest';

import { buildMatchResultDraft } from './result-draft.js';

describe('buildMatchResultDraft', () => {
  it('maps winner, surrendered loser, and ordinary loser outcomes from authoritative finished match truth', () => {
    expect(
      buildMatchResultDraft({
        matchId: 'match-1',
        roomId: 'single-room',
        status: 'FINISHED',
        winnerUserId: 'user-1',
        victoryReason: 'LAST_ACTIVE_PLAYER',
        startedAt: new Date('2026-08-29T12:00:00.000Z'),
        finishedAt: new Date('2026-08-29T12:10:00.000Z'),
        participants: [
          {
            userId: 'user-1',
            displayName: 'User 1',
            color: 'RED',
            surrendered: false,
          },
          {
            userId: 'user-2',
            displayName: 'User 2',
            color: 'BLUE',
            surrendered: true,
          },
          {
            userId: 'user-3',
            displayName: 'User 3',
            color: 'YELLOW',
            surrendered: false,
          },
        ],
      }),
    ).toMatchObject({
      matchId: 'match-1',
      roomId: 'single-room',
      winnerUserId: 'user-1',
      victoryReason: 'LAST_ACTIVE_PLAYER',
      participantCount: 3,
      participants: [
        { userId: 'user-1', outcome: 'WIN' },
        { userId: 'user-2', outcome: 'SURRENDERED' },
        { userId: 'user-3', outcome: 'LOSS' },
      ],
    });
  });

  it('returns null for non-persistable matches and rejects invalid participant snapshots', () => {
    expect(
      buildMatchResultDraft({
        matchId: 'match-1',
        roomId: 'single-room',
        status: 'ACTIVE',
        winnerUserId: null,
        victoryReason: null,
        startedAt: new Date('2026-08-29T12:00:00.000Z'),
        finishedAt: new Date('2026-08-29T12:10:00.000Z'),
        participants: [],
      }),
    ).toBeNull();

    expect(() =>
      buildMatchResultDraft({
        matchId: 'match-1',
        roomId: 'single-room',
        status: 'FINISHED',
        winnerUserId: 'user-1',
        victoryReason: 'HOME_DIAGONAL_COMPLETED',
        startedAt: new Date('2026-08-29T12:00:00.000Z'),
        finishedAt: new Date('2026-08-29T12:10:00.000Z'),
        participants: [{ userId: 'user-2', displayName: 'User 2', color: 'BLUE', surrendered: false }],
      }),
    ).toThrow('MATCH_RESULT_WINNER_NOT_PARTICIPANT');
  });
});
