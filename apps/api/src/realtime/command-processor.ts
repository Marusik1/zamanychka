import { resolvePawnCoordinate, resolvePhysicalPath, transition as defaultTransition } from '@zamanushka/game-engine';
import type { GameCommand as EngineCommand, GameEvent, GameState, GameTransitionResult } from '@zamanushka/game-engine';
import type { GameCommandErrorCode, GameCommandRequest, GameCommandResult, GameEventEnvelope, MatchSnapshot } from '@zamanushka/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { MatchRepository } from '../match/match-repository.js';

type Json = Prisma.InputJsonValue;
type Transition = (state: GameState, command: EngineCommand, context: { actorPlayerId: string; diceValue?: 1 | 2 | 3 | 4 | 5 | 6 }) => GameTransitionResult;

export interface TerminalMatchHook {
  (input: { tx: Prisma.TransactionClient; matchId: string }): Promise<void> | void;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

export function commandFingerprint(input: { authenticatedUserId: string; command: GameCommandRequest }): string {
  return JSON.stringify(canonicalize({ actorUserId: input.authenticatedUserId, command: input.command }));
}

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function failure(command: GameCommandRequest, code: GameCommandErrorCode, message: string, stateVersion: number, snapshot?: MatchSnapshot): GameCommandResult {
  return { ok: false, matchId: command.matchId, actionId: command.actionId, code, message, stateVersion, ...(snapshot ? { snapshot } : {}) };
}

function mapEngineFailure(code: Extract<GameTransitionResult, { ok: false }>['code']): GameCommandErrorCode {
  switch (code) {
    case 'MATCH_NOT_ACTIVE': return 'MATCH_FINISHED';
    case 'PLAYER_NOT_IN_MATCH': return 'MATCH_ACCESS_DENIED';
    case 'PLAYER_NOT_ACTIVE':
    case 'NOT_CURRENT_PLAYER': return 'NOT_YOUR_TURN';
    case 'STALE_STATE_VERSION': return 'STALE_STATE_VERSION';
    case 'ILLEGAL_MOVE': return 'PAWN_NOT_MOVABLE';
    default: return 'INVALID_ACTION';
  }
}

function pawnCoordinate(state: GameState, pawnId: string) {
  const pawn = state.pawns.find((candidate) => candidate.pawnId === pawnId);
  const player = pawn && state.players.find((candidate) => candidate.playerId === pawn.playerId);
  if (!pawn || !player) throw new Error(`cannot resolve coordinate for pawn ${pawnId}`);
  const coordinate = resolvePawnCoordinate(pawn.position, player);
  if (!coordinate) throw new Error(`pawn ${pawnId} is not on the board`);
  return coordinate;
}

function eventPayload(event: GameEvent, actorPlayerId: string, before: GameState, after: GameState): Record<string, unknown> {
  switch (event.type) {
    case 'diceRolled': return { playerId: actorPlayerId, diceValue: event.diceValue };
    case 'extraRollGranted': return { playerId: event.playerId };
    case 'turnChanged': return { fromPlayerId: event.fromPlayerId, toPlayerId: event.toPlayerId };
    case 'pawnEntered': return { pawnId: event.pawnId, playerId: event.playerId, toCoord: pawnCoordinate(after, event.pawnId) };
    case 'pawnMoved': return {
      pawnId: event.pawnId,
      playerId: event.playerId,
      fromCoord: pawnCoordinate(before, event.pawnId),
      toCoord: pawnCoordinate(after, event.pawnId),
      physicalPath: resolvePhysicalPath(before, event.pawnId, before.diceValue ?? 0) ?? [],
      capture: null,
    };
    case 'pawnEnteredHome': return { pawnId: event.pawnId, playerId: event.playerId, homeIndex: event.homeIndex, fromCoord: pawnCoordinate(before, event.pawnId), toCoord: pawnCoordinate(after, event.pawnId) };
    case 'pawnCaptured': return { byPawnId: event.pawnId, byPlayerId: event.playerId, capturedPawnId: event.capturedPawnId, capturedPlayerId: event.capturedPlayerId, atCoord: pawnCoordinate(after, event.pawnId) };
    case 'pawnRemoved': return { pawnId: event.pawnId, playerId: event.playerId, reason: 'SURRENDERED' };
    case 'playerSurrendered': return { playerId: event.playerId };
    case 'gameWon': return { winnerPlayerId: event.winnerPlayerId, reason: event.reason };
  }
}

function toEventEnvelopes(input: { matchId: string; stateVersion: number; firstSequence: number; events: readonly GameEvent[]; actorPlayerId: string; before: GameState; after: GameState }): GameEventEnvelope[] {
  return input.events.map((event, index) => ({
    matchId: input.matchId,
    eventId: `${input.matchId}:${input.firstSequence + index}`,
    sequence: input.firstSequence + index,
    stateVersion: input.stateVersion,
    type: event.type,
    payload: eventPayload(event, input.actorPlayerId, input.before, input.after),
    createdAt: new Date().toISOString(),
  })) as GameEventEnvelope[];
}

function snapshot(state: GameState, lastSequence: number): MatchSnapshot {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    pawns: state.pawns.map((pawn) => ({ ...pawn, position: { ...pawn.position } })),
    lastSequence,
  };
}

