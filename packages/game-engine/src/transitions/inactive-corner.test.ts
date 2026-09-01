import { describe, expect, it } from 'vitest';

import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { GameState, PawnPosition } from '../domain/types.js';
import { transition } from './transition.js';

function setPawnPosition(state: GameState, pawnId: string, position: PawnPosition): GameState {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

function actionState(playerCount: 2 | 3 | 4, diceValue: 1 | 2 | 3 | 4 | 5 | 6): GameState {
  const seatOrder =
    playerCount === 2
      ? (['p1', 'p2'] as const)
      : playerCount === 3
        ? (['p1', 'p2', 'p3'] as const)
        : (['p1', 'p2', 'p3', 'p4'] as const);
  return {
    ...createActiveGameState({ playerCount, firstPlayerId: 'p1', seatOrder }),
    turnPhase: 'WAITING_FOR_ACTION',
    diceValue,
  };
}

function move(state: GameState) {
  return transition(
    state,
    {
      type: 'MOVE_PAWN',
      actorPlayerId: 'p1',
      matchId: 'm1',
      pawnId: 'p1-pawn-1',
      expectedStateVersion: 0,
    },
    { actorPlayerId: 'p1' },
  );
}

describe('inactive corner transition rule', () => {
  it.each([
    ['BLUE', 6],
    ['GREEN', 20],
  ] as const)(
    'returns RED to OFF_BOARD only when it exactly lands on inactive %s corner',
    (_color, progress) => {
      const result = move(
        setPawnPosition(actionState(2, 1), 'p1-pawn-1', { zone: 'PERIMETER', progress } as const),
      );

      expect(result).toMatchObject({
        ok: true,
        state: { currentPlayerId: 'p2', turnPhase: 'WAITING_FOR_ROLL', turnNumber: 2 },
        events: [
          { type: 'pawnMoved', pawnId: 'p1-pawn-1', playerId: 'p1' },
          {
            type: 'pawnRemoved',
            pawnId: 'p1-pawn-1',
            playerId: 'p1',
            reason: 'INACTIVE_CORNER_EXIT',
          },
          { type: 'turnChanged', fromPlayerId: 'p1', toPlayerId: 'p2', turnNumber: 2 },
        ],
      });
      expect(
        result.ok && result.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position,
      ).toEqual({
        zone: 'OFF_BOARD',
      });
    },
  );

  it('does not remove RED when it only passes through an inactive BLUE corner', () => {
    const result = move(
      setPawnPosition(actionState(2, 2), 'p1-pawn-1', { zone: 'PERIMETER', progress: 6 } as const),
    );

    expect(
      result.ok && result.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position,
    ).toEqual({
      zone: 'PERIMETER',
      progress: 8,
    });
    expect(result.ok && result.events.map((event) => event.type)).not.toContain('pawnRemoved');
  });

  it('keeps an exact landing on active YELLOW corner in normal capture flow', () => {
    let state = setPawnPosition(actionState(2, 1), 'p1-pawn-1', {
      zone: 'PERIMETER',
      progress: 13,
    } as const);
    state = setPawnPosition(state, 'p2-pawn-1', { zone: 'PERIMETER', progress: 0 } as const);
    const result = move(state);

    expect(result).toMatchObject({
      ok: true,
      state: { currentPlayerId: 'p1', turnPhase: 'WAITING_FOR_ROLL' },
      events: [
        { type: 'pawnMoved', pawnId: 'p1-pawn-1' },
        { type: 'pawnCaptured', capturedPawnId: 'p2-pawn-1' },
        { type: 'extraRollGranted', reason: 'CAPTURE' },
      ],
    });
    expect(
      result.ok && result.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position,
    ).toEqual({
      zone: 'PERIMETER',
      progress: 14,
    });
  });

  it('returns an exact landing on inactive YELLOW corner to OFF_BOARD in a three-player match', () => {
    const result = move(
      setPawnPosition(actionState(3, 1), 'p1-pawn-1', { zone: 'PERIMETER', progress: 13 } as const),
    );

    expect(
      result.ok && result.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position,
    ).toEqual({
      zone: 'OFF_BOARD',
    });
    expect(result.ok && result.events).toContainEqual(
      expect.objectContaining({ type: 'pawnRemoved', reason: 'INACTIVE_CORNER_EXIT' }),
    );
  });

  it('never removes a pawn for corner ownership in a four-player match', () => {
    const result = move(
      setPawnPosition(actionState(4, 1), 'p1-pawn-1', { zone: 'PERIMETER', progress: 6 } as const),
    );

    expect(
      result.ok && result.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position,
    ).toEqual({
      zone: 'PERIMETER',
      progress: 7,
    });
    expect(result.ok && result.events.map((event) => event.type)).not.toContain('pawnRemoved');
  });
});
