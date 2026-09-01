import { describe, expect, it } from 'vitest';

import type { GameEventEnvelope, MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';

import { createGameplayPresentationPlan, getPawnMotions } from './event-presentation.js';

function snapshot(matchId = 'match-1', stateVersion = 2, lastSequence = 2): MatchSnapshot {
  return {
    status: 'ACTIVE',
    stateVersion,
    turnNumber: 1,
    turnPhase: 'WAITING_FOR_ROLL',
    currentPlayerId: 'p1',
    diceValue: null,
    winnerPlayerId: null,
    winReason: null,
    players: [],
    pawns: [],
    lastSequence,
  };
}

function event<T extends GameEventEnvelope>(value: T): T {
  return value;
}

function transition(events: readonly GameEventEnvelope[]): TransitionEnvelope {
  return {
    matchId: 'match-1',
    transitionId: 'transition-1',
    actionId: 'action-1',
    stateVersion: 2,
    fromSequence: 10,
    toSequence: 9 + events.length,
    events: [...events],
    watermark: { stateVersion: 2, lastSequence: 9 + events.length },
    snapshot: snapshot('match-1', 2, 9 + events.length),
  };
}

describe('gameplay event presentation plan', () => {
  it('keeps committed events in deterministic presentation order', () => {
    const plan = createGameplayPresentationPlan(
      transition([
        event({
          matchId: 'match-1',
          eventId: 'e1',
          sequence: 10,
          stateVersion: 2,
          type: 'diceRolled',
          payload: { playerId: 'p1', diceValue: 4 },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
        event({
          matchId: 'match-1',
          eventId: 'e2',
          sequence: 11,
          stateVersion: 2,
          type: 'pawnMoved',
          payload: {
            pawnId: 'p1-1',
            playerId: 'p1',
            fromCoord: { row: 0, col: 1 },
            toCoord: { row: 0, col: 3 },
            physicalPath: [
              { row: 0, col: 2 },
              { row: 0, col: 3 },
            ],
            capture: null,
          },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
        event({
          matchId: 'match-1',
          eventId: 'e3',
          sequence: 12,
          stateVersion: 2,
          type: 'turnChanged',
          payload: { fromPlayerId: 'p1', toPlayerId: 'p2' },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
      ]),
    );

    expect(plan.steps.map((step) => step.kind)).toEqual(['dice', 'pawn', 'cell', 'turn']);
    expect(plan.steps[1]).toMatchObject({ kind: 'pawn', pawnId: 'p1-1', motion: 'moving' });
    expect(plan.steps[3]).toMatchObject({ kind: 'turn', toPlayerId: 'p2', extraRoll: false });
  });

  it('keeps pawnMoved as the only spatial movement when pawnEnteredHome follows it', () => {
    const plan = createGameplayPresentationPlan(
      transition([
        event({
          matchId: 'match-1',
          eventId: 'e1',
          sequence: 10,
          stateVersion: 2,
          type: 'pawnMoved',
          payload: {
            pawnId: 'p1-1',
            playerId: 'p1',
            fromCoord: { row: 0, col: 1 },
            toCoord: { row: 1, col: 1 },
            physicalPath: [
              { row: 0, col: 0 },
              { row: 1, col: 1 },
            ],
            capture: null,
          },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
        event({
          matchId: 'match-1',
          eventId: 'e2',
          sequence: 11,
          stateVersion: 2,
          type: 'pawnEnteredHome',
          payload: {
            pawnId: 'p1-1',
            playerId: 'p1',
            homeIndex: 1,
            fromCoord: { row: 0, col: 1 },
            toCoord: { row: 1, col: 1 },
          },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
      ]),
    );

    const pawnSteps = plan.steps.filter((step) => step.kind === 'pawn');

    expect(pawnSteps).toEqual([
      expect.objectContaining({
        kind: 'pawn',
        pawnId: 'p1-1',
        motion: 'moving',
        path: [
          { row: 0, col: 0 },
          { row: 1, col: 1 },
        ],
      }),
      expect.objectContaining({
        kind: 'pawn',
        pawnId: 'p1-1',
        motion: 'home-cue',
        path: [],
      }),
    ]);
  });

  it('presents capture after movement and gameWon as the final visual step', () => {
    const plan = createGameplayPresentationPlan(
      transition([
        event({
          matchId: 'match-1',
          eventId: 'e1',
          sequence: 10,
          stateVersion: 2,
          type: 'pawnMoved',
          payload: {
            pawnId: 'p1-1',
            playerId: 'p1',
            fromCoord: { row: 0, col: 2 },
            toCoord: { row: 0, col: 4 },
            physicalPath: [
              { row: 0, col: 3 },
              { row: 0, col: 4 },
            ],
            capture: { capturedPawnId: 'p2-1', capturedPlayerId: 'p2' },
          },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
        event({
          matchId: 'match-1',
          eventId: 'e2',
          sequence: 11,
          stateVersion: 2,
          type: 'pawnCaptured',
          payload: {
            capturedPawnId: 'p2-1',
            capturedPlayerId: 'p2',
            byPawnId: 'p1-1',
            byPlayerId: 'p1',
            atCoord: { row: 0, col: 4 },
          },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
        event({
          matchId: 'match-1',
          eventId: 'e3',
          sequence: 12,
          stateVersion: 2,
          type: 'gameWon',
          payload: { winnerPlayerId: 'p1', reason: 'HOME_DIAGONAL_COMPLETED' },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
      ]),
    );

    expect(plan.steps.map((step) => step.kind)).toEqual([
      'pawn',
      'cell',
      'cell',
      'pawn',
      'toast',
      'victory',
    ]);
    expect(plan.steps.at(-1)).toMatchObject({
      kind: 'victory',
      winnerPlayerId: 'p1',
      reason: 'HOME_DIAGONAL_COMPLETED',
    });
    expect(getPawnMotions(plan)).toEqual({
      'p1-1': 'moving',
      'p2-1': 'captured',
    });
  });

  it('keeps enter caption-free while preserving compact capture toast ordering', () => {
    const plan = createGameplayPresentationPlan(
      transition([
        event({
          matchId: 'match-1',
          eventId: 'e1',
          sequence: 10,
          stateVersion: 2,
          type: 'pawnEntered',
          payload: {
            pawnId: 'p1-1',
            playerId: 'p1',
            toCoord: { row: 0, col: 7 },
          },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
        event({
          matchId: 'match-1',
          eventId: 'e2',
          sequence: 11,
          stateVersion: 2,
          type: 'pawnMoved',
          payload: {
            pawnId: 'p1-1',
            playerId: 'p1',
            fromCoord: { row: 0, col: 5 },
            toCoord: { row: 0, col: 7 },
            physicalPath: [
              { row: 0, col: 6 },
              { row: 0, col: 7 },
            ],
            capture: { capturedPawnId: 'p2-1', capturedPlayerId: 'p2' },
          },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
        event({
          matchId: 'match-1',
          eventId: 'e3',
          sequence: 12,
          stateVersion: 2,
          type: 'pawnCaptured',
          payload: {
            capturedPawnId: 'p2-1',
            capturedPlayerId: 'p2',
            byPawnId: 'p1-1',
            byPlayerId: 'p1',
            atCoord: { row: 0, col: 7 },
          },
          createdAt: '2026-08-25T00:00:00.000Z',
        }),
      ]),
    );

    expect(plan.steps.map((step) => step.kind)).toEqual(['pawn', 'pawn', 'cell', 'cell', 'pawn', 'toast']);
    expect(plan.steps.at(-1)).toMatchObject({
      kind: 'toast',
      tone: 'capture',
      message: 'Игрок сбил пешку соперника',
    });
  });
});
