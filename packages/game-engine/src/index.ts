export {
  createActiveGameState,
} from './domain/create-active-game-state.js';
export {
  NORMALIZED_PERIMETER_COORDS,
  PERIMETER_OFFSETS,
  resolvePerimeterCoord,
  resolvePerimeterIndex,
} from './board/perimeter.js';
export {
  getOccupancy,
} from './board/occupancy.js';
export {
  HOME_COORDS,
  resolveHomeCoord,
  resolvePawnCoordinate,
} from './board/home.js';
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
