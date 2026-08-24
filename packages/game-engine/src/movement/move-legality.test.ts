import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { PawnPosition } from '../domain/types.js';
import { canMovePawn } from './move-legality.js';

function setPawnPosition(
  state: ReturnType<typeof createActiveGameState>,
  pawnId: string,
  position: PawnPosition,
) {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

function activePawnState() {
  const base = createActiveGameState({
    playerCount: 4,
    firstPlayerId: 'p1',
    seatOrder: ['p1', 'p2', 'p3', 'p4'],
  });

  return {
    ...base,
    pawns: base.pawns.map((pawn) =>
      pawn.pawnId === 'p1-pawn-1' ||
      pawn.pawnId === 'p2-pawn-1' ||
      pawn.pawnId === 'p3-pawn-1' ||
      pawn.pawnId === 'p4-pawn-1'
        ? { ...pawn, position: { zone: 'PERIMETER', progress: 0 } as const }
        : pawn,
    ),
  };
}

describe('movement legality', () => {
  it('accepts representative dice distances for all four colors', () => {
    const state = activePawnState();

    expect(canMovePawn(state, 'p1-pawn-1', 1)).toBe(true);
    expect(canMovePawn(state, 'p2-pawn-1', 1)).toBe(true);
    expect(canMovePawn(state, 'p3-pawn-1', 1)).toBe(true);
    expect(canMovePawn(state, 'p4-pawn-1', 1)).toBe(true);
  });

  it('rejects OFF_BOARD and REMOVED pawns', () => {
    const state = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });

    expect(
      canMovePawn(
        setPawnPosition(state, 'p1-pawn-1', { zone: 'OFF_BOARD' } as const),
        'p1-pawn-1',
        1,
      ),
    ).toBe(false);
    expect(
      canMovePawn(
        setPawnPosition(state, 'p1-pawn-1', { zone: 'REMOVED' } as const),
        'p1-pawn-1',
        1,
      ),
    ).toBe(false);
  });

  it('rejects own intermediate blockers and own destination blockers', () => {
    const state = setPawnPosition(
      setPawnPosition(
        createActiveGameState({
          playerCount: 2,
          firstPlayerId: 'p1',
          seatOrder: ['p1', 'p2'],
        }),
        'p1-pawn-1',
        { zone: 'PERIMETER', progress: 0 } as const,
      ),
      'p1-pawn-2',
      { zone: 'PERIMETER', progress: 1 } as const,
    );

    expect(canMovePawn(state, 'p1-pawn-1', 2)).toBe(false);
  });

  it('rejects opponent intermediate blockers but allows ordinary opponent destination on exact landing', () => {
    const blocked = setPawnPosition(
      setPawnPosition(
        createActiveGameState({
          playerCount: 2,
          firstPlayerId: 'p1',
          seatOrder: ['p1', 'p2'],
        }),
        'p1-pawn-1',
        { zone: 'PERIMETER', progress: 6 } as const,
      ),
      'p2-pawn-1',
      { zone: 'PERIMETER', progress: 21 } as const,
    );

    const capturableDestination = setPawnPosition(
      setPawnPosition(
        createActiveGameState({
          playerCount: 2,
          firstPlayerId: 'p1',
          seatOrder: ['p1', 'p2'],
        }),
        'p1-pawn-1',
        { zone: 'PERIMETER', progress: 5 } as const,
      ),
      'p2-pawn-1',
      { zone: 'PERIMETER', progress: 21 } as const,
    );

    expect(canMovePawn(blocked, 'p1-pawn-1', 2)).toBe(false);
    expect(canMovePawn(capturableDestination, 'p1-pawn-1', 2)).toBe(true);
  });

  it('treats occupied HOME(0) as a blocker for pass-through toward deeper home cells', () => {
    const state = setPawnPosition(
      setPawnPosition(
        createActiveGameState({
          playerCount: 2,
          firstPlayerId: 'p1',
          seatOrder: ['p1', 'p2'],
        }),
        'p1-pawn-1',
        { zone: 'PERIMETER', progress: 27 } as const,
      ),
      'p2-pawn-1',
      { zone: 'PERIMETER', progress: 14 } as const,
    );

    expect(canMovePawn(state, 'p1-pawn-1', 2)).toBe(false);
  });

  it('is deterministic and does not mutate state', () => {
    const state = createActiveGameState({
      playerCount: 2,
      firstPlayerId: 'p1',
      seatOrder: ['p1', 'p2'],
    });
    const snapshot = structuredClone(state);

    expect(
      canMovePawn(
        setPawnPosition(state, 'p1-pawn-1', { zone: 'PERIMETER', progress: 0 } as const),
        'p1-pawn-1',
        3,
      ),
    ).toBe(
      canMovePawn(
        setPawnPosition(state, 'p1-pawn-1', { zone: 'PERIMETER', progress: 0 } as const),
        'p1-pawn-1',
        3,
      ),
    );
    expect(state).toEqual(snapshot);
  });
});
