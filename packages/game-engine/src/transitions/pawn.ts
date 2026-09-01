import { getLegalActions, getLegalTurnActions } from '../actions/legal-actions.js';
import { getOccupancy } from '../board/occupancy.js';
import { resolveHomeCoord } from '../board/home.js';
import type {
  GameCommand,
  GameEvent,
  GameState,
  GameTransitionErrorCode,
  GameTransitionResult,
  PawnState,
  WinReason,
} from '../domain/types.js';
import { gameEvents } from '../events/events.js';
import { canMovePawn } from '../movement/move-legality.js';
import { getNextActivePlayerId } from '../turns/turn-rotation.js';
import { isWinningState, projectTerminalState } from './victory.js';
import { resolvePhysicalPath } from '../movement/path.js';

function fail(code: GameTransitionErrorCode, message: string): GameTransitionResult {
  return {
    ok: false,
    code,
    message,
  };
}

function getPlayer(state: GameState, playerId: string) {
  return state.players.find((player) => player.playerId === playerId) ?? null;
}

function getPawn(state: GameState, pawnId: string) {
  return state.pawns.find((pawn) => pawn.pawnId === pawnId) ?? null;
}

function isCoordEqual(
  left: { row: number; col: number },
  right: { row: number; col: number },
): boolean {
  return left.row === right.row && left.col === right.col;
}

function getOccupantsAtCoord(state: GameState, coord: { row: number; col: number }) {
  const occupancy = getOccupancy(state.pawns, state.players);
  return occupancy.cells.find((cell) => isCoordEqual(cell.coord, coord))?.occupants ?? [];
}

function getCurrentTurnAction(
  state: GameState,
  command: Extract<GameCommand, { type: 'ENTER_PAWN' | 'MOVE_PAWN' }>,
) {
  return getLegalTurnActions(state, command.actorPlayerId).find(
    (action) => action.type === command.type && action.pawnId === command.pawnId,
  );
}

function hasHomeDiagonalCompleted(state: GameState, playerId: string): boolean {
  const homePawns = state.pawns.filter(
    (pawn) => pawn.playerId === playerId && pawn.position.zone === 'HOME',
  );
  if (homePawns.length !== 4) {
    return false;
  }

  const homeIndices = new Set<0 | 1 | 2 | 3>(
    homePawns
      .filter(
        (
          pawn,
        ): pawn is PawnState & { position: Readonly<{ zone: 'HOME'; homeIndex: 0 | 1 | 2 | 3 }> } =>
          pawn.position.zone === 'HOME',
      )
      .map((pawn) => pawn.position.homeIndex),
  );
  return homeIndices.size === 4;
}

function determineWinReason(state: GameState, playerId: string): WinReason {
  return hasHomeDiagonalCompleted(state, playerId)
    ? 'HOME_DIAGONAL_COMPLETED'
    : 'LAST_ACTIVE_PLAYER';
}

function incrementStateVersion(state: GameState): GameState {
  return {
    ...state,
    stateVersion: state.stateVersion + 1,
  };
}

function updatePawnPosition(
  state: GameState,
  pawnId: string,
  position: PawnState['position'],
): GameState {
  return {
    ...state,
    pawns: state.pawns.map((pawn) => (pawn.pawnId === pawnId ? { ...pawn, position } : pawn)),
  };
}

function moveCapturedPawnOffBoard(state: GameState, pawnId: string): GameState {
  return updatePawnPosition(state, pawnId, { zone: 'OFF_BOARD' });
}

function advancePosition(
  position: PawnState['position'],
  distance: number,
): PawnState['position'] | null {
  if (position.zone === 'PERIMETER') {
    const total = position.progress + distance;
    if (total <= 27) {
      return { zone: 'PERIMETER', progress: total };
    }
    const homeIndex = total - 28;
    return homeIndex <= 3 ? { zone: 'HOME', homeIndex: homeIndex as 0 | 1 | 2 | 3 } : null;
  }

  if (position.zone === 'HOME') {
    const homeIndex = position.homeIndex + distance;
    return homeIndex <= 3 ? { zone: 'HOME', homeIndex: homeIndex as 0 | 1 | 2 | 3 } : null;
  }

  return null;
}