export function createCommandProcessor(options: {
  repository: MatchRepository;
  onTerminalMatch: TerminalMatchHook;
  rollDice?: () => 1 | 2 | 3 | 4 | 5 | 6;
  transition?: Transition;
}) {
  const rollDice = options.rollDice ?? (() => (Math.floor(Math.random() * 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6);
  const transition = options.transition ?? defaultTransition;

  return {
    async process(input: { authenticatedUserId: string | null | undefined; command: GameCommandRequest }): Promise<GameCommandResult> {
      const { command } = input;
      if (!input.authenticatedUserId) return failure(command, 'UNAUTHORIZED', 'Authenticated session is required', 0);
      const authenticatedUserId = input.authenticatedUserId;
      const fingerprint = commandFingerprint({ authenticatedUserId, command });
      const result = await options.repository.withLockedMatch(command.matchId, async (tx, match) => {
        if (!match) return failure(command, 'MATCH_NOT_FOUND', 'Match was not found', 0);
        const prior = await options.repository.findProcessedAction(tx, { matchId: command.matchId, actionId: command.actionId });
        if (prior) {
          if (prior.requestFingerprint !== fingerprint) return failure(command, 'ACTION_ID_CONFLICT', 'Action ID was already used for a different command', match.stateVersion);
          return prior.result as unknown as GameCommandResult;
        }
        const currentSnapshot = match.snapshot as unknown as GameState;
        const current = snapshot(currentSnapshot, match.lastSequence);
        if (match.status !== 'ACTIVE') return failure(command, 'MATCH_FINISHED', 'Match is already finished', match.stateVersion, current);
        if (command.expectedStateVersion !== match.stateVersion) return failure(command, 'STALE_STATE_VERSION', 'State version is stale', match.stateVersion, current);
        if (!currentSnapshot.players.some((player) => player.playerId === authenticatedUserId)) return failure(command, 'MATCH_ACCESS_DENIED', 'Authenticated user is not a match player', match.stateVersion, current);

        const engineCommand = { ...command, actorPlayerId: authenticatedUserId } as EngineCommand;
        const engineResult = transition(currentSnapshot, engineCommand, {
          actorPlayerId: authenticatedUserId,
          ...(command.type === 'ROLL_DICE' ? { diceValue: rollDice() } : {}),
        });
        if (!engineResult.ok) return failure(command, mapEngineFailure(engineResult.code), engineResult.message, match.stateVersion, current);

        const firstSequence = match.lastSequence + 1;
        const lastSequence = firstSequence + engineResult.events.length - 1;
        const events = toEventEnvelopes({ matchId: command.matchId, stateVersion: engineResult.state.stateVersion, firstSequence, events: engineResult.events, actorPlayerId: authenticatedUserId, before: currentSnapshot, after: engineResult.state });
        const nextSnapshot = snapshot(engineResult.state, lastSequence);
        const result: GameCommandResult = {
          ok: true, matchId: command.matchId, actionId: command.actionId,
          stateVersion: engineResult.state.stateVersion, lastSequence, snapshot: nextSnapshot, events,
          ack: { actionId: command.actionId, stateVersion: engineResult.state.stateVersion, lastSequence },
        };
        await options.repository.updateCurrentSnapshot(tx, { matchId: command.matchId, snapshot: json(engineResult.state), stateVersion: engineResult.state.stateVersion, ...(engineResult.state.status === 'FINISHED' ? { terminalResult: json({ winnerPlayerId: engineResult.state.winnerPlayerId, reason: engineResult.state.winReason }) } : {}) });
        await options.repository.appendOrderedEvents(tx, { matchId: command.matchId, events: events.map(({ sequence, stateVersion, ...event }) => ({ sequence, stateVersion, payload: json(event) })) });
        await options.repository.recordProcessedAction(tx, { matchId: command.matchId, actionId: command.actionId, requestFingerprint: fingerprint, result: json(result) });
        await options.repository.insertOutboxRow(tx, {
          matchId: command.matchId,
          resultingStateVersion: engineResult.state.stateVersion,
          payload: json({ matchId: command.matchId, stateVersion: engineResult.state.stateVersion, lastSequence, events }),
        });
        if (engineResult.state.status === 'FINISHED') {
          await options.onTerminalMatch({ tx, matchId: command.matchId });
        }
        return result;
      });
      return result;
    },
  };
}
