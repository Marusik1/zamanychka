import type { GameEvent, WinReason } from '../domain/types.js';

export const gameEvents = {
  diceRolled(diceValue: 1 | 2 | 3 | 4 | 5 | 6): GameEvent {
    return { type: 'diceRolled', diceValue };
  },
  extraRollGranted(playerId: string): GameEvent {
    return { type: 'extraRollGranted', playerId };
  },
  turnChanged(fromPlayerId: string, toPlayerId: string, turnNumber: number): GameEvent {
    return { type: 'turnChanged', fromPlayerId, toPlayerId, turnNumber };
  },
  pawnEntered(pawnId: string, playerId: string): GameEvent {
    return { type: 'pawnEntered', pawnId, playerId };
  },
  pawnMoved(pawnId: string, playerId: string): GameEvent {
    return { type: 'pawnMoved', pawnId, playerId };
  },
  pawnEnteredHome(pawnId: string, playerId: string, homeIndex: 0 | 1 | 2 | 3): GameEvent {
    return { type: 'pawnEnteredHome', pawnId, playerId, homeIndex };
  },
  pawnCaptured(pawnId: string, playerId: string, capturedPawnId: string, capturedPlayerId: string): GameEvent {
    return { type: 'pawnCaptured', pawnId, playerId, capturedPawnId, capturedPlayerId };
  },
  pawnRemoved(pawnId: string, playerId: string): GameEvent {
    return { type: 'pawnRemoved', pawnId, playerId };
  },
  playerSurrendered(playerId: string): GameEvent {
    return { type: 'playerSurrendered', playerId };
  },
  gameWon(winnerPlayerId: string, reason: WinReason): GameEvent {
    return { type: 'gameWon', winnerPlayerId, reason };
  },
} as const;