function enterPawnTransition(
  state: GameState,
  command: Extract<GameCommand, { type: 'ENTER_PAWN' }>,
  context: { actorPlayerId: string; diceValue?: 1 | 2 | 3 | 4 | 5 | 6 },
): GameTransitionResult {
  const actor = getPlayer(state, context.actorPlayerId);
  if (state.status !== 'ACTIVE') {
    return fail('MATCH_NOT_ACTIVE', 'match must be active');
  }
  if (!actor) {
    return fail('PLAYER_NOT_IN_MATCH', 'actor must belong to match');
  }
  if (actor.status !== 'ACTIVE') {
    return fail('PLAYER_NOT_ACTIVE', 'actor must be active');
  }
  if (state.currentPlayerId !== context.actorPlayerId) {
    return fail('NOT_CURRENT_PLAYER', 'actor must be current player');
  }
  if (state.turnPhase !== 'WAITING_FOR_ACTION') {
    return fail('NO_LEGAL_ACTION', 'enter pawn requires waiting-for-action phase');
  }
  if (state.diceValue !== 6) {
    return fail('ILLEGAL_MOVE', 'enter pawn requires stored dice value 6');
  }
  if (state.stateVersion !== command.expectedStateVersion) {
    return fail('STALE_STATE_VERSION', 'state version mismatch');
  }

  const pawn = getPawn(state, command.pawnId);
  if (!pawn || pawn.playerId !== context.actorPlayerId) {
    return fail('NO_LEGAL_ACTION', 'pawn must belong to actor');
  }
  if (pawn.position.zone !== 'OFF_BOARD') {
    return fail('ILLEGAL_MOVE', 'enter pawn requires off-board pawn');
  }

  const requested = getCurrentTurnAction(state, command);
  if (!requested || requested.type !== 'ENTER_PAWN') {
    return fail('NO_LEGAL_ACTION', 'requested enter action is not legal');
  }

  const startCoord = resolveHomeCoord(actor.color, 0);
  const startOccupants = getOccupantsAtCoord(state, startCoord);
  if (startOccupants.length > 0) {
    return fail('ILLEGAL_MOVE', 'start corner must be free');
  }

  const enteredState: GameState = {
    ...updatePawnPosition(state, pawn.pawnId, { zone: 'PERIMETER', progress: 0 }),
    diceValue: null,
    turnPhase: 'WAITING_FOR_ROLL',
  };

  const events: GameEvent[] = [
    gameEvents.pawnEntered(pawn.pawnId, pawn.playerId),
    gameEvents.extraRollGranted(pawn.playerId, 'ROLLED_SIX'),
  ];

  if (isWinningState(enteredState, pawn.playerId)) {
    const reason = determineWinReason(enteredState, pawn.playerId);
    const terminal = projectTerminalState(enteredState, pawn.playerId, reason);
    return {
      ok: true,
      state: incrementStateVersion(terminal),
      events: [...events, gameEvents.gameWon(pawn.playerId, reason)],
      legalActions: [],
    };
  }

  return {
    ok: true,
    state: incrementStateVersion(enteredState),
    events,
    legalActions: getLegalActions(enteredState, pawn.playerId),
  };
}

