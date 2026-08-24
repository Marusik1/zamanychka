import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { GameState, PawnPosition } from '../domain/types.js';
import { gameTransitionErrors } from './errors.js';
import { transition } from '../transitions/transition.js';

function setPawnPosition(state: GameState, pawnId: string, position: PawnPosition): GameState {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

describe('game transition error helpers', () => {
  it('builds stable domain errors', () => {
    expect(gameTransitionErrors.create('NOT_CURRENT_PLAYER', 'nope')).toEqual({
      ok: false,
      code: 'NOT_CURRENT_PLAYER',
      message: 'nope',
    });
  });

  it('fails deterministically without mutating state on invalid commands', () => {
    const state = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });
    const snapshot = structuredClone(state);
    const result = transition(state, { type: 'SURRENDER', actorPlayerId: 'p3', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p3' });

    expect(result).toEqual({
      ok: false,
      code: 'PLAYER_NOT_IN_MATCH',
      message: expect.any(String),
    });
    expect(state).toEqual(snapshot);
    expect(
      transition(state, { type: 'SURRENDER', actorPlayerId: 'p3', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p3' }),
    ).toEqual(result);
  });

  it('rejects stale state, wrong phase, and missing dice with unchanged state', () => {
    const state = setPawnPosition(
      createActiveGameState({
        playerCount: 2,
        firstPlayerId: 'p1',
        seatOrder: ['p1', 'p2'],
      }),
      'p1-pawn-1',
      { zone: 'PERIMETER', progress: 1 } as const,
    );
    const snapshot = structuredClone(state);

    const stale = transition(state, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 1 }, { actorPlayerId: 'p1', diceValue: 1 });
    const wrongPhase = transition({ ...state, turnPhase: 'WAITING_FOR_ACTION', diceValue: 1 }, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 1 });
    const missingDice = transition({ ...state, turnPhase: 'WAITING_FOR_ACTION', diceValue: null }, { type: 'MOVE_PAWN', actorPlayerId: 'p1', matchId: 'm1', pawnId: 'p1-pawn-1', expectedStateVersion: 0 }, { actorPlayerId: 'p1' });

    expect(stale.ok).toBe(false);
    expect(wrongPhase.ok).toBe(false);
    expect(missingDice.ok).toBe(false);
    expect(state).toEqual(snapshot);
  });
});
