import type { BoardCoord, PlayerColor } from '../domain/types.js';

export const NORMALIZED_PERIMETER_COORDS: readonly BoardCoord[] = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: 2 },
  { row: 0, col: 3 },
  { row: 0, col: 4 },
  { row: 0, col: 5 },
  { row: 0, col: 6 },
  { row: 0, col: 7 },
  { row: 1, col: 7 },
  { row: 2, col: 7 },
  { row: 3, col: 7 },
  { row: 4, col: 7 },
  { row: 5, col: 7 },
  { row: 6, col: 7 },
  { row: 7, col: 7 },
  { row: 7, col: 6 },
  { row: 7, col: 5 },
  { row: 7, col: 4 },
  { row: 7, col: 3 },
  { row: 7, col: 2 },
  { row: 7, col: 1 },
  { row: 7, col: 0 },
  { row: 6, col: 0 },
  { row: 5, col: 0 },
  { row: 4, col: 0 },
  { row: 3, col: 0 },
  { row: 2, col: 0 },
  { row: 1, col: 0 },
] as const;

export const PERIMETER_OFFSETS: Record<PlayerColor, number> = {
  RED: 0,
  BLUE: 7,
  YELLOW: 14,
  GREEN: 21,
};

export function resolvePerimeterIndex(color: PlayerColor, progress: number): number {
  if (!Number.isInteger(progress)) {
    throw new RangeError(`perimeter progress must be an integer: ${progress}`);
  }
  if (progress < 0 || progress > 27) {
    throw new RangeError(`perimeter progress must be between 0 and 27: ${progress}`);
  }
  return (PERIMETER_OFFSETS[color] + progress) % NORMALIZED_PERIMETER_COORDS.length;
}

export function resolvePerimeterCoord(color: PlayerColor, progress: number): BoardCoord {
  const coord = NORMALIZED_PERIMETER_COORDS[resolvePerimeterIndex(color, progress)];
  if (!coord) {
    throw new RangeError(`unable to resolve perimeter coord for ${color} progress ${progress}`);
  }
  return coord;
}
