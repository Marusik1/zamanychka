import type { RoomState } from '@zamanushka/shared';

import type { Prisma } from '../generated/prisma/client.js';
import { toRoomState, type PersistedRoom } from './domain.js';
import { lockRoomInTransaction, persistRoom } from './room-repository.js';
import type { createRoomRepository } from './room-repository.js';

type RoomRepository = ReturnType<typeof createRoomRepository>;
type TxClient = Prisma.TransactionClient;

const ERROR_MESSAGES = {
  MATCH_NOT_FOUND: 'Match was not found',
  MATCH_NOT_TERMINAL: 'Match is not terminal',
  MATCH_NOT_CURRENT: 'Match is not the current room match',
} as const;

type MatchCompletionErrorCode = keyof typeof ERROR_MESSAGES;

type MatchCompletionResult =
  | { ok: true; room: RoomState; matchId: string }
  | { ok: false; error: { code: MatchCompletionErrorCode; message: string } };

function completionError(code: MatchCompletionErrorCode): MatchCompletionResult {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function toWaitingRoom(room: PersistedRoom): PersistedRoom {
  return {
    ...room,
    status: 'WAITING',
    version: room.version + 1,
    currentMatchId: null,
    seats: room.seats.map((seat) => ({
      ...seat,
      userId: null,
      ready: false,
    })),
  };
}

export function createMatchCompletionService(options: { repository: RoomRepository }) {
  async function loadMatch(tx: TxClient, matchId: string) {
    return tx.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        roomKey: true,
        status: true,
      },
    });
  }

  async function buildRoomState(room: PersistedRoom): Promise<RoomState> {
    return toRoomState({
      room,
      actorUserId: '',
      presence: new Map(),
      displayNames: await options.repository.loadParticipantDisplayNames(
        room.members.map((member) => member.userId),
      ),
    });
  }

  async function completeLockedTerminalMatch(
    tx: TxClient,
    completedMatchId: string,
  ): Promise<MatchCompletionResult> {
    const match = await loadMatch(tx, completedMatchId);
    if (!match) return completionError('MATCH_NOT_FOUND');
    if (match.status !== 'FINISHED') return completionError('MATCH_NOT_TERMINAL');

    const room = await lockRoomInTransaction(tx, match.roomKey);
    if (room.currentMatchId !== completedMatchId) return completionError('MATCH_NOT_CURRENT');

    const saved = await persistRoom(tx, toWaitingRoom(room));
    return { ok: true, matchId: completedMatchId, room: await buildRoomState(saved) };
  }

  return {
    async completeTerminalMatchInTransaction(
      tx: TxClient,
      completedMatchId: string,
    ): Promise<MatchCompletionResult> {
      return completeLockedTerminalMatch(tx, completedMatchId);
    },

    async completeTerminalMatch(completedMatchId: string): Promise<MatchCompletionResult> {
      const match = await options.repository.loadMatchRoomKey(completedMatchId);
      if (!match) return completionError('MATCH_NOT_FOUND');
      return options.repository.withLockedRoom(match.roomKey, async (tx) =>
        completeLockedTerminalMatch(tx, completedMatchId),
      );
    },
  };
}

export type { MatchCompletionResult };
