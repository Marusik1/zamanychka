import { describe, expect, it } from 'vitest';
import { gameEvents } from './events.js';

describe('game event helpers', () => {
  it('create canonical runtime events with stable shapes', () => {
    expect(gameEvents.diceRolled(6)).toEqual({ type: 'diceRolled', diceValue: 6 });
    expect(gameEvents.extraRollGranted('p1', 'CAPTURE')).toEqual({
      type: 'extraRollGranted',
      playerId: 'p1',
      reason: 'CAPTURE',
    });
    expect(gameEvents.turnChanged('p1', 'p2', 2)).toEqual({
      type: 'turnChanged',
      fromPlayerId: 'p1',
      toPlayerId: 'p2',
      turnNumber: 2,
    });
    expect(gameEvents.pawnEntered('p1-pawn-1', 'p1')).toEqual({
      type: 'pawnEntered',
      pawnId: 'p1-pawn-1',
      playerId: 'p1',
    });
    expect(gameEvents.pawnMoved('p1-pawn-1', 'p1')).toEqual({
      type: 'pawnMoved',
      pawnId: 'p1-pawn-1',
      playerId: 'p1',
    });
    expect(gameEvents.pawnEnteredHome('p1-pawn-1', 'p1', 0)).toEqual({
      type: 'pawnEnteredHome',
      pawnId: 'p1-pawn-1',
      playerId: 'p1',
      homeIndex: 0,
    });
    expect(gameEvents.pawnCaptured('p1-pawn-1', 'p1', 'p2-pawn-1', 'p2')).toEqual({
      type: 'pawnCaptured',
      pawnId: 'p1-pawn-1',
      playerId: 'p1',
      capturedPawnId: 'p2-pawn-1',
      capturedPlayerId: 'p2',
    });
    expect(gameEvents.pawnRemoved('p2-pawn-1', 'p2')).toEqual({
      type: 'pawnRemoved',
      pawnId: 'p2-pawn-1',
      playerId: 'p2',
    });
    expect(gameEvents.playerSurrendered('p2')).toEqual({
      type: 'playerSurrendered',
      playerId: 'p2',
    });
    expect(gameEvents.gameWon('p1', 'HOME_DIAGONAL_COMPLETED')).toEqual({
      type: 'gameWon',
      winnerPlayerId: 'p1',
      reason: 'HOME_DIAGONAL_COMPLETED',
    });
  });

  it('keeps deterministic event ordering when composed manually', () => {
    expect([
      gameEvents.diceRolled(1),
      gameEvents.turnChanged('p1', 'p2', 2),
      gameEvents.gameWon('p1', 'LAST_ACTIVE_PLAYER'),
    ]).toEqual([
      { type: 'diceRolled', diceValue: 1 },
      { type: 'turnChanged', fromPlayerId: 'p1', toPlayerId: 'p2', turnNumber: 2 },
      { type: 'gameWon', winnerPlayerId: 'p1', reason: 'LAST_ACTIVE_PLAYER' },
    ]);
  });
});
