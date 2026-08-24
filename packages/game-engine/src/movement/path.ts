import type { BoardCoord, GameState, PawnPosition, PlayerColor } from '../domain/types.js';
import { getOccupancy } from '../board/occupancy.js';
import { resolveHomeCoord } from '../board/home.js';
import { resolvePerimeterCoord } from '../board/perimeter.js';

function getPawn(state: GameState, pawnId: string) {
  return state.pawns.find((pawn) => pawn.pawnId === pawnId) ?? null;
}

function getOwner(state: GameState, playerId: string) {
  return state.players.find((player) => player.playerId === playerId) ?? null;
}

export function coordinateOf(position: PawnPosition, color: PlayerColor): BoardCoord | null {
  switch (position.zone) {
    case 'OFF_BOARD':
    case 'REMOVED':
      return null;
    case 'PERIMETER':
      if (!Number.isInteger(position.progress) || position.progress < 0 || position.progress > 27) {
        return null;
      }
      return position.progress === 0 ? resolveHomeCoord(color, 0) : resolvePerimeterCoord(color, position.progress);
    case 'HOME':
      return resolveHomeCoord(color, position.homeIndex);
  }
}

function nextPosition(position: PawnPosition): PawnPosition | null {
  switch (position.zone) {
    case 'OFF_BOARD':
    case 'REMOVED':
      return null;
    case 'PERIMETER':
      if (!Number.isInteger(position.progress) || position.progress < 0 || position.progress > 27) {
        return null;
      }
      if (position.progress === 27) {
        return { zone: 'HOME', homeIndex: 0 };
      }
      return { zone: 'PERIMETER', progress: position.progress + 1 };
    case 'HOME':
      if (position.homeIndex >= 3) {
        return null;
      }
      return { zone: 'HOME', homeIndex: (position.homeIndex + 1) as 0 | 1 | 2 | 3 };
  }
}

function buildPath(state: GameState, pawnId: string, distance: number): BoardCoord[] | null {
  if (!Number.isInteger(distance) || distance <= 0) {
    return null;
  }

  const pawn = getPawn(state, pawnId);
  if (!pawn) {
    return null;
  }

  const owner = getOwner(state, pawn.playerId);
  if (!owner) {
    return null;
  }

  let position = pawn.position;
  const path: BoardCoord[] = [];
  for (let index = 0; index < distance; index += 1) {
    const next = nextPosition(position);
    if (!next) {
      return null;
    }
    const coord = coordinateOf(next, owner.color);
    if (!coord) {
      return null;
    }
    path.push(coord);
    position = next;
  }

  return path;
}

export function resolvePhysicalPath(state: GameState, pawnId: string, distance: number): BoardCoord[] | null {
  const pawn = getPawn(state, pawnId);
  if (!pawn) {
    return null;
  }
  const owner = getOwner(state, pawn.playerId);
  if (!owner) {
    return null;
  }
  if (pawn.position.zone === 'OFF_BOARD' || pawn.position.zone === 'REMOVED') {
    return null;
  }

  const path = buildPath(state, pawnId, distance);
  if (!path) {
    return null;
  }

  const occupancy = getOccupancy(state.pawns, state.players);

  for (let index = 0; index < path.length; index += 1) {
    const coord = path[index]!;
    const isDestination = index === path.length - 1;
    const cell = occupancy.cells.find((candidate) => candidate.coord.row === coord.row && candidate.coord.col === coord.col);
    if (!cell) {
      continue;
    }
    if (!isDestination && cell.occupants.length > 0) {
      return null;
    }
    if (isDestination) {
      const ownOccupant = cell.occupants.find((occupant) => occupant.playerId === pawn.playerId);
      if (ownOccupant) {
        return null;
      }
      if (cell.occupants.some((occupant) => occupant.semanticZone === 'HOME' && occupant.playerId !== pawn.playerId)) {
        return null;
      }
    }
  }

  return path;
}
