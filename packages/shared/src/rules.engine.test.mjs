import { describe, expect, it } from 'vitest';
import { createActiveGameState, resolveHomeCoord, resolvePerimeterCoord, transition } from '../../game-engine/src/index.js';
import { rulesContent } from './rules.js';

function setPawnPosition(state, pawnId, position) {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

function fixtureState(topicId) {
  const fixture = rulesContent.fixtures.find((candidate) => candidate.topicId === topicId);
  if (!fixture) {
    throw new Error(`missing fixture for ${topicId}`);
  }

  let state = createActiveGameState({
    playerCount: fixture.playerCount,
    seatOrder: fixture.seatOrder,
    firstPlayerId: fixture.firstPlayerId,
  });

  state = {
    ...state,
    currentPlayerId: fixture.currentPlayerId,
    turnPhase: fixture.diceValue === null ? 'WAITING_FOR_ROLL' : 'WAITING_FOR_ACTION',
    diceValue: fixture.diceValue,
  };

  for (const pawn of fixture.pawns) {
    state = setPawnPosition(state, pawn.pawnId, pawn.position);
  }

  return state;
}

function findPerimeterProgress(color, coord) {
  for (let progress = 0; progress <= 27; progress += 1) {
    const candidate = resolvePerimeterCoord(color, progress);
    if (candidate.row === coord.row && candidate.col === coord.col) {
      return progress;
    }
  }

  return null;
}

describe('rules fixtures stay aligned with engine authority', () => {
  it('keeps entry-on-six aligned with blocked start and non-capturing entry', () => {
    const successState = fixtureState('ENTRY_ON_SIX');
    const success = transition(
      successState,
      {
        type: 'ENTER_PAWN',
        actorPlayerId: 'p1',
        matchId: 'tutorial-entry',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 6 },
    );

    expect(success.ok).toBe(true);
    expect(success.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position).toEqual({
      zone: 'PERIMETER',
      progress: 0,
    });
    expect(success.events[0]).toEqual({ type: 'pawnEntered', pawnId: 'p1-pawn-1', playerId: 'p1' });
    expect(success.events.some((event) => event.type === 'pawnCaptured')).toBe(false);

    const blockedState = setPawnPosition(successState, 'p2-pawn-1', { zone: 'PERIMETER', progress: 21 });
    const blocked = transition(
      blockedState,
      {
        type: 'ENTER_PAWN',
        actorPlayerId: 'p1',
        matchId: 'tutorial-entry',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 6 },
    );
    expect(blocked.ok).toBe(false);
  });

  it('keeps perimeter movement and blocking examples aligned with engine authority', () => {
    const movementState = fixtureState('PERIMETER_MOVEMENT');
    const movement = transition(
      movementState,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'tutorial-move',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 4 },
    );

    expect(movement.ok).toBe(true);
    expect(movement.events[0]).toEqual({ type: 'pawnMoved', pawnId: 'p1-pawn-1', playerId: 'p1' });

    const blockingState = fixtureState('BLOCKING');
    const blocked = transition(
      blockingState,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'tutorial-block',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 4 },
    );

    expect(blocked.ok).toBe(false);
  });

  it('keeps capture aligned with exact-destination capture only', () => {
    const state = fixtureState('CAPTURE');
    const result = transition(
      state,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'tutorial-capture',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 2 },
    );

    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual({
      type: 'pawnCaptured',
      pawnId: 'p1-pawn-1',
      playerId: 'p1',
      capturedPawnId: 'p2-pawn-1',
      capturedPlayerId: 'p2',
    });
    expect(result.state.pawns.find((pawn) => pawn.pawnId === 'p2-pawn-1')?.position).toEqual({
      zone: 'OFF_BOARD',
    });
  });

  it('keeps home-entry exact landing and overshoot examples aligned with engine authority', () => {
    const state = fixtureState('HOME_ENTRY');
    const success = transition(
      state,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'tutorial-home',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 3 },
    );

    expect(success.ok).toBe(true);
    expect(success.state.pawns.find((pawn) => pawn.pawnId === 'p1-pawn-1')?.position).toEqual({
      zone: 'HOME',
      homeIndex: 1,
    });
    expect(success.events).toContainEqual({
      type: 'pawnEnteredHome',
      pawnId: 'p1-pawn-1',
      playerId: 'p1',
      homeIndex: 1,
    });

    const overshoot = transition(
      { ...state, diceValue: 6 },
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'tutorial-home',
        pawnId: 'p1-pawn-1',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 6 },
    );

    expect(overshoot.ok).toBe(false);
  });

  it('keeps the victory example aligned with HOME_DIAGONAL_COMPLETED', () => {
    const victoryState = fixtureState('VICTORY');
    const result = transition(
      victoryState,
      {
        type: 'MOVE_PAWN',
        actorPlayerId: 'p1',
        matchId: 'tutorial-victory',
        pawnId: 'p1-pawn-4',
        expectedStateVersion: 0,
      },
      { actorPlayerId: 'p1', diceValue: 1 },
    );

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('FINISHED');
    expect(result.state.winnerPlayerId).toBe('p1');
    expect(result.events[result.events.length - 1]).toEqual({
      type: 'gameWon',
      winnerPlayerId: 'p1',
      reason: 'HOME_DIAGONAL_COMPLETED',
    });
  });

  it('keeps HOME(0) corner semantics explicit in the copy and fixture geometry', () => {
    const homeCorner = resolveHomeCoord('RED', 0);
    const perimeterStart = resolvePerimeterCoord('RED', 0);
    const opponentProgress = findPerimeterProgress('BLUE', homeCorner);

    expect(homeCorner).toEqual(perimeterStart);
    expect(opponentProgress).not.toBeNull();
    expect(rulesContent.topics.find((topic) => topic.id === 'HOME_ENTRY')?.bullets).toContain(
      'HOME(0) физически делит угол со стартом, но логически уже является домом.',
    );
  });
});
