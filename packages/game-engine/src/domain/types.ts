export type PlayerCount = 2 | 3 | 4;

export type PlayerColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';

export type MatchStatus = 'ACTIVE' | 'FINISHED' | 'ABANDONED';

export type TurnPhase = 'WAITING_FOR_ROLL' | 'WAITING_FOR_ACTION';

export type BoardCoord = Readonly<{
  row: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  col: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
}>;

export type PawnPosition =
  | Readonly<{ zone: 'OFF_BOARD' }>
  | Readonly<{ zone: 'PERIMETER'; progress: number }>
  | Readonly<{ zone: 'HOME'; homeIndex: 0 | 1 | 2 | 3 }>
  | Readonly<{ zone: 'REMOVED' }>;

export type PawnState = Readonly<{
  pawnId: string;
  playerId: string;
  color: PlayerColor;
  position: PawnPosition;
}>;

export type PlayerState = Readonly<{
  playerId: string;
  color: PlayerColor;
  seatIndex: 0 | 1 | 2 | 3;
  status: 'ACTIVE' | 'SURRENDERED' | 'FINISHED';
  participantKind?: 'HUMAN' | 'BOT' | 'DEBUG_DUMMY';
}>;

export type WinReason = 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER';

export type GameState = Readonly<{
  status: MatchStatus;
  debugMode?: 'SOLO';
  stateVersion: number;
  turnNumber: number;
  turnPhase: TurnPhase | null;
  currentPlayerId: string | null;
  diceValue: 1 | 2 | 3 | 4 | 5 | 6 | null;
  winnerPlayerId: string | null;
  winReason: WinReason | null;
  players: readonly PlayerState[];
  pawns: readonly PawnState[];
}>;

export type GameCommand =
  | Readonly<{
      type: 'ROLL_DICE';
      actorPlayerId: string;
      matchId: string;
      expectedStateVersion: number;
    }>
  | Readonly<{
      type: 'ENTER_PAWN';
      actorPlayerId: string;
      matchId: string;
      pawnId: string;
      expectedStateVersion: number;
    }>
  | Readonly<{
      type: 'MOVE_PAWN';
      actorPlayerId: string;
      matchId: string;
      pawnId: string;
      expectedStateVersion: number;
    }>
  | Readonly<{
      type: 'SURRENDER';
      actorPlayerId: string;
      matchId: string;
      expectedStateVersion: number;
    }>;

export type TransitionContext = Readonly<{
  actorPlayerId: string;
  diceValue?: 1 | 2 | 3 | 4 | 5 | 6;
}>;

export type LegalAction =
  | Readonly<{ type: 'ROLL_DICE' }>
  | Readonly<{ type: 'SURRENDER' }>
  | Readonly<{
      type: 'ENTER_PAWN';
      pawnId: string;
      from: PawnPosition;
      to: PawnPosition;
      toCoord: BoardCoord;
    }>
  | Readonly<{
      type: 'MOVE_PAWN';
      pawnId: string;
      from: PawnPosition;
      to: PawnPosition;
      fromCoord: BoardCoord;
      toCoord: BoardCoord;
      physicalPath: readonly BoardCoord[];
      capture?: Readonly<{
        playerId: string;
        pawnId: string;
        occupantZone: 'PERIMETER' | 'HOME';
      }>;
      capturePreview?: Readonly<{
        playerId: string;
        pawnId: string;
        occupantZone: 'PERIMETER' | 'HOME';
      }>;
    }>;

export type GameEvent =
  | Readonly<{ type: 'diceRolled'; diceValue: 1 | 2 | 3 | 4 | 5 | 6 }>
  | Readonly<{
      type: 'extraRollGranted';
      playerId: string;
      reason: 'ROLLED_SIX' | 'CAPTURE' | 'NO_LEGAL_ACTION_ON_SIX';
    }>
  | Readonly<{ type: 'turnChanged'; fromPlayerId: string; toPlayerId: string; turnNumber: number }>
  | Readonly<{ type: 'pawnEntered'; pawnId: string; playerId: string }>
  | Readonly<{ type: 'pawnMoved'; pawnId: string; playerId: string }>
  | Readonly<{
      type: 'pawnEnteredHome';
      pawnId: string;
      playerId: string;
      homeIndex: 0 | 1 | 2 | 3;
    }>
  | Readonly<{
      type: 'pawnCaptured';
      pawnId: string;
      playerId: string;
      capturedPawnId: string;
      capturedPlayerId: string;
    }>
  | Readonly<{
      type: 'pawnRemoved';
      pawnId: string;
      playerId: string;
      reason?: 'INACTIVE_CORNER_EXIT';
    }>
  | Readonly<{ type: 'playerSurrendered'; playerId: string }>
  | Readonly<{ type: 'gameWon'; winnerPlayerId: string; reason: WinReason }>;

export type GameTransitionErrorCode =
  | 'MATCH_NOT_ACTIVE'
  | 'PLAYER_NOT_IN_MATCH'
  | 'PLAYER_NOT_ACTIVE'
  | 'NOT_CURRENT_PLAYER'
  | 'INVALID_COMMAND'
  | 'STALE_STATE_VERSION'
  | 'DICE_VALUE_REQUIRED'
  | 'NO_LEGAL_ACTION'
  | 'ILLEGAL_MOVE'
  | 'INVALID_PLAYER_COUNT'
  | 'INVALID_SEAT_ORDER'
  | 'INVALID_FIRST_PLAYER';

export type GameTransitionError = Readonly<{
  ok: false;
  code: GameTransitionErrorCode;
  message: string;
}>;

export type GameTransitionSuccess = Readonly<{
  ok: true;
  state: GameState;
  events: readonly GameEvent[];
  legalActions: readonly LegalAction[];
}>;

export type GameTransitionResult = GameTransitionSuccess | GameTransitionError;

export type CreateActiveGameStateConfig = Readonly<{
  playerCount: PlayerCount;
  seatOrder:
    | readonly [string, string]
    | readonly [string, string, string]
    | readonly [string, string, string, string];
  firstPlayerId: string;
}>;
