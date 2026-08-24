import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { GameState, PawnPosition } from '../domain/types.js';
import { projectTerminalState, isWinningState } from './victory.js';

function setPawnPosition(state: GameState, pawnId: string, position: PawnPosition): GameState {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

function setPlayerStatus(state: GameState, playerId: string, status: GameState['players'][number]['status']): GameState {
  return {
    ...state,
    players: state.players.map((player) => (player.playerId === playerId ? { ...player, status } : player)),
  };
}

describe('victory helper', () => {
  it('detects HOME_DIAGONAL_COMPLETED only when all four own HOME cells are occupied', () => {
    const base = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });
    const winning = setPawnPosition(
      setPawnPosition(
        setPawnPosition(
          setPawnPosition(base, 'p1-pawn-1', { zone: 'HOME', homeIndex: 0 } as const),
          'p1-pawn-2',
          { zone: 'HOME', homeIndex: 1 } as const,
        ),
        'p1-pawn-3',
        { zone: 'HOME', homeIndex: 2 } as const,
      ),
      'p1-pawn-4',
      { zone: 'HOME', homeIndex: 3 } as const,
    );

    expect(isWinningState(winning, 'p1')).toBe(true);
    expect(isWinningState(setPawnPosition(winning, 'p1-pawn-4', { zone: 'OFF_BOARD' } as const), 'p1')).toBe(false);
    expect(isWinningState(setPawnPosition(winning, 'p1-pawn-4', { zone: 'REMOVED' } as const), 'p1')).toBe(false);
    expect(isWinningState(setPawnPosition(winning, 'p1-pawn-4', { zone: 'HOME', homeIndex: 2 } as const), 'p1')).toBe(false);
    expect(isWinningState(setPawnPosition(winning, 'p2-pawn-1', { zone: 'HOME', homeIndex: 3 } as const), 'p1')).toBe(true);
  });

  it('detects LAST_ACTIVE_PLAYER only when exactly one ACTIVE participant remains', () => {
    const state = createActiveGameState({
      playerCount: 4,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
    });

    expect(isWinningState(state, 'p1')).toBe(false);
    expect(isWinningState(setPlayerStatus(setPlayerStatus(state, 'p2', 'SURRENDERED'), 'p3', 'FINISHED'), 'p1')).toBe(false);
    expect(isWinningState(setPlayerStatus(setPlayerStatus(setPlayerStatus(state, 'p2', 'SURRENDERED'), 'p3', 'FINISHED'), 'p4', 'SURRENDERED'), 'p1')).toBe(true);
  });

  it('projects terminal state without mutating the original state', () => {
    const base = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });
    const winning = setPawnPosition(
      setPawnPosition(
        setPawnPosition(
          setPawnPosition(base, 'p1-pawn-1', { zone: 'HOME', homeIndex: 0 } as const),
          'p1-pawn-2',
          { zone: 'HOME', homeIndex: 1 } as const,
        ),
        'p1-pawn-3',
        { zone: 'HOME', homeIndex: 2 } as const,
      ),
      'p1-pawn-4',
      { zone: 'HOME', homeIndex: 3 } as const,
    );
    const snapshot = structuredClone(winning);

    expect(projectTerminalState(winning, 'p1', 'HOME_DIAGONAL_COMPLETED')).toEqual({
      ...winning,
      status: 'FINISHED',
      winnerPlayerId: 'p1',
      winReason: 'HOME_DIAGONAL_COMPLETED',
      currentPlayerId: null,
      turnPhase: null,
      diceValue: null,
      players: [
        expect.objectContaining({ playerId: 'p1', status: 'FINISHED' }),
        expect.objectContaining({ playerId: 'p2', status: 'FINISHED' }),
      ],
    });
    expect(winning).toEqual(snapshot);
  });

  it('preserves surrendered players while terminalizing the winner and remaining active players', () => {
    const base = createActiveGameState({
      playerCount: 4,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
    });
    const surrendered = setPlayerStatus(setPlayerStatus(base, 'p2', 'SURRENDERED'), 'p4', 'SURRENDERED');
    const projected = projectTerminalState(surrendered, 'p1', 'LAST_ACTIVE_PLAYER');

    expect(projected.status).toBe('FINISHED');
    expect(projected.winnerPlayerId).toBe('p1');
    expect(projected.currentPlayerId).toBeNull();
    expect(projected.turnPhase).toBeNull();
    expect(projected.diceValue).toBeNull();
    expect(projected.players.find((player) => player.playerId === 'p2')?.status).toBe('SURRENDERED');
    expect(projected.players.find((player) => player.playerId === 'p4')?.status).toBe('SURRENDERED');
    expect(projected.players.find((player) => player.playerId === 'p1')?.status).toBe('FINISHED');
    expect(projected.players.find((player) => player.playerId === 'p3')?.status).toBe('FINISHED');
  });

  it('is deterministic for repeated calls', () => {
    const state = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });

    expect(isWinningState(state, 'p1')).toBe(isWinningState(state, 'p1'));
    expect(projectTerminalState(state, 'p1', 'LAST_ACTIVE_PLAYER')).toEqual(projectTerminalState(state, 'p1', 'LAST_ACTIVE_PLAYER'));
  });
});

