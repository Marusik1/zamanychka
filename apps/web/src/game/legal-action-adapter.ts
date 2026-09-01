import {
  getLegalActions,
  getLegalTurnActions,
  type GameState,
  type LegalAction,
} from '@zamanushka/game-engine';

export type GameScreenLegalActionAdapter = Readonly<{
  legalTurnActions: readonly LegalAction[];
  legalActions: readonly LegalAction[];
}>;

export function createLegalActionAdapter(
  snapshot: Pick<GameState, 'status' | 'currentPlayerId' | 'turnPhase' | 'diceValue' | 'players' | 'pawns' | 'winnerPlayerId' | 'winReason'> & {
    stateVersion: GameState['stateVersion'];
    turnNumber: GameState['turnNumber'];
  },
  localPlayerId: string,
): GameScreenLegalActionAdapter {
  return {
    legalTurnActions: getLegalTurnActions(snapshot, localPlayerId),
    legalActions: getLegalActions(snapshot, localPlayerId),
  };
}
