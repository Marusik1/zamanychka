import type { BoardCoord, GameState, LegalAction, PawnPosition, PlayerState } from '../domain/types.js';
import { getOccupancy } from '../board/occupancy.js';
import { resolveHomeCoord, resolvePawnCoordinate } from '../board/home.js';
import { canMovePawn } from '../movement/move-legality.js';
import { resolvePhysicalPath } from '../movement/path.js';

function isActivePlayer(player: PlayerState | null | undefined): player is PlayerState {
  return player?.status === 'ACTIVE';
}

function getPlayer(state: GameState, playerId: string): PlayerState | null {
  return state.players.find((player) => player.playerId === playerId) ?? null;
}

function sortByCanonicalPawnOrder(actions: LegalAction[]): LegalAction[] {
  return [...actions].sort((left, right) => {
    const leftRank = actionRank(left);
    const rightRank = actionRank(right);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return pawnIdOf(left).localeCompare(pawnIdOf(right));
  });
}

function pawnIdOf(action: LegalAction): string {
  switch (action.type) {
    case 'ENTER_PAWN':
    case 'MOVE_PAWN':
      return action.pawnId;
    default:
      return '';
  }
}

function actionRank(action: LegalAction): number {
  switch (action.type) {
    case 'ROLL_DICE':
      return 0;
    case 'ENTER_PAWN':
      return 1;
    case 'MOVE_PAWN':
      return 2;
    case 'SURRENDER':
      return 3;
  }
}

function getOwnerStartCoord(state: GameState, playerId: string): BoardCoord | null {
  const player = getPlayer(state, playerId);
  if (!player) {
    return null;
  }
  return resolveHomeCoord(player.color, 0);
}

function createEnterAction(state: GameState, pawnId: string): LegalAction | null {
  const pawn = state.pawns.find((candidate) => candidate.pawnId === pawnId);
  if (!pawn || pawn.position.zone !== 'OFF_BOARD') {
    return null;
  }
  const startCoord = getOwnerStartCoord(state, pawn.playerId);
  if (!startCoord) {
    return null;
  }
  const occupancy = getOccupancy(state.pawns, state.players);
  const cell = occupancy.cells.find((candidate) => candidate.coord.row === startCoord.row && candidate.coord.col === startCoord.col);
  if (cell && cell.occupants.length > 0) {
    return null;
  }
  const owner = getPlayer(state, pawn.playerId);
  if (!owner) {
    return null;
  }
  return {
    type: 'ENTER_PAWN',
    pawnId,
    from: pawn.position,
    to: { zone: 'PERIMETER', progress: 0 },
    toCoord: startCoord,
  };
}

function createMoveAction(state: GameState, pawnId: string, distance: number): LegalAction | null {
  const pawn = state.pawns.find((candidate) => candidate.pawnId === pawnId);
  if (!pawn) {
    return null;
  }
  const owner = getPlayer(state, pawn.playerId);
  if (!owner) {
    return null;
  }
  if (!canMovePawn(state, pawnId, distance)) {
    return null;
  }
  const path = resolvePhysicalPath(state, pawnId, distance);
  if (!path || path.length !== distance) {
    return null;
  }
  const destination = path[path.length - 1];
  if (!destination) {
    return null;
  }

  const destinationOccupant = state.pawns.find((candidate) => {
    if (candidate.pawnId === pawnId) {
      return false;
    }
    const candidateOwner = getPlayer(state, candidate.playerId);
    if (!candidateOwner) {
      return false;
    }
    const coord = resolvePawnCoordinate(candidate.position, candidateOwner);
    return coord?.row === destination.row && coord?.col === destination.col;
  });

  const to = nextPawnPosition(pawn.position, owner.color, distance);
  if (!to) {
    return null;
  }

  const action: Extract<LegalAction, { type: 'MOVE_PAWN' }> = {
    type: 'MOVE_PAWN',
    pawnId,
    from: pawn.position,
    to,
    fromCoord: resolvePawnCoordinate(pawn.position, owner)!,
    toCoord: destination,
    physicalPath: path,
  };

  if (destinationOccupant) {
    return {
      ...action,
      capturePreview: {
        playerId: destinationOccupant.playerId,
        pawnId: destinationOccupant.pawnId,
        occupantZone: destinationOccupant.position.zone === 'HOME' ? 'HOME' : 'PERIMETER',
      },
    };
  }

  return action;
}

function nextPawnPosition(position: PawnPosition, color: import('../domain/types.js').PlayerColor, distance: number): PawnPosition | null {
  if (!Number.isInteger(distance) || distance <= 0) {
    return null;
  }
  if (position.zone === 'OFF_BOARD' || position.zone === 'REMOVED') {
    return null;
  }
  if (position.zone === 'PERIMETER') {
    if (!Number.isInteger(position.progress) || position.progress < 0 || position.progress > 27) {
      return null;
    }
    const total = position.progress + distance;
    if (total <= 27) {
      return { zone: 'PERIMETER', progress: total };
    }
    const homeIndex = total - 27 - 1;
    if (homeIndex > 3) {
      return null;
    }
    return { zone: 'HOME', homeIndex: homeIndex as 0 | 1 | 2 | 3 };
  }
  const homeIndex = position.homeIndex + distance;
  if (homeIndex > 3) {
    return null;
  }
  return { zone: 'HOME', homeIndex: homeIndex as 0 | 1 | 2 | 3 };
}

export function getLegalTurnActions(state: GameState, playerId: string): readonly LegalAction[] {
  if (state.status !== 'ACTIVE') {
    return [];
  }
  const player = getPlayer(state, playerId);
  if (!isActivePlayer(player) || state.currentPlayerId !== playerId) {
    return [];
  }

  if (state.turnPhase === 'WAITING_FOR_ROLL') {
    return [{ type: 'ROLL_DICE' }];
  }

  if (state.turnPhase !== 'WAITING_FOR_ACTION' || !state.diceValue) {
    return [];
  }

  const actions: LegalAction[] = [];
  if (state.diceValue === 6) {
    for (const pawn of state.pawns) {
      if (pawn.playerId !== playerId || pawn.position.zone !== 'OFF_BOARD') {
        continue;
      }
      const enter = createEnterAction(state, pawn.pawnId);
      if (enter) {
        actions.push(enter);
      }
    }
  }

  for (const pawn of state.pawns) {
    if (pawn.playerId !== playerId) {
      continue;
    }
    const move = createMoveAction(state, pawn.pawnId, state.diceValue);
    if (move) {
      actions.push(move);
    }
  }

  return sortByCanonicalPawnOrder(actions);
}

export function getLegalActions(state: GameState, playerId: string): readonly LegalAction[] {
  const player = getPlayer(state, playerId);
  if (!isActivePlayer(player) || state.status !== 'ACTIVE') {
    return [];
  }

  const turnActions = getLegalTurnActions(state, playerId);
  if (state.currentPlayerId === playerId) {
    return [...turnActions, { type: 'SURRENDER' }];
  }
  return [{ type: 'SURRENDER' }];
}
