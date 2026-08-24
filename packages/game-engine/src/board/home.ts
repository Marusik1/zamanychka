import type { BoardCoord, PlayerColor, PawnPosition } from '../domain/types.js';
import { resolvePerimeterCoord } from './perimeter.js';

export const HOME_COORDS: Record<
  PlayerColor,
  readonly [BoardCoord, BoardCoord, BoardCoord, BoardCoord]
> = {
  RED: [
    { row: 0, col: 0 },
    { row: 1, col: 1 },
    { row: 2, col: 2 },
    { row: 3, col: 3 },
  ],
  BLUE: [
    { row: 0, col: 7 },
    { row: 1, col: 6 },
    { row: 2, col: 5 },
    { row: 3, col: 4 },
  ],
  YELLOW: [
    { row: 7, col: 7 },
    { row: 6, col: 6 },
    { row: 5, col: 5 },
    { row: 4, col: 4 },
  ],
  GREEN: [
    { row: 7, col: 0 },
    { row: 6, col: 1 },
    { row: 5, col: 2 },
    { row: 4, col: 3 },
  ],
};

export function resolveHomeCoord(color: PlayerColor, homeIndex: 0 | 1 | 2 | 3): BoardCoord {
  return HOME_COORDS[color][homeIndex];
}

export function resolvePawnCoordinate(
  position: PawnPosition,
  owner: { color: PlayerColor },
): BoardCoord | null {
  switch (position.zone) {
    case 'OFF_BOARD':
    case 'REMOVED':
      return null;
    case 'PERIMETER':
      return resolvePerimeterCornerAware(owner.color, position.progress);
    case 'HOME':
      return resolveHomeCoord(owner.color, position.homeIndex);
  }
}

function resolvePerimeterCornerAware(color: PlayerColor, progress: number): BoardCoord {
  if (progress < 0 || progress > 27 || !Number.isInteger(progress)) {
    throw new RangeError(`perimeter progress must be an integer between 0 and 27: ${progress}`);
  }
  if (progress === 0) {
    return resolveHomeCoord(color, 0);
  }
  return resolvePerimeterCoord(color, progress);
}
