import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import { getNextActivePlayerId } from './turn-rotation.js';

function withStatuses(
  state: ReturnType<typeof createActiveGameState>,
  statuses: Array<'ACTIVE' | 'SURRENDERED' | 'FINISHED'>,
) {
  return {
    ...state,
    players: state.players.map((player, index) => ({
      ...player,
      status: statuses[index] ?? player.status,
    })),
  };
}

describe('turn rotation', () => {
  it('rotates through 2 players', () => {
    const state = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });

    expect(getNextActivePlayerId(state, 'p1')).toBe('p2');
    expect(getNextActivePlayerId(state, 'p2')).toBe('p1');
  });

  it('rotates through 3 players', () => {
    const state = createActiveGameState({
      playerCount: 3,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2', 'p3'],
    });

    expect(getNextActivePlayerId(state, 'p1')).toBe('p2');
    expect(getNextActivePlayerId(state, 'p2')).toBe('p3');
    expect(getNextActivePlayerId(state, 'p3')).toBe('p1');
  });

  it('rotates through 4 players with wrap-around', () => {
    const state = createActiveGameState({
      playerCount: 4,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
    });

    expect(getNextActivePlayerId(state, 'p4')).toBe('p1');
  });

  it('skips surrendered and finished players', () => {
    const state = withStatuses(
      createActiveGameState({
        playerCount: 4,
        firstPlayerId: 'p1',
        seatOrder: ['p1', 'p2', 'p3', 'p4'],
      }),
      ['ACTIVE', 'SURRENDERED', 'FINISHED', 'ACTIVE'],
    );

    expect(getNextActivePlayerId(state, 'p1')).toBe('p4');
  });

  it('works even if the source player is not the current player', () => {
    const state = createActiveGameState({
      playerCount: 3,
      firstPlayerId: 'p2',
      seatOrder: ['p2', 'p3', 'p1'],
    });

    expect(getNextActivePlayerId(state, 'p1')).toBe('p2');
  });

  it('returns null when only one active player remains or none remain', () => {
    const oneActive = withStatuses(
      createActiveGameState({
        playerCount: 4,
        firstPlayerId: 'p1',
        seatOrder: ['p1', 'p2', 'p3', 'p4'],
      }),
      ['ACTIVE', 'SURRENDERED', 'SURRENDERED', 'SURRENDERED'],
    );
    const noneActive = withStatuses(oneActive, ['SURRENDERED', 'SURRENDERED', 'SURRENDERED', 'SURRENDERED']);

    expect(getNextActivePlayerId(oneActive, 'p2')).toBe('p1');
    expect(getNextActivePlayerId(noneActive, 'p1')).toBeNull();
  });

  it('returns null for unknown fromPlayerId', () => {
    const state = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });

    expect(getNextActivePlayerId(state, 'unknown')).toBeNull();
  });
});
