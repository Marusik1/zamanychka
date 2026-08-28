import { describe, expect, it } from 'vitest';

import { derivePlayerMatchOutcome, isPersistableFinishedMatch } from './result-outcome.js';

describe('derivePlayerMatchOutcome', () => {
  it('returns WIN for the winner', () => {
    expect(
      derivePlayerMatchOutcome({ userId: 'user-1', status: 'FINISHED' }, {
        winnerPlayerId: 'user-1',
        reason: 'HOME_DIAGONAL_COMPLETED',
      }),
    ).toBe('WIN');
  });

  it('returns SURRENDERED for a surrendered non-winner', () => {
    expect(
      derivePlayerMatchOutcome({ userId: 'user-2', status: 'SURRENDERED' }, {
        winnerPlayerId: 'user-1',
        reason: 'LAST_ACTIVE_PLAYER',
      }),
    ).toBe('SURRENDERED');
  });

  it('returns LOSS for an ordinary non-winner', () => {
    expect(
      derivePlayerMatchOutcome({ userId: 'user-2', status: 'FINISHED' }, {
        winnerPlayerId: 'user-1',
        reason: 'HOME_DIAGONAL_COMPLETED',
      }),
    ).toBe('LOSS');
  });
});

describe('isPersistableFinishedMatch', () => {
  it('accepts only canonical finished matches with a winner and reason', () => {
    expect(
      isPersistableFinishedMatch({
        status: 'FINISHED',
        terminalResult: { winnerPlayerId: 'user-1', reason: 'HOME_DIAGONAL_COMPLETED' },
      }),
    ).toBe(true);
  });

  it('rejects unfinished, winnerless, and abandoned matches', () => {
    expect(
      isPersistableFinishedMatch({
        status: 'ACTIVE',
        terminalResult: { winnerPlayerId: 'user-1', reason: 'HOME_DIAGONAL_COMPLETED' },
      }),
    ).toBe(false);
    expect(
      isPersistableFinishedMatch({
        status: 'FINISHED',
        terminalResult: { winnerPlayerId: null, reason: 'HOME_DIAGONAL_COMPLETED' },
      }),
    ).toBe(false);
    expect(
      isPersistableFinishedMatch({
        status: 'ABANDONED',
        terminalResult: { winnerPlayerId: 'user-1', reason: 'LAST_ACTIVE_PLAYER' },
      }),
    ).toBe(false);
  });
});
