import type { RoomState } from '@zamanushka/shared';

import type { Prisma } from '../generated/prisma/client.js';
import type { PersistedRoom } from './domain.js';
import { lockSingletonRoomInTransaction, persistSingletonRoom } from './room-repository.js';
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
    version: room.version + 1,
    currentMatchId: null,
    seats: room.seats.map((seat) => ({
      ...seat,
      userId: null,
      ready: false,
    })),
  };
}

function toRoomState(room: PersistedRoom): RoomState {
  return {
    roomId: room.roomId,
    version: room.version,
    currentMatchId: room.currentMatchId,
    participants: room.seats
      .filter((seat) => seat.userId !== null)
      .map((seat) => ({
        userId: seat.userId as string,
        seatIndex: seat.seatIndex,
        ready: seat.ready,
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

  async function completeLockedTerminalMatch(tx: TxClient, room: PersistedRoom, completedMatchId: string): Promise<MatchCompletionResult> {
    const match = await loadMatch(tx, completedMatchId);
    if (!match) return completionError('MATCH_NOT_FOUND');
    if (match.status !== 'FINISHED') return completionError('MATCH_NOT_TERMINAL');
    if (room.currentMatchId !== completedMatchId) return completionError('MATCH_NOT_CURRENT');

    const nextRoom = toWaitingRoom(room);
    await persistSingletonRoom(tx, nextRoom);
    return { ok: true, matchId: completedMatchId, room: toRoomState(nextRoom) };
  }

  return {
    async completeTerminalMatchInTransaction(tx: TxClient, completedMatchId: string): Promise<MatchCompletionResult> {
      return completeLockedTerminalMatch(tx, await lockSingletonRoomInTransaction(tx), completedMatchId);
    },

    async completeTerminalMatch(completedMatchId: string): Promise<MatchCompletionResult> {
      return options.repository.withLockedSingletonRoom((tx, room) => completeLockedTerminalMatch(tx, room, completedMatchId));
    },
  };
}

export type { MatchCompletionResult };
