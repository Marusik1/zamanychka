import type { GameCommand, GameEvent, GameState, GameTransitionErrorCode, GameTransitionResult, PawnState, PlayerState } from '../domain/types.js';
import { getLegalActions } from '../actions/legal-actions.js';
import { getOccupancy } from '../board/occupancy.js';
import { getNextActivePlayerId } from '../turns/turn-rotation.js';
import { isWinningState, projectTerminalState } from './victory.js';

function fail(code: GameTransitionErrorCode, message: string): GameTransitionResult {
  return { ok: false, code, message };
}

function getPlayer(state: GameState, playerId: string): PlayerState | null {
  return state.players.find((player) => player.playerId === playerId) ?? null;
}

function incrementStateVersion(state: GameState): GameState {
  return {
    ...state,
    stateVersion: state.stateVersion + 1,
  };
}

function removePlayerPawns(state: GameState, playerId: string): GameState {
  const canonicalPawns = [...state.pawns]
    .filter((pawn) => pawn.playerId === playerId)
    .sort((left, right) => left.pawnId.localeCompare(right.pawnId));

  let nextState = state;
  for (const pawn of canonicalPawns) {
    nextState = {
      ...nextState,
      pawns: nextState.pawns.map((candidate) =>
        candidate.pawnId === pawn.pawnId ? { ...candidate, position: { zone: 'REMOVED' } } : candidate,
      ),
    };
  }
  return nextState;
}

function activePlayerCount(state: GameState): number {
  return state.players.filter((player) => player.status === 'ACTIVE').length;
}

function terminalizeIfNeeded(state: GameState): GameState | null {
  if (activePlayerCount(state) !== 1) {
    return null;
  }
  const winner = state.players.find((player) => player.status === 'ACTIVE')?.playerId ?? null;
  if (!winner) {
    return null;
  }
  return projectTerminalState(state, winner, 'LAST_ACTIVE_PLAYER');
}

export function surrenderTransition(state: GameState, command: Extract<GameCommand, { type: 'SURRENDER' }>, context: { actorPlayerId: string; diceValue?: 1 | 2 | 3 | 4 | 5 | 6 }): GameTransitionResult {
  if (state.status !== 'ACTIVE') {
    return fail('MATCH_NOT_ACTIVE', 'match must be active');
  }
  if (state.stateVersion !== command.expectedStateVersion) {
    return fail('STALE_STATE_VERSION', 'state version mismatch');
  }

  const actor = getPlayer(state, context.actorPlayerId);
  if (!actor) {
    return fail('PLAYER_NOT_IN_MATCH', 'actor must belong to match');
  }
  if (actor.status !== 'ACTIVE') {
    return fail('PLAYER_NOT_ACTIVE', 'actor must be active');
  }

  const surrenderedState: GameState = {
    ...state,
    players: state.players.map((player) =>
      player.playerId === context.actorPlayerId ? { ...player, status: 'SURRENDERED' } : player,
    ),
  };

  const removedState = removePlayerPawns(surrenderedState, context.actorPlayerId);
  const events: GameEvent[] = [
    { type: 'playerSurrendered', playerId: context.actorPlayerId },
    ...[...state.pawns]
      .filter((pawn) => pawn.playerId === context.actorPlayerId)
      .sort((left, right) => left.pawnId.localeCompare(right.pawnId))
      .map((pawn) => ({ type: 'pawnRemoved', pawnId: pawn.pawnId, playerId: pawn.playerId }) as const),
  ];

  const terminal = terminalizeIfNeeded(removedState);
  if (terminal) {
    return {
      ok: true,
      state: incrementStateVersion(terminal),
      events: [...events, { type: 'gameWon', winnerPlayerId: terminal.winnerPlayerId!, reason: 'LAST_ACTIVE_PLAYER' }],
      legalActions: [],
    };
  }

  const nextCurrentPlayerId = state.currentPlayerId === context.actorPlayerId ? getNextActivePlayerId(removedState, context.actorPlayerId) : state.currentPlayerId;
  const nextState: GameState =
    state.currentPlayerId === context.actorPlayerId
      ? {
          ...removedState,
          currentPlayerId: nextCurrentPlayerId,
          turnPhase: 'WAITING_FOR_ROLL',
          diceValue: null,
          turnNumber: state.turnNumber + 1,
        }
      : {
          ...removedState,
          currentPlayerId: state.currentPlayerId,
          turnPhase: state.turnPhase,
          diceValue: state.diceValue,
          turnNumber: state.turnNumber,
        };

  const finalState = incrementStateVersion(nextState);
  const additionalEvents =
    state.currentPlayerId === context.actorPlayerId
      ? nextCurrentPlayerId
        ? [
            {
              type: 'turnChanged',
              fromPlayerId: context.actorPlayerId,
              toPlayerId: nextCurrentPlayerId,
              turnNumber: nextState.turnNumber,
            } as const,
          ]
        : []
      : [];

  return {
    ok: true,
    state: finalState,
    events: [...events, ...additionalEvents],
    legalActions: getLegalActions(nextState, nextState.currentPlayerId ?? ''),
  };
}
