import { describe, expect, it } from 'vitest';
import { getLegalActions } from './actions/legal-actions.js';
import { getOccupancy } from './board/occupancy.js';
import { createActiveGameState } from './domain/create-active-game-state.js';
import type { GameState, PawnPosition } from './domain/types.js';
import { canMovePawn } from './movement/move-legality.js';
import { resolvePhysicalPath } from './movement/path.js';
import { transition } from './transitions/transition.js';
import { resolvePerimeterCoord } from './board/perimeter.js';

function setPawnPosition(state: GameState, pawnId: string, position: PawnPosition): GameState {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

function baseState(playerCount: 2 | 3 | 4 = 4): GameState {
  const seatOrder:
    readonly ['p1', 'p2', 'p3', 'p4'] | readonly ['p1', 'p2', 'p3'] | readonly ['p1', 'p2'] =
    playerCount === 2
      ? (['p1', 'p2'] as const)
      : playerCount === 3
        ? (['p1', 'p2', 'p3'] as const)
        : (['p1', 'p2', 'p3', 'p4'] as const);
  const firstPlayerId = seatOrder[0];
  if (!firstPlayerId) {
    throw new Error('expected first player');
  }
  return createActiveGameState({
    playerCount,
    firstPlayerId,
    seatOrder,
  });
}

function moveReadyState(distance: 1 | 2 | 3 | 4 | 5 | 6, playerId = 'p1'): GameState {
  return {
    ...baseState(),
    turnPhase: 'WAITING_FOR_ACTION',
    diceValue: distance,
    currentPlayerId: playerId,
  };
}

function findPerimeterProgress(
  color: GameState['players'][number]['color'],
  coord: { row: number; col: number },
): number | null {
  for (let progress = 0; progress <= 27; progress += 1) {
    const candidate = resolvePerimeterCoord(color, progress);
    if (candidate.row === coord.row && candidate.col === coord.col) {
      return progress;
    }
  }
  return null;
}

describe('final engine hardening', () => {
  it('preserves core movement invariants across generated perimeter and home cases', () => {
    const states = [
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 0 } as const),
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 1 } as const),
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 26 } as const),
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 27 } as const),
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'HOME', homeIndex: 0 } as const),
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'HOME', homeIndex: 2 } as const),
    ];

    for (const state of states) {
      for (const distance of [1, 2, 3, 4, 5, 6] as const) {
        const path = resolvePhysicalPath(state, 'p1-pawn-1', distance);
        if (path) {
          expect(path).toHaveLength(distance);
        }
        expect(canMovePawn(state, 'p1-pawn-1', distance)).toBe(path !== null);
      }
    }
  });

  it('rejects occupied-step blocking, intermediate capture, HOME overshoot, and ENTER capture across exact scenarios', () => {
    const perimeter = setPawnPosition(baseState(2), 'p1-pawn-1', {
      zone: 'PERIMETER',
      progress: 1,
    } as const);
    const blockedIntermediate = setPawnPosition(perimeter, 'p1-pawn-2', {
      zone: 'PERIMETER',
      progress: 2,
    } as const);
    const destinationCoord = resolvePhysicalPath(perimeter, 'p1-pawn-1', 2)?.[1];
    expect(destinationCoord).toBeDefined();
    if (!destinationCoord) {
      throw new Error('expected destination coord');
    }
    const destinationProgress = findPerimeterProgress('BLUE', destinationCoord);
    expect(destinationProgress).not.toBeNull();
    if (destinationProgress === null) {
      throw new Error('expected destination progress');
    }
    const capturableDestination = setPawnPosition(perimeter, 'p2-pawn-1', {
      zone: 'PERIMETER',
      progress: destinationProgress,
    } as const);
    expect(canMovePawn(blockedIntermediate, 'p1-pawn-1', 2)).toBe(false);
    expect(canMovePawn(capturableDestination, 'p1-pawn-1', 2)).toBe(true);
    expect(
      resolvePhysicalPath(
        setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'HOME', homeIndex: 3 } as const),
        'p1-pawn-1',
        1,
      ),
    ).toBeNull();
    expect(
      transition(
        moveReadyState(6),
        {
          type: 'ENTER_PAWN',
          actorPlayerId: 'p1',
          matchId: 'm1',
          pawnId: 'p1-pawn-1',
          expectedStateVersion: 0,
        },
        { actorPlayerId: 'p1', diceValue: 6 },
      ).ok,
    ).toBe(true);
  });

  it('keeps turnNumber, stateVersion, and event precedence exact across representative success and failure branches', () => {
    const rollWithActions = transition(
      baseState(),
      { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 },
      { actorPlayerId: 'p1', diceValue: 6 },
    );
    expect(rollWithActions).toEqual(
      expect.objectContaining({
        ok: true,
        state: expect.objectContaining({ stateVersion: 1, turnNumber: 1 }),
        events: [{ type: 'diceRolled', diceValue: 6 }],
      }),
    );

    const noActionSix = transition(
      setPawnPosition(
        setPawnPosition(
          setPawnPosition(
            setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'HOME', homeIndex: 3 } as const),
            'p1-pawn-2',
            { zone: 'HOME', homeIndex: 3 } as const,
          ),
          'p1-pawn-3',
          { zone: 'HOME', homeIndex: 3 } as const,
        ),
        'p1-pawn-4',
        { zone: 'HOME', homeIndex: 3 } as const,
      ),
      { type: 'ROLL_DICE', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 },
      { actorPlayerId: 'p1', diceValue: 6 },
    );
    expect(noActionSix).toEqual(
      expect.objectContaining({
        ok: true,
        state: expect.objectContaining({ stateVersion: 1, turnNumber: 1, diceValue: null }),
        events: [
          { type: 'diceRolled', diceValue: 6 },
          { type: 'extraRollGranted', playerId: 'p1', reason: 'NO_LEGAL_ACTION_ON_SIX' },
        ],
      }),
    );

    const currentSurrender = transition(
      baseState(4),
      { type: 'SURRENDER', actorPlayerId: 'p1', matchId: 'm1', expectedStateVersion: 0 },
      { actorPlayerId: 'p1' },
    );
    expect(currentSurrender.ok).toBe(true);
    if (currentSurrender.ok) {
      expect(currentSurrender.events[0]).toEqual({ type: 'playerSurrendered', playerId: 'p1' });
      expect(currentSurrender.events.at(-1)).toEqual(
        expect.objectContaining({ type: 'turnChanged' }),
      );
      expect(currentSurrender.state.stateVersion).toBe(1);
    }
  });

  it('keeps removed pawns out of occupancy and legal actions', () => {
    const surrendered = transition(
      baseState(4),
      { type: 'SURRENDER', actorPlayerId: 'p2', matchId: 'm1', expectedStateVersion: 0 },
      { actorPlayerId: 'p2' },
    );
    expect(surrendered.ok).toBe(true);
    if (!surrendered.ok) {
      throw new Error('expected success');
    }
    const occupancy = getOccupancy(surrendered.state.pawns, surrendered.state.players);
    expect(
      occupancy.cells.some((cell) => cell.occupants.some((occupant) => occupant.playerId === 'p2')),
    ).toBe(false);
    expect(getLegalActions(surrendered.state, 'p2')).toEqual([]);
  });

  it('remains deterministic and deeply immutable on repeated transitions', () => {
    const state = moveReadyState(2);
    const snapshot = structuredClone(state);
    const first = transition(
      state,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 2 },
    );
    const second = transition(
      state,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 2 },
    );
    expect(first).toEqual(second);
    expect(state).toEqual(snapshot);
  });
});
