import type {
  RoomCommandError,
  RoomCommandResult,
  RoomCommandSuccess,
  RoomParticipantView,
  RoomPresenceProjection,
  RoomSeatIndex,
  RoomState,
  SetReadyRequest,
  TakeSeatRequest,
} from '@zamanushka/shared';

import type { Prisma } from '../generated/prisma/client.js';
import type { PersistedRoom, RoomId } from './domain.js';
import type { createRoomRepository } from './room-repository.js';

type RoomRepository = ReturnType<typeof createRoomRepository>;
type TxClient = Prisma.TransactionClient;

type RoomView = RoomState & {
  presence: ReadonlyArray<RoomPresenceProjection>;
  participantViews: ReadonlyArray<RoomParticipantView>;
};

const ERROR_MESSAGES: Record<RoomCommandError['error']['code'], string> = {
  ROOM_NOT_FOUND: 'Room is not available',
  ROOM_ALREADY_ACTIVE: 'Room already has an active match',
  ROOM_NOT_READY: 'Room is not ready',
  ROOM_FULL: 'Room is full',
  SEAT_TAKEN: 'Seat is already taken',
  SEAT_NOT_OWNED: 'Seat is not owned by this participant',
  SEATED_PARTICIPANT_DISCONNECTED: 'Seated participant is disconnected',
  STALE_ROOM_VERSION: 'Room version is stale',
  NOT_ALLOWED: 'Operation is not allowed',
};

export interface RoomPresenceStore {
  connect(input: { roomId: RoomId; userId: string }): Promise<void>;
  disconnect(input: { roomId: RoomId; userId: string }): Promise<void>;
  snapshot(roomId: RoomId): Promise<ReadonlyMap<string, boolean>>;
}

export interface RoomService {
  takeSeat(actorUserId: string, request: TakeSeatRequest): Promise<MutatingRoomResult>;
  leaveSeat(actorUserId: string): Promise<MutatingRoomResult>;
  setReady(actorUserId: string, request: SetReadyRequest): Promise<MutatingRoomResult>;
  connectPresence(actorUserId: string): Promise<RoomView>;
  disconnectPresence(actorUserId: string): Promise<RoomView>;
  viewRoom(): Promise<RoomView>;
}

function roomError(code: RoomCommandError['error']['code']): MutatingRoomResult {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function roomSuccess(room: RoomState): RoomCommandSuccess {
  return { ok: true, room };
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

function toRoomView(room: PersistedRoom, presence: ReadonlyMap<string, boolean>): RoomView {
  const roomState = toRoomState(room);
  const presenceEntries = new Map<string, boolean>(presence);
  const participantViews = roomState.participants.map((participant) => ({
    ...participant,
    connected: presenceEntries.get(participant.userId) ?? false,
  }));

  return {
    ...roomState,
    presence: participantViews.map((participant) => ({
      userId: participant.userId,
      connected: participant.connected,
    })),
    participantViews,
  };
}

function cloneRoom(room: PersistedRoom): PersistedRoom {
  return {
    roomId: room.roomId,
    version: room.version,
    currentMatchId: room.currentMatchId,
    seats: room.seats.map((seat) => ({ ...seat })),
  };
}

function seatByIndex(room: PersistedRoom, seatIndex: RoomSeatIndex) {
  return room.seats.find((seat) => seat.seatIndex === seatIndex) ?? null;
}

function seatOfUser(room: PersistedRoom, userId: string) {
  return room.seats.find((seat) => seat.userId === userId) ?? null;
}

async function persistRoom(tx: TxClient, room: PersistedRoom) {
  await tx.room.update({
    where: { key: room.roomId },
    data: {
      version: room.version,
      currentMatchId: room.currentMatchId,
    },
  });

  for (const seat of room.seats) {
    await tx.roomSeat.upsert({
      where: {
        roomKey_seatIndex: {
          roomKey: room.roomId,
          seatIndex: seat.seatIndex,
        },
      },
      create: {
        roomKey: room.roomId,
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        ready: seat.ready,
      },
      update: {
        userId: seat.userId,
        ready: seat.ready,
      },
    });
  }
}

type MutatingRoomResult =
  | RoomCommandSuccess
  | {
      ok: false;
      error: RoomCommandError['error'];
    };

type RoomMutation =
  | { kind: 'success'; room: PersistedRoom; presence: 'connect' | 'disconnect' | null }
  | { kind: 'error'; code: RoomCommandError['error']['code'] };

export function createRoomService(options: {
  repository: RoomRepository;
  presenceStore: RoomPresenceStore;
}): RoomService {
  async function loadView(room?: PersistedRoom): Promise<RoomView> {
    const current = room ?? (await options.repository.bootstrapSingletonRoom());
    const presence = await options.presenceStore.snapshot(current.roomId);
    return toRoomView(current, presence);
  }

  async function mutateRoom(
    actorUserId: string,
    mutator: (room: PersistedRoom) => RoomMutation,
  ): Promise<MutatingRoomResult> {
    if (!actorUserId) return roomError('NOT_ALLOWED');
    return options.repository.withLockedSingletonRoom(async (tx, room) => {
      if (room.currentMatchId) return roomError('ROOM_ALREADY_ACTIVE');

      const next = mutator(cloneRoom(room));
      if (next.kind === 'error') return roomError(next.code);

      await persistRoom(tx, next.room);
      if (next.presence === 'connect') {
        await options.presenceStore.connect({ roomId: room.roomId, userId: actorUserId });
      } else if (next.presence === 'disconnect') {
        await options.presenceStore.disconnect({ roomId: room.roomId, userId: actorUserId });
      }

      return roomSuccess(toRoomState(next.room));
    });
  }

  return {
    async takeSeat(actorUserId, request) {
      return mutateRoom(actorUserId, (room) => {
        const existingSeat = seatOfUser(room, actorUserId);
        if (existingSeat) return { kind: 'error', code: 'SEAT_TAKEN' };

        const targetSeat = seatByIndex(room, request.seatIndex);
        if (!targetSeat || targetSeat.userId) return { kind: 'error', code: 'SEAT_TAKEN' };

        room.version += 1;
        targetSeat.userId = actorUserId;
        targetSeat.ready = false;
        return { kind: 'success', room, presence: 'connect' };
      });
    },

    async leaveSeat(actorUserId) {
      return mutateRoom(actorUserId, (room) => {
        const ownedSeat = seatOfUser(room, actorUserId);
        if (!ownedSeat) return { kind: 'error', code: 'SEAT_NOT_OWNED' };

        room.version += 1;
        ownedSeat.userId = null;
        ownedSeat.ready = false;
        return { kind: 'success', room, presence: 'disconnect' };
      });
    },

    async setReady(actorUserId, request) {
      return mutateRoom(actorUserId, (room) => {
        const ownedSeat = seatOfUser(room, actorUserId);
        if (!ownedSeat) return { kind: 'error', code: 'SEAT_NOT_OWNED' };
        if (ownedSeat.ready === request.ready) return { kind: 'success', room, presence: null };

        room.version += 1;
        ownedSeat.ready = request.ready;
        return { kind: 'success', room, presence: null };
      });
    },

    async connectPresence(actorUserId) {
      const room = await options.repository.bootstrapSingletonRoom();
      await options.presenceStore.connect({ roomId: room.roomId, userId: actorUserId });
      return loadView(room);
    },

    async disconnectPresence(actorUserId) {
      const room = await options.repository.bootstrapSingletonRoom();
      await options.presenceStore.disconnect({ roomId: room.roomId, userId: actorUserId });
      return loadView(room);
    },

    async viewRoom() {
      return loadView();
    },
  };
}
