import type {
  GameEvent,
  GameState,
  GameTransitionError,
  GameTransitionResult,
  GameTransitionSuccess,
} from '../domain/types.js';
import { getLegalActions, getLegalTurnActions } from '../actions/legal-actions.js';
import { getNextActivePlayerId } from '../turns/turn-rotation.js';
import { gameEvents } from '../events/events.js';

function failure(code: GameTransitionError['code'], message: string): GameTransitionError {
  return { ok: false, code, message };
}

function success(
  state: GameState,
  events: GameEvent[],
  legalActions: ReturnType<typeof getLegalActions>,
): GameTransitionSuccess {
  return {
    ok: true,
    state,
    events,
    legalActions,
  };
}

function validate(
  state: GameState,
  command: { actorPlayerId: string; expectedStateVersion: number },
  diceValue: number | undefined,
): GameTransitionError | null {
  if (state.status !== 'ACTIVE') {
    return failure('MATCH_NOT_ACTIVE', 'match is not active');
  }
  if (command.expectedStateVersion !== state.stateVersion) {
    return failure('STALE_STATE_VERSION', 'state version is stale');
  }
  if (diceValue == null || !Number.isInteger(diceValue) || diceValue < 1 || diceValue > 6) {
    return failure('DICE_VALUE_REQUIRED', 'server dice value is required');
  }
  const actor = state.players.find((player) => player.playerId === command.actorPlayerId);
  if (!actor) {
    return failure('PLAYER_NOT_IN_MATCH', 'player is not in match');
  }
  if (actor.status !== 'ACTIVE') {
    return failure('PLAYER_NOT_ACTIVE', 'player is not active');
  }
  if (state.currentPlayerId !== command.actorPlayerId) {
    return failure('NOT_CURRENT_PLAYER', 'not current player');
  }
  if (state.turnPhase !== 'WAITING_FOR_ROLL') {
    return failure('INVALID_COMMAND', 'roll dice is only allowed while waiting for roll');
  }
  if (state.diceValue !== null) {
    return failure('INVALID_COMMAND', 'dice already stored');
  }
  return null;
}

function withDiceValue(state: GameState, diceValue: number): GameState {
  return {
    ...state,
    stateVersion: state.stateVersion + 1,
    diceValue: diceValue as 1 | 2 | 3 | 4 | 5 | 6,
  };
}

export function rollDiceTransition(
  state: GameState,
  command: { actorPlayerId: string; expectedStateVersion: number },
  context: { actorPlayerId: string; diceValue?: 1 | 2 | 3 | 4 | 5 | 6 },
): GameTransitionResult {
  if (command.actorPlayerId !== context.actorPlayerId) {
    return failure('INVALID_COMMAND', 'command actor must match server context actor');
  }
  const validation = validate(state, command, context.diceValue);
  if (validation) {
    return validation;
  }

  const rolled = context.diceValue;
  if (rolled == null) {
    return failure('DICE_VALUE_REQUIRED', 'server dice value is required');
  }
  const nextWithDice = withDiceValue(state, rolled);
  const turnActions = getLegalTurnActions(
    {
      ...nextWithDice,
      turnPhase: 'WAITING_FOR_ACTION',
      diceValue: rolled,
    },
    command.actorPlayerId,
  );
  const moveActions = turnActions.filter(
    (action) => action.type === 'ENTER_PAWN' || action.type === 'MOVE_PAWN',
  );

  const diceRolledEvent: GameEvent = gameEvents.diceRolled(rolled);

  if (moveActions.length > 0) {
    const nextState: GameState = {
      ...nextWithDice,
      turnPhase: 'WAITING_FOR_ACTION',
      currentPlayerId: command.actorPlayerId,
      winnerPlayerId: null,
      winReason: null,
      diceValue: rolled,
    };
    return success(nextState, [diceRolledEvent], getLegalActions(nextState, command.actorPlayerId));
  }

  if (rolled === 6) {
    const nextState: GameState = {
      ...nextWithDice,
      turnPhase: 'WAITING_FOR_ROLL',
      currentPlayerId: command.actorPlayerId,
      diceValue: null,
    };
    return success(
      nextState,
      [diceRolledEvent, gameEvents.extraRollGranted(command.actorPlayerId)],
      getLegalActions(nextState, command.actorPlayerId),
    );
  }

  const nextPlayerId = getNextActivePlayerId(state, command.actorPlayerId);
  if (!nextPlayerId) {
    return failure('NO_LEGAL_ACTION', 'no active player available');
  }

  const nextState: GameState = {
    ...nextWithDice,
    turnPhase: 'WAITING_FOR_ROLL',
    currentPlayerId: nextPlayerId,
    turnNumber: state.turnNumber + 1,
    diceValue: null,
  };

  return success(
    nextState,
    [
      diceRolledEvent,
      gameEvents.turnChanged(command.actorPlayerId, nextPlayerId, nextState.turnNumber),
    ],
    getLegalActions(nextState, nextPlayerId),
  );
}
