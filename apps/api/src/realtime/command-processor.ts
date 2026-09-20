import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { transition as defaultTransition } from '@zamanushka/game-engine';
import { getLegalActions } from '@zamanushka/game-engine';
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
type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;
type Transition = (
  state: GameState,
  command: EngineCommand,
  context: { actorPlayerId: string; diceValue?: DiceValue },
) => GameTransitionResult;

type DebugSkipDummyTurnErrorCode =
  | 'SOLO_DEBUG_DISABLED'
  | 'MATCH_NOT_FOUND'
  | 'MATCH_NOT_SOLO_DEBUG'
  | 'DEBUG_DUMMY_NOT_FOUND'
  | 'NOT_DEBUG_DUMMY_TURN'
  | 'STALE_STATE_VERSION'
  | 'INVALID_ACTION';

export type DebugSkipDummyTurnResult =
  | GameCommandResult
  | {
      ok: false;
      matchId: string;
      code: DebugSkipDummyTurnErrorCode;
      message: string;
      stateVersion: number;
      snapshot?: MatchSnapshot;
    };

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

function telemetryEnabled() {
  return process.env.GAMEPLAY_TELEMETRY === 'true';
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function logCommandTelemetry(event: string, payload: Record<string, unknown>) {
  if (!telemetryEnabled()) return;
  console.info(
    JSON.stringify({
      scope: 'gameplay-command',
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
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
  enableSoloGameDebug?: boolean;
  rollDice?: () => DiceValue;
  transition?: Transition;
}) {
  const rollDice = options.rollDice ?? (() => (Math.floor(Math.random() * 6) + 1) as DiceValue);
  const transition = options.transition ?? defaultTransition;
  const journal = createEventJournal();

  async function process(input: {
    authenticatedUserId: string | null | undefined;
    command: GameCommandRequest;
    diceValueOverride?: DiceValue;
  }): Promise<GameCommandResult> {
      const processStartedAt = performance.now();
      const { command } = input;
      if (!input.authenticatedUserId)
        return failure(command, 'UNAUTHORIZED', 'Authenticated session is required', 0);
      const authenticatedUserId = input.authenticatedUserId;
      const fingerprint = commandFingerprint({ authenticatedUserId, command });
      let lockWaitMs = 0;
      let dbTransactionMs = 0;
      let validationMs = 0;
      let engineMs = 0;
      let persistenceMs = 0;
      let eventCount = 0;
      const result = await options.repository.withLockedMatch(
        command.matchId,
        async (tx, match, timing) => {
          const txStartedAt = performance.now();
          lockWaitMs = timing.lockWaitMs;
          const validationStartedAt = performance.now();
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
          validationMs = roundMs(performance.now() - validationStartedAt);

          const engineStartedAt = performance.now();
          const engineCommand = { ...command, actorPlayerId: authenticatedUserId } as EngineCommand;
          const engineResult = transition(currentSnapshot, engineCommand, {
            actorPlayerId: authenticatedUserId,
            ...(command.type === 'ROLL_DICE'
              ? { diceValue: input.diceValueOverride ?? rollDice() }
              : {}),
          });
          engineMs = roundMs(performance.now() - engineStartedAt);
          if (!engineResult.ok)
            return failure(
              command,
              mapEngineFailure(engineResult.code),
              engineResult.message,
              match.stateVersion,
              current,
            );

          const persistenceStartedAt = performance.now();
          const events = journal.envelopes({
            matchId: command.matchId,
            stateVersion: engineResult.state.stateVersion,
            lastSequence: match.lastSequence,
            events: engineResult.events,
            actorPlayerId: authenticatedUserId,
            before: currentSnapshot,
            after: engineResult.state,
          });
          eventCount = events.length;
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
          const hasNonHumanParticipant = engineResult.state.players.some(
            (player) => player.participantKind === 'BOT' || player.participantKind === 'DEBUG_DUMMY',
          );
          if (
            engineResult.state.status === 'FINISHED' &&
            engineResult.state.debugMode !== 'SOLO' &&
            !hasNonHumanParticipant
          ) {
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
              actionId: command.actionId,
              stateVersion: engineResult.state.stateVersion,
              fromSequence: firstSequence,
              toSequence: lastSequence,
              events,
            }),
          });
          if (engineResult.state.status === 'FINISHED') {
            await options.onTerminalMatch({ tx, matchId: command.matchId });
          }
          persistenceMs = roundMs(performance.now() - persistenceStartedAt);
          dbTransactionMs = roundMs(performance.now() - txStartedAt);
          return result;
        },
      );
      logCommandTelemetry('command-processed', {
        matchId: command.matchId,
        actionId: command.actionId,
        type: command.type,
        ok: result.ok,
        stateVersion: result.stateVersion,
        eventCount,
        serverProcessingMs: roundMs(performance.now() - processStartedAt),
        validationMs,
        engineMs,
        persistenceMs,
        dbTransactionMs,
        dbLockWaitMs: lockWaitMs,
      });
      return result;
  }

  function debugError(input: {
    matchId: string;
    code: DebugSkipDummyTurnErrorCode;
    message: string;
    stateVersion?: number;
    snapshot?: MatchSnapshot;
  }): DebugSkipDummyTurnResult {
    return {
      ok: false,
      matchId: input.matchId,
      code: input.code,
      message: input.message,
      stateVersion: input.stateVersion ?? 0,
      ...(input.snapshot ? { snapshot: input.snapshot } : {}),
    };
  }

  function dummyPlayer(state: GameState) {
    return state.players.find((player) => player.participantKind === 'DEBUG_DUMMY') ?? null;
  }

  function nextDummyCommand(input: {
    matchId: string;
    state: GameState;
    dummyPlayerId: string;
    expectedStateVersion: number;
  }): GameCommandRequest | null {
    if (input.state.turnPhase === 'WAITING_FOR_ROLL') {
      return {
        type: 'ROLL_DICE',
        matchId: input.matchId,
        actionId: `debug-dummy-skip:${randomUUID()}`,
        expectedStateVersion: input.expectedStateVersion,
      };
    }

    const action = getLegalActions(input.state, input.dummyPlayerId).find(
      (candidate) => candidate.type === 'ENTER_PAWN' || candidate.type === 'MOVE_PAWN',
    );
    if (!action) return null;
    return {
      type: action.type,
      matchId: input.matchId,
      actionId: `debug-dummy-skip:${randomUUID()}`,
      expectedStateVersion: input.expectedStateVersion,
      pawnId: action.pawnId,
    };
  }

  async function skipDebugDummyTurn(input: {
    authenticatedUserId: string | null | undefined;
    matchId: string;
    expectedStateVersion: number;
  }): Promise<DebugSkipDummyTurnResult> {
    if (!options.enableSoloGameDebug) {
      return debugError({
        matchId: input.matchId,
        code: 'SOLO_DEBUG_DISABLED',
        message: 'Solo debug mode is disabled',
      });
    }

    if (!input.authenticatedUserId) {
      return debugError({
        matchId: input.matchId,
        code: 'MATCH_NOT_SOLO_DEBUG',
        message: 'Authenticated session is required',
      });
    }

    const match = await options.repository.loadCurrentMatch(input.matchId);
    if (!match) {
      return debugError({
        matchId: input.matchId,
        code: 'MATCH_NOT_FOUND',
        message: 'Match was not found',
      });
    }

    const state = match.snapshot as unknown as GameState;
    const current = snapshot(state, match.lastSequence, {
      startedAt: match.createdAt,
      finishedAt: match.finishedAt,
    });

    if (state.debugMode !== 'SOLO') {
      return debugError({
        matchId: input.matchId,
        code: 'MATCH_NOT_SOLO_DEBUG',
        message: 'Match is not a solo debug match',
        stateVersion: match.stateVersion,
        snapshot: current,
      });
    }

    const dummy = dummyPlayer(state);
    if (!dummy) {
      return debugError({
        matchId: input.matchId,
        code: 'DEBUG_DUMMY_NOT_FOUND',
        message: 'Solo debug dummy participant is missing',
        stateVersion: match.stateVersion,
        snapshot: current,
      });
    }

    const hasRealAccess = state.players.some(
      (player) => player.playerId === input.authenticatedUserId && player.participantKind !== 'DEBUG_DUMMY',
    );
    if (!hasRealAccess) {
      return debugError({
        matchId: input.matchId,
        code: 'MATCH_NOT_SOLO_DEBUG',
        message: 'Only a real participant can control the debug dummy',
        stateVersion: match.stateVersion,
        snapshot: current,
      });
    }

    if (state.currentPlayerId !== dummy.playerId) {
      return debugError({
        matchId: input.matchId,
        code: 'NOT_DEBUG_DUMMY_TURN',
        message: 'It is not the debug dummy turn',
        stateVersion: match.stateVersion,
        snapshot: current,
      });
    }

    if (input.expectedStateVersion !== match.stateVersion) {
      return debugError({
        matchId: input.matchId,
        code: 'STALE_STATE_VERSION',
        message: 'State version is stale',
        stateVersion: match.stateVersion,
        snapshot: current,
      });
    }

    let latestState = state;
    let latestVersion = match.stateVersion;
    let latestResult: GameCommandResult | null = null;

    for (let guard = 0; guard < 8 && latestState.currentPlayerId === dummy.playerId; guard += 1) {
      const command = nextDummyCommand({
        matchId: input.matchId,
        state: latestState,
        dummyPlayerId: dummy.playerId,
        expectedStateVersion: latestVersion,
      });
      if (!command) {
        return debugError({
          matchId: input.matchId,
          code: 'INVALID_ACTION',
          message: 'Debug dummy has no safe action to advance',
          stateVersion: latestVersion,
          snapshot: snapshot(latestState, match.lastSequence, {
            startedAt: match.createdAt,
            finishedAt: match.finishedAt,
          }),
        });
      }
      latestResult = await process({
        authenticatedUserId: dummy.playerId,
        command,
        ...(command.type === 'ROLL_DICE' ? { diceValueOverride: 1 as const } : {}),
      });
      if (!latestResult.ok) return latestResult;
      latestState = latestResult.snapshot as unknown as GameState;
      latestVersion = latestResult.stateVersion;
    }

    if (!latestResult) {
      return debugError({
        matchId: input.matchId,
        code: 'INVALID_ACTION',
        message: 'Debug dummy turn was not advanced',
        stateVersion: latestVersion,
      });
    }

    return latestResult;
  }

  return {
    process,
    skipDebugDummyTurn,
  };
}
