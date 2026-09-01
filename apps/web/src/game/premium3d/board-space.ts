import type { PremiumBoardCoord } from './types.js';

export const PREMIUM_BOARD_WORLD_SIZE = 8;
export const PREMIUM_CELL_WORLD_SIZE = 1;

export function boardCoordToWorld(coord: PremiumBoardCoord): Readonly<{ x: number; y: number }> {
  return {
    x: coord.col - 3.5,
    y: 3.5 - coord.row,
  };
}

export function boardPathToWorld(path: readonly PremiumBoardCoord[]) {
  return path.map(boardCoordToWorld);
}
