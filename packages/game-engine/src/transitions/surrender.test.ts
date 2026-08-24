import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { GameState } from '../domain/types.js';
import { getOccupancy } from '../board/occupancy.js';
import { getLegalActions } from '../actions/legal-actions.js';
import { transition } from './transition.js';

function setPlayerStatus(state: GameState, playerId: string, status: GameState['players'][number]['status']): GameState {
  return {
    ...state,
    players: state.players.map((player) => (player.playerId === playerId ? { ...player, status } : player)),
  };
}

function setPawnRemoved(state: GameState, pawnId: string): GameState {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position: { zone: 'REMOVED' } as const } : pawn)),
  };
}

function baseState(): GameState {
  return createActiveGameState({
    playerCount: 4,
    firstPlayerId: 'p1',
    seatOrder: ['p1', 'p2', 'p3', 'p4'],
  });
}

describe('surrender transition', () => {
  it('removes all four pawns in canonical order and keeps non-current turn state unchanged', () => {
    const result = transition(baseState(), { type: 'SURRENDER', actorPlayerId: 'p2', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p2' });

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
        { type: 'playerSurrendered', playerId: 'p2' },
        { type: 'pawnRemoved', pawnId: 'p2-pawn-1', playerId: 'p2' },
        { type: 'pawnRemoved', pawnId: 'p2-pawn-2', playerId: 'p2' },
        { type: 'pawnRemoved', pawnId: 'p2-pawn-3', playerId: 'p2' },
        { type: 'pawnRemoved', pawnId: 'p2-pawn-4', playerId: 'p2' },
      ],
      legalActions: expect.arrayContaining([{ type: 'ROLL_DICE' }, { type: 'SURRENDER' }]),
    });
    expect(result.ok && result.state.players.find((player) => player.playerId === 'p2')?.status).toBe('SURRENDERED');
    expect(result.ok && result.state.pawns.filter((pawn) => pawn.playerId === 'p2').every((pawn) => pawn.position.zone === 'REMOVED')).toBe(true);
  });

  it('current player surrender advances turn and skips surrendered players', () => {
    const state = setPlayerStatus(baseState(), 'p2', 'SURRENDERED');
    const result = transition(state, { type: 'SURRENDER', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1' });

    expect(result).toEqual({
      ok: true,
      state: expect.objectContaining({
        stateVersion: 1,
        currentPlayerId: 'p3',
        turnPhase: 'WAITING_FOR_ROLL',
        diceValue: null,
        turnNumber: 2,
      }),
      events: [
        { type: 'playerSurrendered', playerId: 'p1' },
        { type: 'pawnRemoved', pawnId: 'p1-pawn-1', playerId: 'p1' },
        { type: 'pawnRemoved', pawnId: 'p1-pawn-2', playerId: 'p1' },
        { type: 'pawnRemoved', pawnId: 'p1-pawn-3', playerId: 'p1' },
        { type: 'pawnRemoved', pawnId: 'p1-pawn-4', playerId: 'p1' },
        { type: 'turnChanged', fromPlayerId: 'p1', toPlayerId: 'p3', turnNumber: 2 },
      ],
      legalActions: expect.arrayContaining([{ type: 'ROLL_DICE' }, { type: 'SURRENDER' }]),
    });
  });

  it('terminalizes as LAST_ACTIVE_PLAYER when surrender leaves exactly one active player', () => {
    const state = setPlayerStatus(setPlayerStatus(baseState(), 'p2', 'SURRENDERED'), 'p3', 'SURRENDERED');
    const result = transition(state, { type: 'SURRENDER', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p1' });

    expect(result).toEqual({
      ok: true,
      state: expect.objectContaining({
        stateVersion: 1,
        status: 'FINISHED',
        winnerPlayerId: 'p4',
        currentPlayerId: null,
        turnPhase: null,
        diceValue: null,
      }),
      events: [
        { type: 'playerSurrendered', playerId: 'p1' },
        { type: 'pawnRemoved', pawnId: 'p1-pawn-1', playerId: 'p1' },
        { type: 'pawnRemoved', pawnId: 'p1-pawn-2', playerId: 'p1' },
        { type: 'pawnRemoved', pawnId: 'p1-pawn-3', playerId: 'p1' },
        { type: 'pawnRemoved', pawnId: 'p1-pawn-4', playerId: 'p1' },
        { type: 'gameWon', winnerPlayerId: 'p4', reason: 'LAST_ACTIVE_PLAYER' },
      ],
      legalActions: [],
    });
    expect(result.ok && result.state.players.find((player) => player.playerId === 'p1')?.status).toBe('SURRENDERED');
    expect(result.ok && result.state.players.find((player) => player.playerId === 'p4')?.status).toBe('FINISHED');
  });

  it('removed pawns do not appear in occupancy or legal actions after surrender', () => {
    const result = transition(baseState(), { type: 'SURRENDER', actorPlayerId: 'p2', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p2' });
    if (!result.ok) {
      throw new Error('expected success');
    }

    const occupancy = getOccupancy(result.state.pawns, result.state.players);
    expect(occupancy.cells.some((cell) => cell.occupants.some((occupant) => occupant.playerId === 'p2'))).toBe(false);
    expect(getLegalActions(result.state, 'p2')).toEqual([]);
  });

  it('rejects stale version and inactive actor without mutation', () => {
    const state = setPlayerStatus(baseState(), 'p2', 'SURRENDERED');
    const snapshot = structuredClone(state);
    const result = transition(state, { type: 'SURRENDER', actorPlayerId: 'p2', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p2' });

    expect(result.ok).toBe(false);
    expect(state).toEqual(snapshot);
  });

  it('is deterministic for repeated surrender results', () => {
    const state = baseState();
    expect(
      transition(state, { type: 'SURRENDER', actorPlayerId: 'p2', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p2' }),
    ).toEqual(
      transition(state, { type: 'SURRENDER', actorPlayerId: 'p2', matchId: 'm1', expectedStateVersion: 0 }, { actorPlayerId: 'p2' }),
    );
  });
});
