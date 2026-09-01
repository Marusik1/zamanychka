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

  it('keeps the exact inactive-corner landing coordinate before the pawn returns OFF_BOARD', () => {
    const pawn = {
      pawnId: 'user-1-pawn-1',
      playerId: 'user-1',
      color: 'RED' as const,
      position: { zone: 'PERIMETER' as const, progress: 6 },
    };
    const before = {
      ...state(),
      diceValue: 1 as const,
      pawns: [pawn],
    };
    const after = {
      ...before,
      pawns: [{ ...pawn, position: { zone: 'OFF_BOARD' as const } }],
    };

    const events = createEventJournal().envelopes({
      matchId: 'match-1',
      stateVersion: 8,
      lastSequence: 14,
      actorPlayerId: 'user-1',
      before,
      after,
      events: [
        { type: 'pawnMoved', pawnId: 'user-1-pawn-1', playerId: 'user-1' },
        {
          type: 'pawnRemoved',
          pawnId: 'user-1-pawn-1',
          playerId: 'user-1',
          reason: 'INACTIVE_CORNER_EXIT',
        },
      ],
    });

    expect(events).toMatchObject([
      { type: 'pawnMoved', payload: { toCoord: { row: 0, col: 7 } } },
      { type: 'pawnRemoved', payload: { reason: 'INACTIVE_CORNER_EXIT' } },
    ]);
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
