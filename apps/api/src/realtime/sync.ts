import type { Prisma } from '../generated/prisma/client.js';
import type { MatchRepository } from '../match/match-repository.js';
import {
  gameSyncRequestSchema,
  gameSyncResponseSchema,
  transitionEnvelopeSchema,
  type GameSyncRequest,
  type GameSyncResponse,
  type TransitionEnvelope,
} from '@zamanushka/shared';
type ClientWatermark = { matchId: string; stateVersion: number; lastSequence: number; syncInProgress: boolean };

function roomlessTransitionEnvelope(input: {
  matchId: string;
  transitionId: string;
  stateVersion: number;
  fromSequence: number;
  toSequence: number;
  events: unknown[];
  snapshot: Prisma.InputJsonObject;
}): TransitionEnvelope {
  return transitionEnvelopeSchema.parse({
    matchId: input.matchId,
    transitionId: input.transitionId,
    stateVersion: input.stateVersion,
    fromSequence: input.fromSequence,
    toSequence: input.toSequence,
    events: input.events,
    watermark: { stateVersion: input.stateVersion, lastSequence: input.toSequence },
    snapshot: { ...input.snapshot, lastSequence: input.toSequence },
  });
}

export function createGameSyncService(options: {
  repository: MatchRepository;
  prisma: {
    outboxRow: {
      findMany(args: { where: { matchId: string; resultingStateVersion?: { gt?: number; lte?: number } }; orderBy: { resultingStateVersion: 'asc' } }): Promise<Array<{ payload: unknown; resultingStateVersion: number }>>;
    };
  };
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  const clients = new Map<string, ClientWatermark>();

  async function sync(input: GameSyncRequest): Promise<GameSyncResponse> {
    const request = gameSyncRequestSchema.parse(input);
    const match = await options.repository.loadCurrentMatch(request.matchId);
    if (!match) {
      return gameSyncResponseSchema.parse({
        mode: 'snapshot',
        snapshot: { status: 'ABANDONED', stateVersion: 0, turnNumber: 1, turnPhase: null, currentPlayerId: null, diceValue: null, winnerPlayerId: null, winReason: null, players: [], pawns: [], lastSequence: 0 },
        watermark: { stateVersion: 0, lastSequence: 0 },
      });
    }

    const rows = await options.prisma.outboxRow.findMany({
      where: { matchId: request.matchId, resultingStateVersion: { gt: request.stateVersion, lte: match.stateVersion } },
      orderBy: { resultingStateVersion: 'asc' },
    });
    const snapshotState = match.snapshot as Prisma.InputJsonObject;
    const transitions = rows.map((row, index) => {
      const payload = row.payload as any;
      return roomlessTransitionEnvelope({
        matchId: request.matchId,
        transitionId: payload.transitionId ?? `${request.matchId}:${index + 1}`,
        stateVersion: payload.stateVersion ?? row.resultingStateVersion,
        fromSequence: payload.fromSequence ?? request.lastSequence + index + 1,
        toSequence: payload.toSequence ?? request.lastSequence + index + 1,
        events: payload.events ?? [],
        snapshot: snapshotState,
      });
    });

    const expectedFirstSequence = request.lastSequence + 1;
    const continuous = transitions.length > 0
      && transitions[0]!.fromSequence === expectedFirstSequence
      && transitions.every((transition, index) => transition.fromSequence === expectedFirstSequence + transitions.slice(0, index).reduce((count, prior) => count + (prior.toSequence - prior.fromSequence + 1), 0));
    if (continuous) {
      const last = transitions.at(-1)!;
      return gameSyncResponseSchema.parse({ mode: 'events', transitions, watermark: { stateVersion: last.stateVersion, lastSequence: last.toSequence } });
    }

    return gameSyncResponseSchema.parse({
      mode: 'snapshot',
      snapshot: snapshotState,
      watermark: { stateVersion: match.stateVersion, lastSequence: match.lastSequence },
    });
  }

  function createClientState(input: { matchId: string; stateVersion: number; lastSequence: number }) {
    const state = { ...input, syncInProgress: false, pendingBroadcasts: [] as Array<{ matchId: string; stateVersion: number; lastSequence: number }> };
    return {
      beginSync() { state.syncInProgress = true; },
      receiveBroadcast(event: { matchId: string; stateVersion: number; lastSequence: number }) {
        if (event.matchId !== state.matchId) return;
        if (state.pendingBroadcasts.some((candidate) => candidate.lastSequence === event.lastSequence && candidate.stateVersion === event.stateVersion)) return;
        state.pendingBroadcasts.push(event);
        if (!state.syncInProgress) {
          state.stateVersion = event.stateVersion;
          state.lastSequence = event.lastSequence;
        }
      },
      get pendingBroadcasts() { return state.pendingBroadcasts; },
      get needsSync() { return state.syncInProgress || state.pendingBroadcasts.some((event) => event.lastSequence > state.lastSequence + 1); },
    };
  }

  return { sync, createClientState, now };
}
