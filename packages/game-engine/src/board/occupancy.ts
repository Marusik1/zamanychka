import type { BoardCoord, PawnState, PlayerColor } from '../domain/types.js';
import { resolvePawnCoordinate } from './home.js';

export type OccupancyOccupant = Readonly<{
  playerId: string;
  pawnId: string;
  zone: 'OFF_BOARD' | 'PERIMETER' | 'HOME' | 'REMOVED';
  semanticZone: 'PERIMETER' | 'HOME' | 'OFF_BOARD' | 'REMOVED';
  coord: BoardCoord;
}>;

export type OccupancyCell = Readonly<{
  coord: BoardCoord;
  occupants: readonly OccupancyOccupant[];
}>;

export type OccupancyConflict = Readonly<{
  coord: BoardCoord;
  occupants: readonly OccupancyOccupant[];
}>;

export type OccupancyResult = Readonly<{
  cells: readonly OccupancyCell[];
  conflicts: readonly OccupancyConflict[];
}>;

export function getOccupancy(
  pawns: readonly PawnState[],
  players: readonly { playerId: string; color: PlayerColor }[],
): OccupancyResult {
  const playersById = new Map(players.map((player) => [player.playerId, player] as const));
  const cells = new Map<string, OccupancyOccupant[]>();

  for (const pawn of pawns) {
    const owner = playersById.get(pawn.playerId);
    if (!owner) {
      continue;
    }
    const coord = resolvePawnCoordinate(pawn.position, owner);
    if (!coord) {
      continue;
    }
    const key = `${coord.row},${coord.col}`;
    const occupant: OccupancyOccupant = {
      playerId: pawn.playerId,
      pawnId: pawn.pawnId,
      zone: pawn.position.zone,
      semanticZone:
        pawn.position.zone === 'PERIMETER' && pawn.position.progress === 0
          ? 'PERIMETER'
          : pawn.position.zone,
      coord,
    };
    const existing = cells.get(key);
    if (existing) {
      existing.push(occupant);
    } else {
      cells.set(key, [occupant]);
    }
  }

  const orderedCells = [...cells.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, occupants]) => {
      const [row, col] = key.split(',').map(Number) as [number, number];
      return {
        coord: { row: row as BoardCoord['row'], col: col as BoardCoord['col'] },
        occupants,
      };
    });

  return {
    cells: orderedCells,
    conflicts: orderedCells.filter((cell) => cell.occupants.length > 1),
  };
}
