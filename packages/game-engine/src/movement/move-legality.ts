import type { GameState } from '../domain/types.js';
import { resolvePhysicalPath } from './path.js';
import { coordinateOf } from './path.js';

export function canMovePawn(state: GameState, pawnId: string, distance: number): boolean {
  const pawn = state.pawns.find((candidate) => candidate.pawnId === pawnId);
  if (!pawn) {
    return false;
  }
  if (pawn.position.zone === 'OFF_BOARD' || pawn.position.zone === 'REMOVED') {
    return false;
  }

  const path = resolvePhysicalPath(state, pawnId, distance);
  if (!path) {
    return false;
  }

  const owner = state.players.find((player) => player.playerId === pawn.playerId);
  if (!owner) {
    return false;
  }

  const destination = path[path.length - 1];
  if (!destination) {
    return false;
  }

  const destinationOccupants = state.pawns.filter((candidate) => {
    if (candidate.pawnId === pawnId) {
      return false;
    }
    const candidateOwner = state.players.find((player) => player.playerId === candidate.playerId);
    if (!candidateOwner) {
      return false;
    }
    const candidateCoord = coordinateOf(candidate.position, candidateOwner.color);
    return candidateCoord?.row === destination.row && candidateCoord?.col === destination.col;
  });

  if (destinationOccupants.some((candidate) => candidate.playerId === pawn.playerId)) {
    return false;
  }

  return true;
}
