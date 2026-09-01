import { resolvePawnCoordinate, resolvePhysicalPath } from '@zamanushka/game-engine';
import type { GameEvent, GameState } from '@zamanushka/game-engine';
import type { GameEventEnvelope } from '@zamanushka/shared';

function pawnCoordinate(state: GameState, pawnId: string) {
  const pawn = state.pawns.find((candidate) => candidate.pawnId === pawnId);
  const player = pawn && state.players.find((candidate) => candidate.playerId === pawn.playerId);
  if (!pawn || !player) throw new Error(`cannot resolve coordinate for pawn ${pawnId}`);
  const coordinate = resolvePawnCoordinate(pawn.position, player);
  if (!coordinate) throw new Error(`pawn ${pawnId} is not on the board`);
  return coordinate;
}

function payload(
  event: GameEvent,
  actorPlayerId: string,
  before: GameState,
  after: GameState,
): Record<string, unknown> {
  switch (event.type) {
    case 'diceRolled':
      return { playerId: actorPlayerId, diceValue: event.diceValue };
    case 'extraRollGranted':
      return { playerId: event.playerId, reason: event.reason };
    case 'turnChanged':
      return { fromPlayerId: event.fromPlayerId, toPlayerId: event.toPlayerId };
    case 'pawnEntered':
      return {
        pawnId: event.pawnId,
        playerId: event.playerId,
        toCoord: pawnCoordinate(after, event.pawnId),
      };
    case 'pawnMoved': {
      const physicalPath = resolvePhysicalPath(before, event.pawnId, before.diceValue ?? 0) ?? [];
      const toCoord = physicalPath.at(-1) ?? pawnCoordinate(after, event.pawnId);
      return {
        pawnId: event.pawnId,
        playerId: event.playerId,
        fromCoord: pawnCoordinate(before, event.pawnId),
        toCoord,
        physicalPath,
        capture: null,
      };
    }
    case 'pawnEnteredHome':
      return {
        pawnId: event.pawnId,
        playerId: event.playerId,
        homeIndex: event.homeIndex,
        fromCoord: pawnCoordinate(before, event.pawnId),
        toCoord: pawnCoordinate(after, event.pawnId),
      };
    case 'pawnCaptured': {
      const physicalPath = resolvePhysicalPath(before, event.pawnId, before.diceValue ?? 0) ?? [];
      return {
        byPawnId: event.pawnId,
        byPlayerId: event.playerId,
        capturedPawnId: event.capturedPawnId,
        capturedPlayerId: event.capturedPlayerId,
        atCoord: physicalPath.at(-1) ?? pawnCoordinate(after, event.pawnId),
      };
    }
    case 'pawnRemoved':
      return {
        pawnId: event.pawnId,
        playerId: event.playerId,
        reason: event.reason ?? 'SURRENDERED',
      };
    case 'playerSurrendered':
      return { playerId: event.playerId };
    case 'gameWon':
      return { winnerPlayerId: event.winnerPlayerId, reason: event.reason };
  }
}

export function createEventJournal(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());

  return {
    envelopes(input: {
      matchId: string;
      stateVersion: number;
      lastSequence: number;
      events: readonly GameEvent[];
      actorPlayerId: string;
      before: GameState;
      after: GameState;
    }): GameEventEnvelope[] {
      const createdAt = now().toISOString();
      return input.events.map((event, index) => {
        const sequence = input.lastSequence + index + 1;
        return {
          matchId: input.matchId,
          eventId: `${input.matchId}:${sequence}`,
          sequence,
          stateVersion: input.stateVersion,
          type: event.type,
          payload: payload(event, input.actorPlayerId, input.before, input.after),
          createdAt,
        };
      }) as GameEventEnvelope[];
    },
  };
}
