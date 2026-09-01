import { describe, expect, it } from 'vitest';

import { createEventJournal } from './event-journal.js';

describe('ordered event journal writer', () => {
  it('assigns deterministic, contiguous per-match sequence identities', () => {
    const journal = createEventJournal({ now: () => new Date('2026-08-25T00:00:00.000Z') });
    const events = journal.envelopes({
      matchId: 'match-1',
      stateVersion: 7,
      lastSequence: 12,
      actorPlayerId: 'user-1',
      before: state(),
      after: state(),
      events: [
        { type: 'diceRolled', diceValue: 6 },
        { type: 'extraRollGranted', playerId: 'user-1', reason: 'CAPTURE' },
      ],
    });

    expect(
      events.map(({ eventId, sequence, createdAt }) => ({ eventId, sequence, createdAt })),
    ).toEqual([
      { eventId: 'match-1:13', sequence: 13, createdAt: '2026-08-25T00:00:00.000Z' },
      { eventId: 'match-1:14', sequence: 14, createdAt: '2026-08-25T00:00:00.000Z' },
    ]);
    expect(events[1]).toMatchObject({
      type: 'extraRollGranted',
      payload: { playerId: 'user-1', reason: 'CAPTURE' },
    });
  });
});

function state() {
  return {
    status: 'ACTIVE' as const,
    stateVersion: 7,
    turnNumber: 1,
    turnPhase: 'WAITING_FOR_ROLL' as const,
    currentPlayerId: 'user-1',
    diceValue: null,
    winnerPlayerId: null,
    winReason: null,
    players: [
      {
        playerId: 'user-1',
        color: 'RED' as const,
        seatIndex: 0 as const,
        status: 'ACTIVE' as const,
      },
    ],
    pawns: [],
  };
}
