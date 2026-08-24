import { describe, expect, it } from 'vitest';
import { createActiveGameState } from './create-active-game-state.js';

describe('createActiveGameState', () => {
  it('creates the canonical initial ACTIVE snapshot', () => {
    const state = createActiveGameState({
      playerCount: 4,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
    });

    expect(state.stateVersion).toBe(0);
    expect(state.turnNumber).toBe(1);
    expect(state.status).toBe('ACTIVE');
    expect(state.turnPhase).toBe('WAITING_FOR_ROLL');
    expect(state.diceValue).toBeNull();
    expect(state.winnerPlayerId).toBeNull();
    expect(state.currentPlayerId).toBe('p1');
    expect(state.players.map((player) => player.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(state.players.map((player) => player.color)).toEqual(['RED', 'BLUE', 'YELLOW', 'GREEN']);
    expect(state.pawns).toHaveLength(16);
    expect(state.pawns.every((pawn) => pawn.position.zone === 'OFF_BOARD')).toBe(true);
    expect(new Set(state.pawns.map((pawn) => pawn.pawnId)).size).toBe(16);
  });

  it('is deterministic for the same configuration', () => {
    const config = {
      playerCount: 3 as const,
      firstPlayerId: 'p2',
      seatOrder: ['p2', 'p3', 'p1'] as const,
    };

    expect(createActiveGameState(config)).toEqual(createActiveGameState(config));
  });

  it('rejects invalid seat order and first player setup', () => {
    expect(() =>
      createActiveGameState({
        playerCount: 2,
        firstPlayerId: 'p3',
        seatOrder: ['p1', 'p2'],
      }),
    ).toThrow(/firstPlayerId/);
  });
});

