import { transition as defaultTransition } from '@zamanushka/game-engine';
import type {
  GameCommand as EngineCommand,
  GameState,
  GameTransitionResult,
} from '@zamanushka/game-engine';
import type {
  GameCommandErrorCode,
  GameCommandRequest,
  GameCommandResult,
  MatchSnapshot,
} from '@zamanushka/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { MatchRepository } from '../match/match-repository.js';
import { buildMatchResultDraft } from '../profile/result-draft.js';
import { createEventJournal } from './event-journal.js';

type Json = Prisma.InputJsonValue;
type Transition = (
  state: GameState,
  command: EngineCommand,
  context: { actorPlayerId: string; diceValue?: 1 | 2 | 3 | 4 | 5 | 6 },
) => GameTransitionResult;

export type TerminalMatchHook = (input: {
  tx: Prisma.TransactionClient;
  matchId: string;
}) => Promise<void> | void;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function commandFingerprint(input: {
  authenticatedUserId: string;
  command: GameCommandRequest;
}): string {
  return JSON.stringify(
    canonicalize({ actorUserId: input.authenticatedUserId, command: input.command }),
  );
}

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function displayNameFromUser(user: { firstName: string; lastName: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

function failure(
  command: GameCommandRequest,
  code: GameCommandErrorCode,
  message: string,
  stateVersion: number,
  snapshot?: MatchSnapshot,
): GameCommandResult {
  return {
    ok: false,
    matchId: command.matchId,
    actionId: command.actionId,
    code,
    message,
    stateVersion,
    ...(snapshot ? { snapshot } : {}),
  };
}

function mapEngineFailure(
  code: Extract<GameTransitionResult, { ok: false }>['code'],
): GameCommandErrorCode {
  switch (code) {
    case 'MATCH_NOT_ACTIVE':
      return 'MATCH_FINISHED';
    case 'PLAYER_NOT_IN_MATCH':
      return 'MATCH_ACCESS_DENIED';
    case 'PLAYER_NOT_ACTIVE':
    case 'NOT_CURRENT_PLAYER':
      return 'NOT_YOUR_TURN';
    case 'STALE_STATE_VERSION':
      return 'STALE_STATE_VERSION';
    case 'ILLEGAL_MOVE':
      return 'PAWN_NOT_MOVABLE';
    default:
      return 'INVALID_ACTION';
  }
}

function snapshot(
  state: GameState,
  lastSequence: number,
  timing: { startedAt: Date; finishedAt: Date | null },
): MatchSnapshot {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    pawns: state.pawns.map((pawn) => ({ ...pawn, position: { ...pawn.position } })),
    lastSequence,
    startedAt: timing.startedAt.toISOString(),
    finishedAt: timing.finishedAt?.toISOString() ?? null,
  };
}

export function createCommandProcessor(options: {
  repository: MatchRepository;
  onTerminalMatch: TerminalMatchHook;
  rollDice?: () => 1 | 2 | 3 | 4 | 5 | 6;
  transition?: Transition;
}) {
  const rollDice =
    options.rollDice ?? (() => (Math.floor(Math.random() * 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6);
  const transition = options.transition ?? defaultTransition;
  const journal = createEventJournal();

  return {
    async process(input: {
      authenticatedUserId: string | null | undefined;
      command: GameCommandRequest;
    }): Promise<GameCommandResult> {
      const { command } = input;
      if (!input.authenticatedUserId)
        return failure(command, 'UNAUTHORIZED', 'Authenticated session is required', 0);
      const authenticatedUserId = input.authenticatedUserId;
      const fingerprint = commandFingerprint({ authenticatedUserId, command });
      const result = await options.repository.withLockedMatch(
        command.matchId,
        async (tx, match) => {
          if (!match) return failure(command, 'MATCH_NOT_FOUND', 'Match was not found', 0);
          const prior = await options.repository.findProcessedAction(tx, {
            matchId: command.matchId,
            actionId: command.actionId,
          });
          if (prior) {
            if (prior.requestFingerprint !== fingerprint)
              return failure(
                command,
                'ACTION_ID_CONFLICT',
                'Action ID was already used for a different command',
                match.stateVersion,
              );
            return prior.result as unknown as GameCommandResult;
          }
          const currentSnapshot = match.snapshot as unknown as GameState;
          const current = snapshot(currentSnapshot, match.lastSequence, {
            startedAt: match.createdAt,
            finishedAt: match.finishedAt,
          });
          if (match.status !== 'ACTIVE')
            return failure(
              command,
              'MATCH_FINISHED',
              'Match is already finished',
              match.stateVersion,
              current,
            );
          if (command.expectedStateVersion !== match.stateVersion)
            return failure(
              command,
              'STALE_STATE_VERSION',
              'State version is stale',
              match.stateVersion,
              current,
            );
          if (!currentSnapshot.players.some((player) => player.playerId === authenticatedUserId))
            return failure(
              command,
              'MATCH_ACCESS_DENIED',
              'Authenticated user is not a match player',
              match.stateVersion,
              current,
            );

          const engineCommand = { ...command, actorPlayerId: authenticatedUserId } as EngineCommand;
          const engineResult = transition(currentSnapshot, engineCommand, {
            actorPlayerId: authenticatedUserId,
            ...(command.type === 'ROLL_DICE' ? { diceValue: rollDice() } : {}),
          });
          if (!engineResult.ok)
            return failure(
              command,
              mapEngineFailure(engineResult.code),
              engineResult.message,
              match.stateVersion,
              current,
            );

          const events = journal.envelopes({
            matchId: command.matchId,
            stateVersion: engineResult.state.stateVersion,
            lastSequence: match.lastSequence,
            events: engineResult.events,
            actorPlayerId: authenticatedUserId,
            before: currentSnapshot,
            after: engineResult.state,
          });
          const firstSequence = events[0]?.sequence ?? match.lastSequence + 1;
          const lastSequence = events.at(-1)?.sequence ?? match.lastSequence;
          let nextSnapshot = snapshot(engineResult.state, lastSequence, {
            startedAt: match.createdAt,
            finishedAt: match.finishedAt,
          });
          const persistedMatch = await options.repository.updateCurrentSnapshot(tx, {
            matchId: command.matchId,
            snapshot: json(engineResult.state),
            stateVersion: engineResult.state.stateVersion,
            ...(engineResult.state.status === 'FINISHED'
              ? {
                  terminalResult: json({
                    winnerPlayerId: engineResult.state.winnerPlayerId,
                    reason: engineResult.state.winReason,
                  }),
                }
              : {}),
          });
          nextSnapshot = snapshot(engineResult.state, lastSequence, {
            startedAt: persistedMatch.createdAt,
            finishedAt: persistedMatch.finishedAt,
          });
          const result: GameCommandResult = {
            ok: true,
            matchId: command.matchId,
            actionId: command.actionId,
            stateVersion: engineResult.state.stateVersion,
            lastSequence,
            snapshot: nextSnapshot,
            events,
            ack: {
              actionId: command.actionId,
              stateVersion: engineResult.state.stateVersion,
              lastSequence,
            },
          };
          if (engineResult.state.status === 'FINISHED') {
            if (!persistedMatch?.finishedAt) {
              throw new Error('terminal match finishedAt was not persisted');
            }
            const users = await options.repository.loadMatchUsers(tx, {
              matchId: command.matchId,
              userIds: engineResult.state.players.map((player) => player.playerId),
            });
            const usersById = new Map(users.map((user) => [user.id, displayNameFromUser(user)]));
            const resultDraft = buildMatchResultDraft({
              matchId: command.matchId,
              roomId: persistedMatch.roomKey,
              status: persistedMatch.status,
              winnerUserId: persistedMatch.terminalResult
                ? (persistedMatch.terminalResult as { winnerPlayerId: string | null })
                    .winnerPlayerId
                : null,
              victoryReason: persistedMatch.terminalResult
                ? (
                    persistedMatch.terminalResult as {
                      reason: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER' | null;
                    }
                  ).reason
                : null,
              startedAt: persistedMatch.createdAt,
              finishedAt: persistedMatch.finishedAt,
              participants: engineResult.state.players.map((player) => {
                const displayName = usersById.get(player.playerId);
                if (!displayName) {
                  throw new Error(`MATCH_RESULT_USER_NOT_FOUND:${player.playerId}`);
                }
                return {
                  userId: player.playerId,
                  displayName,
                  color: player.color,
                  surrendered: player.status === 'SURRENDERED',
                };
              }),
            });
            if (resultDraft) {
              try {
                await options.repository.persistMatchResult(tx, {
                  matchId: command.matchId,
                  result: {
                    roomKey: resultDraft.roomId,
                    winnerUserId: resultDraft.winnerUserId,
                    victoryReason: resultDraft.victoryReason,
                    startedAt: resultDraft.startedAt,
                    finishedAt: resultDraft.finishedAt,
                    participantCount: resultDraft.participantCount,
                    participants: resultDraft.participants,
                  },
                });
              } catch (error) {
                if (!isUniqueConstraintError(error)) throw error;
                const existing = await options.repository.findMatchResult(tx, {
                  matchId: command.matchId,
                });
                if (!existing) throw error;
              }
            }
          }
          await options.repository.appendOrderedEvents(tx, {
            matchId: command.matchId,
            events: events.map(({ sequence, stateVersion, ...event }) => ({
              sequence,
              stateVersion,
              payload: json(event),
            })),
          });
          await options.repository.recordProcessedAction(tx, {
            matchId: command.matchId,
            actionId: command.actionId,
            requestFingerprint: fingerprint,
            result: json(result),
          });
          await options.repository.insertOutboxRow(tx, {
            matchId: command.matchId,
            resultingStateVersion: engineResult.state.stateVersion,
            payload: json({
              matchId: command.matchId,
              transitionId: command.actionId,
              stateVersion: engineResult.state.stateVersion,
              fromSequence: firstSequence,
              toSequence: lastSequence,
              events,
            }),
          });
          if (engineResult.state.status === 'FINISHED') {
            await options.onTerminalMatch({ tx, matchId: command.matchId });
          }
          return result;
        },
      );
      return result;
    },
  };
}
