import { getLegalActions, type GameState, type LegalAction } from '@zamanushka/game-engine';
import type { GameCommandRequest, GameCommandResult } from '@zamanushka/shared';
import type { MatchRepository } from '../match/match-repository.js';
import type { BotCommand, BotLegalAction, BotRuntimeAdapter } from './types.js';

function actionProgressScore(action: LegalAction): number | undefined {
  if (action.type !== 'MOVE_PAWN') return undefined;
  if (action.to.zone === 'HOME') return 100 + action.to.homeIndex;
  if (action.to.zone === 'PERIMETER') return action.to.progress;
  return undefined;
}

function adaptAction(action: LegalAction): BotLegalAction | null {
  if (action.type === 'SURRENDER') return null;
  if (action.type === 'ROLL_DICE') return { type: 'ROLL_DICE' };
  const adapted: BotLegalAction = {
    type: action.type,
    pawnId: action.pawnId,
    capturesOpponent: action.type === 'MOVE_PAWN' && Boolean(action.capture),
  };
  const progressScore = actionProgressScore(action);
  if (progressScore !== undefined) adapted.progressScore = progressScore;
  return adapted;
}

function toGameCommand(command: BotCommand): GameCommandRequest {
  if (command.type === 'ROLL_DICE') {
    return {
      type: 'ROLL_DICE',
      matchId: command.matchId,
      actionId: command.actionId,
      expectedStateVersion: command.expectedStateVersion,
    };
  }
  if (command.type === 'ENTER_PAWN') {
    if (!command.pawnId) throw new Error('BOT_COMMAND_PAWN_REQUIRED');
    return {
      type: 'ENTER_PAWN',
      matchId: command.matchId,
      actionId: command.actionId,
      expectedStateVersion: command.expectedStateVersion,
      pawnId: command.pawnId,
    };
  }
  if (!command.pawnId) throw new Error('BOT_COMMAND_PAWN_REQUIRED');
  return {
    type: 'MOVE_PAWN',
    matchId: command.matchId,
    actionId: command.actionId,
    expectedStateVersion: command.expectedStateVersion,
    pawnId: command.pawnId,
  };
}

export function createBotRuntimeAdapter(deps: {
  matchRepository: MatchRepository;
  processCommand(input: {
    authenticatedUserId: string | null | undefined;
    command: GameCommandRequest;
  }): Promise<GameCommandResult>;
}): BotRuntimeAdapter {
  return {
    async readTurn(matchId) {
      const match = await deps.matchRepository.loadCurrentMatch(matchId);
      if (!match) return null;

      const state = match.snapshot as unknown as GameState;
      const activeParticipantId = state.currentPlayerId;
      const activeParticipant = activeParticipantId
        ? state.players.find((player) => player.playerId === activeParticipantId)
        : null;
      const legalActions =
        activeParticipantId && state.status === 'ACTIVE'
          ? getLegalActions(state, activeParticipantId).map(adaptAction).filter((action): action is BotLegalAction => action !== null)
          : [];

      return {
        matchId,
        stateVersion: state.stateVersion,
        status: state.status,
        activeParticipantId,
        activeParticipantKind: activeParticipant?.participantKind ?? 'HUMAN',
        legalActions,
        phase: state.turnPhase,
      };
    },

    async submitCommand(command) {
      const current = await deps.matchRepository.loadCurrentMatch(command.matchId);
      const state = current?.snapshot as GameState | undefined;
      const activeParticipantId = state?.currentPlayerId;
      if (!activeParticipantId) {
        return {
          ok: false,
          code: 'NO_ACTIVE_PARTICIPANT',
          ...(current?.stateVersion === undefined ? {} : { stateVersion: current.stateVersion }),
        };
      }
      const active = state.players.find((player) => player.playerId === activeParticipantId);
      if (active?.participantKind !== 'BOT') {
        return {
          ok: false,
          code: 'ACTIVE_PARTICIPANT_NOT_BOT',
          ...(current?.stateVersion === undefined ? {} : { stateVersion: current.stateVersion }),
        };
      }
      const result = await deps.processCommand({
        authenticatedUserId: activeParticipantId,
        command: toGameCommand(command),
      });
      return {
        ok: result.ok,
        stateVersion: result.stateVersion,
        ...(result.ok ? {} : { code: result.code }),
      };
    },
  };
}
