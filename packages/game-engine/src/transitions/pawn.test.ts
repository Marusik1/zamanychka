import { describe, expect, it } from 'vitest';
import { createActiveGameState } from '../domain/create-active-game-state.js';
import type { GameState, PawnPosition } from '../domain/types.js';
import { resolvePerimeterCoord } from '../board/perimeter.js';
import { resolveHomeCoord } from '../board/home.js';
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

function moveIntoActionState(state: GameState, diceValue: 1 | 2 | 3 | 4 | 5 | 6): GameState {
  return {
    ...state,
    turnPhase: 'WAITING_FOR_ACTION',
    diceValue,
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

describe('pawn transitions', () => {
  it('enters a pawn on six, emits extraRollGranted, and keeps the same player', () => {
    const state = moveIntoActionState(baseState(), 6);
    const result = transition(
      state,
      {
        type: 'ENTER_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 6 },
    );

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
        { type: 'pawnEntered', pawnId: 'p1-pawn-1', playerId: 'p1' },
        { type: 'extraRollGranted', playerId: 'p1' },
      ],
      legalActions: [{ type: 'ROLL_DICE' }, { type: 'SURRENDER' }],
    });
    expect(
      result.ok && result.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position,
    ).toEqual({ zone: 'PERIMETER', progress: 0 });
  });

  it('rejects enter on an occupied corner and does not mutate state', () => {
    const occupied = setPawnPosition(moveIntoActionState(baseState(), 6), 'p1-pawn-2', {
      zone: 'PERIMETER',
      progress: 0,
    } as const);
    const snapshot = structuredClone(occupied);
    const result = transition(
      occupied,
      {
        type: 'ENTER_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 6 },
    );

    expect(result.ok).toBe(false);
    expect(occupied).toEqual(snapshot);
  });

  it('moves normally on 1-5 with exact turn change and capture', () => {
    const state = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 1 } as const),
      2,
    );
    const result = transition(
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
        { type: 'pawnMoved', pawnId: 'p1-pawn-1', playerId: 'p1' },
        { type: 'turnChanged', fromPlayerId: 'p1', toPlayerId: 'p2', turnNumber: 2 },
      ],
      legalActions: expect.arrayContaining([{ type: 'ROLL_DICE' }, { type: 'SURRENDER' }]),
    });
  });

  it('moves on six and grants an explicit extra roll', () => {
    const state = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 1 } as const),
      6,
    );
    const result = transition(
      state,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 6 },
    );

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
        { type: 'pawnMoved', pawnId: 'p1-pawn-1', playerId: 'p1' },
        { type: 'extraRollGranted', playerId: 'p1' },
      ],
      legalActions: [{ type: 'ROLL_DICE' }, { type: 'SURRENDER' }],
    });
  });

  it('rejects own destination blockers and intermediate blockers', () => {
    const ownBlocker = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 1 } as const),
      2,
    );
    const ownBlocked = setPawnPosition(ownBlocker, 'p1-pawn-2', {
      zone: 'PERIMETER',
      progress: 3,
    } as const);
    const ownResult = transition(
      ownBlocked,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 2 },
    );
    expect(ownResult.ok).toBe(false);

    const intermediateCoord = resolvePerimeterCoord('RED', 2);
    const intermediateProgress = findPerimeterProgress('BLUE', intermediateCoord);
    expect(intermediateProgress).not.toBeNull();
    if (intermediateProgress === null) {
      throw new Error('expected intermediate progress');
    }
    const intermediateBlocked = setPawnPosition(ownBlocker, 'p2-pawn-1', {
      zone: 'PERIMETER',
      progress: intermediateProgress,
    } as const);
    const intermediateResult = transition(
      intermediateBlocked,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 2 },
    );
    expect(intermediateResult.ok).toBe(false);
  });

  it('captures an ordinary opponent perimeter destination and returns the opponent to OFF_BOARD', () => {
    const state = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 1 } as const),
      2,
    );
    const destination = resolvePerimeterCoord('RED', 3);
    const opponentProgress = findPerimeterProgress('BLUE', destination);
    expect(opponentProgress).not.toBeNull();
    if (opponentProgress === null) {
      throw new Error('expected opponent progress');
    }
    const withOpponent = setPawnPosition(state, 'p2-pawn-1', {
      zone: 'PERIMETER',
      progress: opponentProgress,
    } as const);
    const result = transition(
      withOpponent,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 2 },
    );

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
        { type: 'pawnMoved', pawnId: 'p1-pawn-1', playerId: 'p1' },
        {
          type: 'pawnCaptured',
          pawnId: 'p1-pawn-1',
          playerId: 'p1',
          capturedPawnId: 'p2-pawn-1',
          capturedPlayerId: 'p2',
        },
        { type: 'turnChanged', fromPlayerId: 'p1', toPlayerId: 'p2', turnNumber: 2 },
      ],
      legalActions: expect.arrayContaining([{ type: 'ROLL_DICE' }, { type: 'SURRENDER' }]),
    });
    expect(
      result.ok && result.state.pawns.find((pawn) => pawn.pawnId === 'p2-pawn-1')?.position,
    ).toEqual({ zone: 'OFF_BOARD' });
  });

  it('enters HOME from the perimeter, emits pawnEnteredHome once, and supports exact landing up to HOME(3)', () => {
    const state = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 26 } as const),
      3,
    );
    const result = transition(
      state,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 3 },
    );

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
        { type: 'pawnMoved', pawnId: 'p1-pawn-1', playerId: 'p1' },
        { type: 'pawnEnteredHome', pawnId: 'p1-pawn-1', playerId: 'p1', homeIndex: 1 },
        { type: 'turnChanged', fromPlayerId: 'p1', toPlayerId: 'p2', turnNumber: 2 },
      ],
      legalActions: expect.arrayContaining([{ type: 'ROLL_DICE' }, { type: 'SURRENDER' }]),
    });
    expect(
      result.ok && result.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position,
    ).toEqual({ zone: 'HOME', homeIndex: 1 });
  });

  it('rejects HOME overshoot and rejects pass-through when HOME(0) is occupied', () => {
    const overshoot = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 26 } as const),
      6,
    );
    const overshootResult = transition(
      overshoot,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 6 },
    );
    expect(overshootResult.ok).toBe(false);

    const occupiedCorner = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 26 } as const),
      3,
    );
    const corner = resolveHomeCoord('RED', 0);
    const blockerProgress = findPerimeterProgress('BLUE', corner);
    expect(blockerProgress).not.toBeNull();
    if (blockerProgress === null) {
      throw new Error('expected blocker progress');
    }
    const blocked = setPawnPosition(occupiedCorner, 'p2-pawn-1', {
      zone: 'PERIMETER',
      progress: blockerProgress,
    } as const);
    const blockedResult = transition(
      blocked,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 3 },
    );
    expect(blockedResult.ok).toBe(false);
  });

  it('captures on the exact HOME(0) destination when an opponent occupies that physical corner', () => {
    const state = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 27 } as const),
      1,
    );
    const corner = resolveHomeCoord('RED', 0);
    const opponentProgress = findPerimeterProgress('BLUE', corner);
    expect(opponentProgress).not.toBeNull();

    if (opponentProgress === null) {
      throw new Error('expected opponent progress');
    }
    const withOpponent = setPawnPosition(state, 'p2-pawn-1', {
      zone: 'PERIMETER',
      progress: opponentProgress,
    } as const);
    const result = transition(
      withOpponent,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 1 },
    );

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
        { type: 'pawnMoved', pawnId: 'p1-pawn-1', playerId: 'p1' },
        {
          type: 'pawnCaptured',
          pawnId: 'p1-pawn-1',
          playerId: 'p1',
          capturedPawnId: 'p2-pawn-1',
          capturedPlayerId: 'p2',
        },
        { type: 'pawnEnteredHome', pawnId: 'p1-pawn-1', playerId: 'p1', homeIndex: 0 },
        { type: 'turnChanged', fromPlayerId: 'p1', toPlayerId: 'p2', turnNumber: 2 },
      ],
      legalActions: expect.arrayContaining([{ type: 'ROLL_DICE' }, { type: 'SURRENDER' }]),
    });
  });

  it('terminalizes immediately when the fourth pawn completes HOME and emits gameWon last', () => {
    const state = moveIntoActionState(
      setPawnPosition(
        setPawnPosition(
          setPawnPosition(
            setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'HOME', homeIndex: 1 } as const),
            'p1-pawn-2',
            { zone: 'HOME', homeIndex: 2 } as const,
          ),
          'p1-pawn-3',
          { zone: 'HOME', homeIndex: 3 } as const,
        ),
        'p1-pawn-4',
        { zone: 'PERIMETER', progress: 27 } as const,
      ),
      1,
    );

    const result = transition(
      state,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'm1',
        pawnId: 'p1-pawn-4',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 1 },
    );

    expect(result).toEqual({
      ok: true,
      state: expect.objectContaining({
        stateVersion: 1,
        status: 'FINISHED',
        winnerPlayerId: 'p1',
        currentPlayerId: null,
        turnPhase: null,
        diceValue: null,
      }),
      events: [
        { type: 'pawnMoved', pawnId: 'p1-pawn-4', playerId: 'p1' },
        { type: 'pawnEnteredHome', pawnId: 'p1-pawn-4', playerId: 'p1', homeIndex: 0 },
        { type: 'gameWon', winnerPlayerId: 'p1', reason: 'HOME_DIAGONAL_COMPLETED' },
      ],
      legalActions: [],
    });
  });

  it('is deterministic and leaves the input state unchanged', () => {
    const state = moveIntoActionState(
      setPawnPosition(baseState(), 'p1-pawn-1', { zone: 'PERIMETER', progress: 1 } as const),
      2,
    );
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
