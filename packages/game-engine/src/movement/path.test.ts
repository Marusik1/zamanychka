import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { PawnPosition } from '../domain/types.js';
import { resolvePhysicalPath } from './path.js';

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

describe('physical path resolution', () => {
  it('returns a path containing every visited coordinate after source, including destination', () => {
    const state = setPawnPosition(
      createActiveGameState({
        playerCount: 2,
        firstPlayerId: 'p1',
        seatOrder: ['p1', 'p2'],
      }),
      'p1-pawn-1',
      { zone: 'PERIMETER', progress: 0 } as const,
    );
    const path = resolvePhysicalPath(state, 'p1-pawn-1', 3);

    expect(path).toHaveLength(3);
  });

  it('is deterministic for identical inputs and leaves state unchanged', () => {
    const state = setPawnPosition(
      createActiveGameState({
        playerCount: 2,
        firstPlayerId: 'p1',
        seatOrder: ['p1', 'p2'],
      }),
      'p1-pawn-1',
      { zone: 'PERIMETER', progress: 0 } as const,
    );
    expect(resolvePhysicalPath(state, 'p1-pawn-1', 4)).toEqual(
      resolvePhysicalPath(state, 'p1-pawn-1', 4),
    );
    expect(state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position).toEqual({
      zone: 'PERIMETER',
      progress: 0,
    });
  });

  it('walks from perimeter progress 27 into home 0 and onward without wrapping', () => {
    const state = setPawnPosition(
      createActiveGameState({
        playerCount: 2,
        firstPlayerId: 'p1',
        seatOrder: ['p1', 'p2'],
      }),
      'p1-pawn-1',
      { zone: 'PERIMETER', progress: 27 } as const,
    );

    expect(resolvePhysicalPath(state, 'p1-pawn-1', 1)).toEqual([{ row: 0, col: 0 }]);
    expect(resolvePhysicalPath(state, 'p1-pawn-1', 2)).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]);
    expect(resolvePhysicalPath(state, 'p1-pawn-1', 4)).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
    ]);
    expect(resolvePhysicalPath(state, 'p1-pawn-1', 5)).toBeNull();
  });

  it('reaches the exact home end without overshoot', () => {
    const state = setPawnPosition(
      createActiveGameState({
        playerCount: 2,
        firstPlayerId: 'p1',
        seatOrder: ['p1', 'p2'],
      }),
      'p1-pawn-1',
      { zone: 'HOME', homeIndex: 0 } as const,
    );

    expect(resolvePhysicalPath(state, 'p1-pawn-1', 3)).toEqual([
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
    ]);
    expect(resolvePhysicalPath(state, 'p1-pawn-1', 4)).toBeNull();
  });

  it('blocks own and opponent intermediate occupancy', () => {
    const blockedByOwn = setPawnPosition(
      createActiveGameState({
        playerCount: 2,
        firstPlayerId: 'p1',
        seatOrder: ['p1', 'p2'],
      }),
      'p1-pawn-1',
      { zone: 'PERIMETER', progress: 6 } as const,
    );
    const ownOccupant = setPawnPosition(blockedByOwn, 'p1-pawn-2', {
      zone: 'PERIMETER',
      progress: 7,
    } as const);
    const opponentOccupant = setPawnPosition(ownOccupant, 'p2-pawn-1', {
      zone: 'PERIMETER',
      progress: 0,
    } as const);

    expect(resolvePhysicalPath(opponentOccupant, 'p1-pawn-1', 2)).toBeNull();
  });
});
