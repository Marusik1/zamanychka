export type PremiumPawnColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';

export type PremiumBoardCoord = Readonly<{
  row: number;
  col: number;
}>;

export type PremiumPawnSnapshot = Readonly<{
  pawnId: string;
  color: PremiumPawnColor;
  coord: PremiumBoardCoord | null;
  zone: 'OFF_BOARD' | 'PERIMETER' | 'HOME' | 'REMOVED';
}>;

export type PremiumMoveAnimation = Readonly<{
  pawnId: string;
  path: readonly PremiumBoardCoord[];
  capture: boolean;
}>;

export type PremiumEnterAnimation = Readonly<{
  pawnId: string;
  destination: PremiumBoardCoord;
}>;

export type PremiumCaptureAnimation = Readonly<{
  attackerPawnId: string;
  victimPawnId: string;
  destination: PremiumBoardCoord;
}>;

export type PremiumHomeCompletionAnimation = Readonly<{
  pawnIdsByHomeIndex: readonly [string, string, string, string];
  homeCoords: readonly [PremiumBoardCoord, PremiumBoardCoord, PremiumBoardCoord, PremiumBoardCoord];
  color: PremiumPawnColor;
}>;

export type PremiumVictoryAnimation = Readonly<{
  winnerName: string;
  winnerColor: PremiumPawnColor;
  reason: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER';
}>;
