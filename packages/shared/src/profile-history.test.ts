import { describe, expect, it } from 'vitest';

import {
  matchResultCardSchema,
  matchResultParticipantSummarySchema,
  playerMatchOutcomeSchema,
  victoryReasonSchema,
} from './profile-history.js';

describe('profile history contracts', () => {
  it('accepts the canonical match result card payload', () => {
    const card = matchResultCardSchema.parse({
      id: 'result-1',
      matchId: 'match-1',
      startedAt: '2026-08-29T12:00:00.000Z',
      finishedAt: '2026-08-29T12:10:00.000Z',
      participantCount: 4,
      winnerUserId: 'user-1',
      winnerDisplayName: 'Мария',
      victoryReason: 'HOME_DIAGONAL_COMPLETED',
      currentUserOutcome: 'WIN',
      participants: [
        { userId: 'user-1', displayName: 'Мария', color: 'RED' },
        { userId: 'user-2', displayName: 'Дмитрий', color: 'BLUE' },
      ],
    });

    expect(card.participants).toHaveLength(2);
  });

  it('rejects authority leakage and accepts compact participant summaries', () => {
    expect(
      matchResultParticipantSummarySchema.parse({
        userId: 'user-1',
        displayName: 'Мария',
        color: 'RED',
      }),
    ).toEqual({
      userId: 'user-1',
      displayName: 'Мария',
      color: 'RED',
    });
    expect(() =>
      matchResultCardSchema.parse({
        id: 'result-1',
        matchId: 'match-1',
        startedAt: '2026-08-29T12:00:00.000Z',
        finishedAt: '2026-08-29T12:10:00.000Z',
        participantCount: 2,
        winnerUserId: 'user-2',
        winnerDisplayName: 'Ольга',
        victoryReason: 'LAST_ACTIVE_PLAYER',
        currentUserOutcome: 'LOSS',
        participants: [{ userId: 'user-1', displayName: 'Мария', color: 'RED' }],
        stateVersion: 9,
      }),
    ).toThrow();
  });

  it('freezes the simplified outcome vocabulary', () => {
    expect(playerMatchOutcomeSchema.options).toEqual(['WIN', 'LOSS', 'SURRENDERED']);
    expect(victoryReasonSchema.options).toEqual([
      'HOME_DIAGONAL_COMPLETED',
      'LAST_ACTIVE_PLAYER',
    ]);
  });
});
