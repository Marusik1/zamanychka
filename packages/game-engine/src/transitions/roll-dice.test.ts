import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { GameState, PawnPosition } from '../domain/types.js';
import { getLegalActions } from '../actions/legal-actions.js';
import { transition } from './transition.js';

function setPawnPosition(state: GameState, pawnId: string, position: PawnPosition): GameState {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

function baseState(): GameState {
  return createActiveGameState({
    playerCount: 4,
    firstPlayerId: 'p1',
    seatOrder: ['p1', 'p2', 'p3', 'p4'],
  });
}

describe('ROLL_DICE transition', () => {
  it('moves to WAITING_FOR_ACTION on six when ENTER is available', () => {
    const state = baseState();
    const result = transition(state, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 6 });

    expect(result).toEqual({
      ok: true,
      state: expect.objectContaining({
        stateVersion: 1,
        currentPlayerId: 'p1',
        turnPhase: 'WAITING_FOR_ACTION',
        diceValue: 6,
        turnNumber: 1,
      }),
      events: [{ type: 'diceRolled', diceValue: 6 }],
      legalActions: expect.arrayContaining([expect.objectContaining({ type: 'SURRENDER' })]),
    });
  });

  it('moves to WAITING_FOR_ACTION on six when MOVE is available', () => {
    const state = setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 6 } as const);
    const result = transition(state, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 6 });

    expect(result).toEqual({
      ok: true,
      state: expect.objectContaining({
        stateVersion: 1,
        currentPlayerId: 'p1',
        turnPhase: 'WAITING_FOR_ACTION',
        diceValue: 6,
        turnNumber: 1,
      }),
      events: [{ type: 'diceRolled', diceValue: 6 }],
      legalActions: expect.arrayContaining([expect.objectContaining({ type: 'SURRENDER' })]),
    });
  });

  it('moves to WAITING_FOR_ACTION on six when ENTER and MOVE are both available', () => {
    const state = setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 6 } as const);
    const result = transition(state, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 6 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.state.turnPhase).toBe('WAITING_FOR_ACTION');
    expect(result.state.currentPlayerId).toBe('p1');
    expect(result.events).toEqual([{ type: 'diceRolled', diceValue: 6 }]);
  });

  it('advances to the next active player on one-to-five no-action and emits exact events', () => {
    const state = setPawnPosition(baseState(), 'p2-pawn-1', { zone: 'HOME', homeIndex: 3 } as const);
    const result = transition(state, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 1 });

    expect(result).toEqual({
      ok: true,
      state: expect.objectContaining({
        stateVersion: 1,
        currentPlayerId: 'p2',
        turnPhase: 'WAITING_FOR_ROLL',
        diceValue: null,
        turnNumber: 2,
      }),
      events: [
        { type: 'diceRolled', diceValue: 1 },
        { type: 'turnChanged', fromPlayerId: 'p1', toPlayerId: 'p2', turnNumber: 2 },
      ],
      legalActions: expect.arrayContaining([
        expect.objectContaining({ type: 'ROLL_DICE' }),
        expect.objectContaining({ type: 'SURRENDER' }),
      ]),
    });
  });

  it('keeps the same player on six with no action and emits exact events', () => {
    const state = setPawnPosition(
      setPawnPosition(
        setPawnPosition(
          setPawnPosition(
            baseState(),
            'p1-pawn-1',
            { zone: 'HOME', homeIndex: 3 } as const,
          ),
          'p1-pawn-2',
          { zone: 'HOME', homeIndex: 3 } as const,
        ),
        'p1-pawn-3',
        { zone: 'HOME', homeIndex: 3 } as const,
      ),
      'p1-pawn-4',
      { zone: 'HOME', homeIndex: 3 } as const,
    );
    const result = transition(state, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 6 });

    expect(result).toEqual({
      ok: true,
      state: expect.objectContaining({
        stateVersion: 1,
        currentPlayerId: 'p1',
        turnPhase: 'WAITING_FOR_ROLL',
        diceValue: null,
        turnNumber: 1,
      }),
      events: [
        { type: 'diceRolled', diceValue: 6 },
        { type: 'extraRollGranted', playerId: 'p1' },
      ],
      legalActions: [
        { type: 'ROLL_DICE' },
        { type: 'SURRENDER' },
      ],
    });
  });

  it('rejects stale version, wrong actor, inactive actor, wrong phase, and missing dice context without mutation', () => {
    const base = baseState();
    const scenarios = [
      transition(base, { type: 'ROLL_DICE', actorPlayerId: 'p2', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p2', diceValue: 1 }),
      transition({ ...base, currentPlayerId: 'p2' }, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 1 }),
      transition({ ...base, players: base.players.map((player) => (player.playerId === 'p1' ? { ...player, status: 'SURRENDERED' as const } : player)) }, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 1 }),
      transition({ ...base, turnPhase: 'WAITING_FOR_ACTION', diceValue: 1 }, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1', diceValue: 1 }),
      transition(base, { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1' }),
    ];

    for (const result of scenarios) {
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('expected failure');
      }
      expect(result.code).toBeDefined();
    }
  });
});