function movePawnTransition(
  state: GameState,
  command: Extract<GameCommand, { type: 'MOVE_PAWN' }>,
  context: { actorPlayerId: string; diceValue?: 1 | 2 | 3 | 4 | 5 | 6 },
): GameTransitionResult {
  const actor = getPlayer(state, context.actorPlayerId);
  if (state.status !== 'ACTIVE') {
    return fail('MATCH_NOT_ACTIVE', 'match must be active');
  }
  if (!actor) {
    return fail('PLAYER_NOT_IN_MATCH', 'actor must belong to match');
  }
  if (actor.status !== 'ACTIVE') {
    return fail('PLAYER_NOT_ACTIVE', 'actor must be active');
  }
  if (state.currentPlayerId !== context.actorPlayerId) {
    return fail('NOT_CURRENT_PLAYER', 'actor must be current player');
  }
  if (state.turnPhase !== 'WAITING_FOR_ACTION') {
    return fail('NO_LEGAL_ACTION', 'move pawn requires waiting-for-action phase');
  }
  if (!state.diceValue) {
    return fail('DICE_VALUE_REQUIRED', 'stored dice value is required');
  }
  if (state.stateVersion !== command.expectedStateVersion) {
    return fail('STALE_STATE_VERSION', 'state version mismatch');
  }

  const pawn = getPawn(state, command.pawnId);
  if (!pawn || pawn.playerId !== context.actorPlayerId) {
    return fail('NO_LEGAL_ACTION', 'pawn must belong to actor');
  }

  const requested = getCurrentTurnAction(state, command);
  if (!requested || requested.type !== 'MOVE_PAWN') {
    return fail('NO_LEGAL_ACTION', 'requested move action is not legal');
  }

  const distance = state.diceValue;
  if (!canMovePawn(state, pawn.pawnId, distance)) {
    return fail('ILLEGAL_MOVE', 'requested move is not physically legal');
  }
  const path = resolvePhysicalPath(state, pawn.pawnId, distance);
  if (!path || path.length !== distance) {
    return fail('ILLEGAL_MOVE', 'path is not legally resolvable');
  }

  const destination = path[path.length - 1];
  if (!destination) {
    return fail('ILLEGAL_MOVE', 'path is not legally resolvable');
  }
  const destinationOccupants = getOccupantsAtCoord(state, destination).filter(
    (occupant) => occupant.pawnId !== pawn.pawnId,
  );
  const ownOccupant = destinationOccupants.find((occupant) => occupant.playerId === pawn.playerId);
  if (ownOccupant) {
    return fail('ILLEGAL_MOVE', 'destination is occupied by own pawn');
  }
  if (
    destinationOccupants.some(
      (occupant) => occupant.zone === 'HOME' && occupant.playerId !== pawn.playerId,
    )
  ) {
    return fail('ILLEGAL_MOVE', 'home occupancy blocks the route');
  }

  const nextPosition = advancePosition(pawn.position, distance);

  if (!nextPosition) {
    return fail('ILLEGAL_MOVE', 'destination overflows home path');
  }

  const capturedOccupant =
    destinationOccupants.find(
      (occupant) => occupant.playerId !== pawn.playerId && occupant.zone === 'PERIMETER',
    ) ?? null;

  let movedState = updatePawnPosition(state, pawn.pawnId, nextPosition);
  const events: GameEvent[] = [gameEvents.pawnMoved(pawn.pawnId, pawn.playerId)];

  if (capturedOccupant) {
    movedState = moveCapturedPawnOffBoard(movedState, capturedOccupant.pawnId);
    events.push(
      gameEvents.pawnCaptured(
        pawn.pawnId,
        pawn.playerId,
        capturedOccupant.pawnId,
        capturedOccupant.playerId,
      ),
    );
  }

  if (pawn.position.zone === 'PERIMETER' && nextPosition.zone === 'HOME') {
    events.push(gameEvents.pawnEnteredHome(pawn.pawnId, pawn.playerId, nextPosition.homeIndex));
  }

  const grantsExtraRoll = state.diceValue === 6 || capturedOccupant !== null;
  const nextStateWithoutVersion: GameState =
    grantsExtraRoll
      ? {
          ...movedState,
          diceValue: null,
          turnPhase: 'WAITING_FOR_ROLL',
          currentPlayerId: pawn.playerId,
        }
      : {
          ...movedState,
          diceValue: null,
          turnPhase: 'WAITING_FOR_ROLL',
          currentPlayerId: getNextActivePlayerId(movedState, pawn.playerId),
          turnNumber: movedState.turnNumber + 1,
        };

  if (isWinningState(nextStateWithoutVersion, pawn.playerId)) {
    const reason = determineWinReason(nextStateWithoutVersion, pawn.playerId);
    const terminal = projectTerminalState(nextStateWithoutVersion, pawn.playerId, reason);
    return {
      ok: true,
      state: incrementStateVersion(terminal),
      events: [...events, gameEvents.gameWon(pawn.playerId, reason)],
      legalActions: [],
    };
  }

  if (grantsExtraRoll) {
    events.push(
      gameEvents.extraRollGranted(pawn.playerId, capturedOccupant ? 'CAPTURE' : 'ROLLED_SIX'),
    );
  } else {
    events.push(
      gameEvents.turnChanged(
        pawn.playerId,
        nextStateWithoutVersion.currentPlayerId ?? pawn.playerId,
        nextStateWithoutVersion.turnNumber,
      ),
    );
  }

  return {
    ok: true,
    state: incrementStateVersion(nextStateWithoutVersion),
    events,
    legalActions: getLegalActions(
      nextStateWithoutVersion,
      nextStateWithoutVersion.currentPlayerId ?? pawn.playerId,
    ),
  };
}

export function enterOrMovePawnTransition(
  state: GameState,
  command: Extract<GameCommand, { type: 'ENTER_PAWN' | 'MOVE_PAWN' }>,
  context: { actorPlayerId: string; diceValue?: 1 | 2 | 3 | 4 | 5 | 6 },
): GameTransitionResult {
  switch (command.type) {
    case 'ENTER_PAWN':
      return enterPawnTransition(state, command, context);
    case 'MOVE_PAWN':
      return movePawnTransition(state, command, context);
  }
}
