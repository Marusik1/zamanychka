export { createActiveGameState } from './domain/create-active-game-state.js';
export {
  NORMALIZED_PERIMETER_COORDS,
  PERIMETER_OFFSETS,
  resolvePerimeterCoord,
  resolvePerimeterIndex,
} from './board/perimeter.js';
export { getOccupancy } from './board/occupancy.js';
export { HOME_COORDS, resolveHomeCoord, resolvePawnCoordinate } from './board/home.js';
export { getNextActivePlayerId } from './turns/turn-rotation.js';
export { getLegalActions, getLegalTurnActions } from './actions/legal-actions.js';
export { canMovePawn } from './movement/move-legality.js';
export { resolvePhysicalPath } from './movement/path.js';
export { transition } from './transitions/transition.js';
export { isWinningState, projectTerminalState } from './transitions/victory.js';
export type {
  BoardCoord,
  CreateActiveGameStateConfig,
  GameCommand,
  GameEvent,
  GameState,
  GameTransitionError,
  GameTransitionErrorCode,
  GameTransitionResult,
  GameTransitionSuccess,
  LegalAction,
  MatchStatus,
  PawnPosition,
  PawnState,
  PlayerColor,
  PlayerCount,
  PlayerState,
  TransitionContext,
  TurnPhase,
  WinReason,
} from './domain/contracts.js';
