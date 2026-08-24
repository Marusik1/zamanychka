import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { GameState, PawnPosition } from '../domain/types.js';
import { getLegalActions, getLegalTurnActions } from './legal-actions.js';

function setPawnPosition(state: GameState, pawnId: string, position: PawnPosition): GameState {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

describe('legal actions', () => {
  it('returns ROLL_DICE in turn actions and keeps SURRENDER separate', () => {
    const state = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });

    const turnActions = getLegalTurnActions(state, 'p1');
    const broadActions = getLegalActions(state, 'p1');

    expect(turnActions.map((action) => action.type)).toEqual(['ROLL_DICE']);
    expect(turnActions.map((action) => action.type)).not.toContain('SURRENDER');
    expect(broadActions.map((action) => action.type)).toEqual(['ROLL_DICE', 'SURRENDER']);
  });

  it('gives an active non-current player surrender only', () => {
    const state = createActiveGameState({
      playerCount: 3,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2', 'p3'],
    });

    expect(getLegalTurnActions(state, 'p2')).toEqual([]);
    expect(getLegalActions(state, 'p2').map((action) => action.type)).toEqual(['SURRENDER']);
  });

  it('returns no actions for surrendered or finished players', () => {
    const base = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });
    const firstPlayer = base.players[0];
    const secondPlayer = base.players[1];
    if (!firstPlayer || !secondPlayer) {
      throw new Error('expected two players');
    }
    const state = {
      ...base,
      players: [
        { ...firstPlayer, status: 'SURRENDERED' as const },
        { ...secondPlayer, status: 'FINISHED' as const },
      ],
    };

    expect(getLegalTurnActions(state, 'p1')).toEqual([]);
    expect(getLegalActions(state, 'p1')).toEqual([]);
  });

  it('projects move and enter actions for a six without capture mutation', () => {
    const state = setPawnPosition(
      setPawnPosition(
        {
          ...createActiveGameState({
            playerCount: 4,
            firstPlayerId: 'p1',
            seatOrder: ['p1', 'p2', 'p3', 'p4'],
          }),
          turnPhase: 'WAITING_FOR_ACTION' as const,
          diceValue: 6 as const,
        },
        'p1-pawn-1',
        { zone: 'PERIMETER', progress: 1 } as const,
      ),
      'p2-pawn-1',
      { zone: 'PERIMETER', progress: 0 } as const,
    );

    const broadActions = getLegalActions(state, 'p1');

    expect(broadActions.map((action) => action.type)).toContain('MOVE_PAWN');
    expect(broadActions.map((action) => action.type)).toContain('ENTER_PAWN');
  });

  it('omits ENTER when the shared start corner is occupied and keeps capturePreview descriptive only', () => {
    const state = setPawnPosition(
      setPawnPosition(
        {
          ...createActiveGameState({
            playerCount: 4,
            firstPlayerId: 'p1',
            seatOrder: ['p1', 'p2', 'p3', 'p4'],
          }),
          turnPhase: 'WAITING_FOR_ACTION' as const,
          diceValue: 1 as const,
        },
        'p1-pawn-1',
        { zone: 'PERIMETER', progress: 6 } as const,
      ),
      'p1-pawn-2',
      { zone: 'HOME', homeIndex: 0 } as const,
    );

    const actions = getLegalActions(state, 'p1');

    expect(actions.some((action) => action.type === 'ENTER_PAWN')).toBe(false);
  });

  it('adds capturePreview for ordinary exact opponent destination and not for intermediate occupancy', () => {
    const exactLanding = setPawnPosition(
      setPawnPosition(
        {
          ...createActiveGameState({
            playerCount: 4,
            firstPlayerId: 'p1',
            seatOrder: ['p1', 'p2', 'p3', 'p4'],
          }),
          turnPhase: 'WAITING_FOR_ACTION' as const,
          diceValue: 1 as const,
        },
        'p1-pawn-1',
        { zone: 'PERIMETER', progress: 6 } as const,
      ),
      'p2-pawn-1',
      { zone: 'PERIMETER', progress: 0 } as const,
    );

    const intermediateBlocked = setPawnPosition(
      setPawnPosition(
        {
          ...createActiveGameState({
            playerCount: 4,
            firstPlayerId: 'p1',
            seatOrder: ['p1', 'p2', 'p3', 'p4'],
          }),
          turnPhase: 'WAITING_FOR_ACTION' as const,
          diceValue: 2 as const,
        },
        'p1-pawn-1',
        { zone: 'PERIMETER', progress: 6 } as const,
      ),
      'p2-pawn-1',
      { zone: 'PERIMETER', progress: 0 } as const,
    );

    expect(
      getLegalActions(exactLanding, 'p1').find((action) => action.type === 'MOVE_PAWN'),
    ).toEqual(
      expect.objectContaining({
        capturePreview: expect.objectContaining({
          playerId: 'p2',
          pawnId: 'p2-pawn-1',
          occupantZone: 'PERIMETER',
        }),
      }),
    );
    expect(
      getLegalActions(intermediateBlocked, 'p1').find((action) => action.type === 'MOVE_PAWN'),
    ).toBeUndefined();
  });

  it('is deterministic and does not mutate input state', () => {
    const state = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });
    const snapshot = structuredClone(state);

    expect(getLegalActions(state, 'p1')).toEqual(getLegalActions(state, 'p1'));
    expect(state).toEqual(snapshot);
  });
});
