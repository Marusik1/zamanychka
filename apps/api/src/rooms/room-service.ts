import type {
  ParticipantKind,
  CreateRoomRequest,
  DeleteRoomRequest,
  JoinRoomRequest,
  ListRoomsResponse,
  RoomCommandError,
  RoomCommandSuccess,
  RoomSeatIndex,
  RoomState,
  SetReadyRequest,
  StartMatchRequest,
  StartMatchResult,
  TakeSeatRequest,
} from '@zamanushka/shared';
import { buildBotParticipantId } from '@zamanushka/shared';

import { createActiveGameState } from '@zamanushka/game-engine';
import type { GameState } from '@zamanushka/game-engine';
import type { Prisma } from '../generated/prisma/client.js';
import {
  cloneRoom,
  seatByIndex,
  seatOfUser,
  toRoomState,
  toRoomSummary,
  type LeaveRoomRequest,
  type LeaveSeatRequest,
  type PersistedRoom,
  type RoomId,
} from './domain.js';
import { persistRoom } from './room-repository.js';
import type { createRoomRepository } from './room-repository.js';

type RoomRepository = ReturnType<typeof createRoomRepository>;
type TxClient = Prisma.TransactionClient;

type MutatingRoomResult =
  | RoomCommandSuccess
  | {
      ok: false;
      error: RoomCommandError['error'];
    };

type MutationResult =
  | { kind: 'success'; room: PersistedRoom; presence: 'connect' | 'disconnect' | null }
  | { kind: 'error'; code: RoomCommandError['error']['code'] };

const ERROR_MESSAGES: Record<RoomCommandError['error']['code'], string> = {
  ROOM_NOT_FOUND: 'Room is not available',
  ROOM_ALREADY_ACTIVE: 'Room already has an active match',
  ROOM_NOT_READY: 'Room is not ready',
  ROOM_FULL: 'Room is full',
  ROOM_CLOSED: 'Room is closed',
  SEAT_TAKEN: 'Seat is already taken',
  SEAT_NOT_OWNED: 'Seat is not owned by this participant',
  SEATED_PARTICIPANT_DISCONNECTED: 'Seated participant is disconnected',
  STALE_ROOM_VERSION: 'Room version is stale',
  NOT_ALLOWED: 'Operation is not allowed',
  NOT_ROOM_MEMBER: 'User is not a member of this room',
  USER_ALREADY_IN_ANOTHER_ROOM: 'User already belongs to another room',
};

export const SOLO_DEBUG_DUMMY_PARTICIPANT_KIND = 'DEBUG_DUMMY' as const;
export const SOLO_DEBUG_MATCH_MODE = 'SOLO' as const;

function soloDebugDummyPlayerId(roomId: string): string {
  return `debug-dummy:${roomId}`;
}

export interface RoomPresenceStore {
  connect(input: { roomId: RoomId; userId: string }): Promise<void>;
  disconnect(input: { roomId: RoomId; userId: string }): Promise<void>;
  snapshot(roomId: RoomId): Promise<ReadonlyMap<string, boolean>>;
}

export interface RoomView extends RoomState {
  presence: readonly { userId: string; connected: boolean }[];
}

export interface RoomService {
  listRooms(actorUserId: string): Promise<ListRoomsResponse>;
  createRoom(actorUserId: string, request: CreateRoomRequest): Promise<RoomState>;
  getRoom(actorUserId: string, roomId: string): Promise<RoomView>;
  joinRoom(actorUserId: string, roomId: string, request: JoinRoomRequest): Promise<MutatingRoomResult>;
  takeSeat(actorUserId: string, roomId: string, request: TakeSeatRequest): Promise<MutatingRoomResult>;
  leaveSeat(actorUserId: string, roomId: string, request: LeaveSeatRequest): Promise<MutatingRoomResult>;
  setReady(actorUserId: string, roomId: string, request: SetReadyRequest): Promise<MutatingRoomResult>;
  leaveRoom(actorUserId: string, roomId: string, request: LeaveRoomRequest): Promise<MutatingRoomResult>;
  deleteRoom(actorUserId: string, roomId: string, request: DeleteRoomRequest): Promise<MutatingRoomResult>;
  addBot(actorUserId: string, roomId: string, request: TakeSeatRequest): Promise<MutatingRoomResult>;
  removeBot(actorUserId: string, roomId: string, request: LeaveSeatRequest & { seatIndex: RoomSeatIndex }): Promise<MutatingRoomResult>;
  startMatch(actorUserId: string, roomId: string, request: StartMatchRequest): Promise<StartMatchResult>;
  connectPresence(actorUserId: string, roomId: string): Promise<RoomView>;
  disconnectPresence(actorUserId: string, roomId: string): Promise<RoomView>;
}

export interface StartMatchStore {
  createInitialMatch(input: {
    tx: TxClient;
    roomId: string;
    firstPlayerId: string;
    seatOrder: readonly string[];
    snapshot: Prisma.InputJsonValue;
  }): Promise<{ id: string }>;
}

function roomError(code: RoomCommandError['error']['code']): MutatingRoomResult {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function roomSuccess(room: RoomState): RoomCommandSuccess {
  return { ok: true, room };
}

function startMatchError(code: RoomCommandError['error']['code']): StartMatchResult {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function isRoomHost(room: PersistedRoom, userId: string): boolean {
  return room.members[0]?.userId === userId;
}

function isRoomNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === 'ROOM_NOT_FOUND';
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function createRoomService(options: {
  repository: RoomRepository;
  presenceStore: RoomPresenceStore;
  enableSoloGameDebug?: boolean;
  onMatchStarted?: (matchId: string) => void;
  selectFirstPlayerId?: (
    participants: readonly { userId: string; seatIndex: RoomSeatIndex }[],
  ) => string;
  matchStore?: StartMatchStore;
}): RoomService {
  async function loadView(room: PersistedRoom, actorUserId: string): Promise<RoomView> {
    const memberIds = room.members.map((member) => member.userId);
    const [presence, displayNames] = await Promise.all([
      options.presenceStore.snapshot(room.roomId),
      options.repository.loadParticipantDisplayNames(memberIds),
    ]);

    const roomState = toRoomState({
      room,
      actorUserId,
      presence,
      displayNames,
      ...(options.enableSoloGameDebug === undefined
        ? {}
        : { enableSoloGameDebug: options.enableSoloGameDebug }),
    });

    return {
      ...roomState,
      presence: room.members.map((member) => ({
        userId: member.userId,
        connected: presence.get(member.userId) ?? false,
      })),
    };
  }

  function hasMembership(room: PersistedRoom, userId: string) {
    return room.members.some((member) => member.userId === userId);
  }

  function occupied(seat: { participantId?: string | null; userId?: string | null }) {
    return (seat.participantId ?? seat.userId ?? null) !== null;
  }

  function checkExpectedVersion(
    room: PersistedRoom,
    expectedRoomVersion: number,
  ): MutationResult | null {
    if (room.version !== expectedRoomVersion) {
      return { kind: 'error', code: 'STALE_ROOM_VERSION' };
    }
    return null;
  }

  function selectFirstPlayerId(
    participants: readonly { userId: string; seatIndex: RoomSeatIndex }[],
  ) {
    const selector = options.selectFirstPlayerId ?? ((seated) => seated[0]?.userId ?? '');
    return selector(participants);
  }

  async function loadCurrentRoomResult(
    roomId: string,
    actorUserId: string,
  ): Promise<MutatingRoomResult> {
    const current = await options.repository.loadRoom(roomId);
    if (!current) return roomError('ROOM_NOT_FOUND');
    return roomSuccess(await loadView(current, actorUserId));
  }

  async function mutateRoom(
    actorUserId: string,
    roomId: string,
    mutator: (room: PersistedRoom) => MutationResult,
  ): Promise<MutatingRoomResult> {
    if (!actorUserId) return roomError('NOT_ALLOWED');

    try {
      return await options.repository.withLockedRoom(roomId, async (tx, room) => {
        const next = mutator(cloneRoom(room));
        if (next.kind === 'error') return roomError(next.code);

        const saved = await persistRoom(tx, next.room);

        if (next.presence === 'connect') {
          await options.presenceStore.connect({ roomId: saved.roomId, userId: actorUserId });
        } else if (next.presence === 'disconnect') {
          await options.presenceStore.disconnect({ roomId: saved.roomId, userId: actorUserId });
        }

        return roomSuccess(await loadView(saved, actorUserId));
      });
    } catch (error) {
      if (isRoomNotFoundError(error)) return roomError('ROOM_NOT_FOUND');
      throw error;
    }
  }

  return {
    async listRooms(actorUserId) {
      const [rooms, currentMembershipRoom] = await Promise.all([
        options.repository.listRooms(),
        options.repository.loadCurrentMembershipRoom(actorUserId),
      ]);
      return { rooms: rooms.map(toRoomSummary), currentMembershipRoom };
    },

    async createRoom(actorUserId, _request) {
      if (!actorUserId) throw new Error('NOT_ALLOWED');

      const room = await options.repository.createRoom(actorUserId);
      return toRoomState({
        room,
        actorUserId,
        presence: new Map(),
        displayNames: await options.repository.loadParticipantDisplayNames(
          room.members.map((member) => member.userId),
        ),
      });
    },

    async getRoom(actorUserId, roomId) {
      const room = await options.repository.loadRoom(roomId);
      if (!room || room.status === 'CLOSED') throw new Error('ROOM_NOT_FOUND');
      return loadView(room, actorUserId);
    },

    async joinRoom(actorUserId, roomId, _request) {
      if (!actorUserId) return roomError('NOT_ALLOWED');

      try {
        const result = await options.repository.withLockedRoom(roomId, async (tx, room) => {
          if (hasMembership(room, actorUserId)) {
            return roomSuccess(await loadView(room, actorUserId));
          }

          if (room.status === 'CLOSED') {
            return roomError('ROOM_CLOSED');
          }

          if (room.status !== 'WAITING' || room.currentMatchId !== null) {
            return roomError('ROOM_ALREADY_ACTIVE');
          }

          if (room.members.length >= 4) {
            return roomError('ROOM_FULL');
          }

          const currentMembership = await tx.roomMembership.findUnique({
            where: { userId: actorUserId },
          });

          if (currentMembership && currentMembership.roomKey !== roomId) {
            return roomError('USER_ALREADY_IN_ANOTHER_ROOM');
          }

          await tx.roomMembership.create({
            data: {
              roomKey: roomId,
              userId: actorUserId,
            },
          });

          const saved = await persistRoom(tx, {
            ...room,
            version: room.version + 1,
          });

          return roomSuccess(await loadView(saved, actorUserId));
        });
        return result;
      } catch (error) {
        if (isRoomNotFoundError(error)) return roomError('ROOM_NOT_FOUND');

        if (isUniqueConstraintError(error)) {
          const currentMembership = await options.repository.loadMembershipForUser(actorUserId);

          if (currentMembership?.roomKey === roomId) {
            return loadCurrentRoomResult(roomId, actorUserId);
          }

          return roomError('USER_ALREADY_IN_ANOTHER_ROOM');
        }

        throw error;
      }
    },

    async takeSeat(actorUserId, roomId, request) {
      return mutateRoom(actorUserId, roomId, (room) => {
        if (!hasMembership(room, actorUserId)) {
          return { kind: 'error', code: 'NOT_ROOM_MEMBER' };
        }

        if (room.status === 'CLOSED') {
          return { kind: 'error', code: 'ROOM_CLOSED' };
        }

        if (room.status !== 'WAITING' || room.currentMatchId !== null) {
          return { kind: 'error', code: 'ROOM_ALREADY_ACTIVE' };
        }

        const existingSeat = seatOfUser(room, actorUserId);

        if (existingSeat?.seatIndex === request.seatIndex) {
          return { kind: 'success', room, presence: 'connect' };
        }

        const stale = checkExpectedVersion(room, request.expectedRoomVersion);
        if (stale) return stale;

        if (existingSeat) {
          return { kind: 'error', code: 'SEAT_TAKEN' };
        }

        const targetSeat = seatByIndex(room, request.seatIndex);
        if (!targetSeat || occupied(targetSeat)) {
          return { kind: 'error', code: 'SEAT_TAKEN' };
        }

        targetSeat.userId = actorUserId;
        targetSeat.participantId = actorUserId;
        targetSeat.participantKind = 'HUMAN';
        targetSeat.ready = false;
        room.version += 1;

        return { kind: 'success', room, presence: 'connect' };
      });
    },

    async leaveSeat(actorUserId, roomId, request) {
      return mutateRoom(actorUserId, roomId, (room) => {
        if (!hasMembership(room, actorUserId)) {
          return { kind: 'error', code: 'NOT_ROOM_MEMBER' };
        }

        if (room.status === 'CLOSED') {
          return { kind: 'error', code: 'ROOM_CLOSED' };
        }

        if (room.status !== 'WAITING' || room.currentMatchId !== null) {
          return { kind: 'error', code: 'ROOM_ALREADY_ACTIVE' };
        }

        const stale = checkExpectedVersion(room, request.expectedRoomVersion);
        if (stale) return stale;

        const ownedSeat = seatOfUser(room, actorUserId);
        if (!ownedSeat) {
          return { kind: 'success', room, presence: null };
        }

        ownedSeat.userId = null;
        ownedSeat.participantId = null;
        ownedSeat.participantKind = null;
        ownedSeat.ready = false;
        room.version += 1;

        return { kind: 'success', room, presence: null };
      });
    },

    async setReady(actorUserId, roomId, request) {
      return mutateRoom(actorUserId, roomId, (room) => {
        if (!hasMembership(room, actorUserId)) {
          return { kind: 'error', code: 'NOT_ROOM_MEMBER' };
        }

        if (room.status === 'CLOSED') {
          return { kind: 'error', code: 'ROOM_CLOSED' };
        }

        if (room.status !== 'WAITING' || room.currentMatchId !== null) {
          return { kind: 'error', code: 'ROOM_ALREADY_ACTIVE' };
        }

        const stale = checkExpectedVersion(room, request.expectedRoomVersion);
        if (stale) return stale;

        const ownedSeat = seatOfUser(room, actorUserId);
        if (!ownedSeat) return { kind: 'error', code: 'SEAT_NOT_OWNED' };

        if (ownedSeat.ready === request.ready) {
          return { kind: 'success', room, presence: null };
        }

        ownedSeat.ready = request.ready;
        room.version += 1;

        return { kind: 'success', room, presence: null };
      });
    },

    async leaveRoom(actorUserId, roomId, request) {
      if (!actorUserId) return roomError('NOT_ALLOWED');

      try {
        const result = await options.repository.withLockedRoom(roomId, async (tx, room) => {
          if (!hasMembership(room, actorUserId)) return roomError('NOT_ROOM_MEMBER');

          if (room.status === 'ACTIVE' || room.currentMatchId !== null) {
            return roomError('ROOM_ALREADY_ACTIVE');
          }

          if (room.version !== request.expectedRoomVersion) {
            return roomError('STALE_ROOM_VERSION');
          }

          const next = cloneRoom(room);
          const ownedSeat = seatOfUser(next, actorUserId);

          if (ownedSeat) {
            ownedSeat.userId = null;
            ownedSeat.participantId = null;
            ownedSeat.participantKind = null;
            ownedSeat.ready = false;
          }

          next.version += 1;

          // Important ordering:
          // clear RoomSeat ownership first, then remove RoomMembership.
          // This keeps the RoomSeat -> RoomMembership FK valid throughout the transaction.
          await persistRoom(tx, next);

          await tx.roomMembership.delete({
            where: {
              roomKey_userId: {
                roomKey: roomId,
                userId: actorUserId,
              },
            },
          });

          const saved = await options.repository.loadRoomInTransaction(tx, roomId);
          if (!saved) return roomError('ROOM_NOT_FOUND');

          return roomSuccess(await loadView(saved, actorUserId));
        });

        if (result.ok) {
          await options.presenceStore.disconnect({ roomId, userId: actorUserId });
        }

        return result;
      } catch (error) {
        if (isRoomNotFoundError(error)) return roomError('ROOM_NOT_FOUND');
        throw error;
      }
    },

    async deleteRoom(actorUserId, roomId, request) {
      if (!actorUserId) return roomError('NOT_ALLOWED');
      let disconnectedMemberIds: string[] = [];

      try {
        const result = await options.repository.withLockedRoom(roomId, async (tx, room) => {
          if (!hasMembership(room, actorUserId)) return roomError('NOT_ROOM_MEMBER');
          if (!isRoomHost(room, actorUserId)) return roomError('NOT_ALLOWED');
          if (room.status === 'CLOSED') return roomError('ROOM_CLOSED');
          if (room.status === 'ACTIVE' || room.currentMatchId !== null) {
            return roomError('ROOM_ALREADY_ACTIVE');
          }
          if (room.version !== request.expectedRoomVersion) {
            return roomError('STALE_ROOM_VERSION');
          }

          disconnectedMemberIds = room.members.map((member) => member.userId);
          const next = cloneRoom(room);
          next.status = 'CLOSED';
          next.currentMatchId = null;
          next.version += 1;
          next.seats = next.seats.map((seat) => ({
            ...seat,
            userId: null,
            participantId: null,
            participantKind: null,
            ready: false,
          }));

          await persistRoom(tx, next);
          await tx.roomMembership.deleteMany({ where: { roomKey: roomId } });

          const saved = await options.repository.loadRoomInTransaction(tx, roomId);
          if (!saved) return roomError('ROOM_NOT_FOUND');

          return roomSuccess(await loadView(saved, actorUserId));
        });

        if (result.ok) {
          await Promise.all(
            disconnectedMemberIds.map((userId) =>
              options.presenceStore.disconnect({ roomId, userId }),
            ),
          );
        }

        return result;
      } catch (error) {
        if (isRoomNotFoundError(error)) return roomError('ROOM_NOT_FOUND');
        throw error;
      }
    },

    async addBot(actorUserId, roomId, request) {
      return mutateRoom(actorUserId, roomId, (room) => {
        if (!hasMembership(room, actorUserId)) return { kind: 'error', code: 'NOT_ROOM_MEMBER' };
        if (!isRoomHost(room, actorUserId)) return { kind: 'error', code: 'NOT_ALLOWED' };
        if (room.status === 'CLOSED') return { kind: 'error', code: 'ROOM_CLOSED' };
        if (room.status !== 'WAITING' || room.currentMatchId !== null) {
          return { kind: 'error', code: 'ROOM_ALREADY_ACTIVE' };
        }
        const stale = checkExpectedVersion(room, request.expectedRoomVersion);
        if (stale) return stale;
        const targetSeat = seatByIndex(room, request.seatIndex);
        if (!targetSeat || occupied(targetSeat)) return { kind: 'error', code: 'SEAT_TAKEN' };
        targetSeat.userId = null;
        targetSeat.participantId = buildBotParticipantId(room.roomId, targetSeat.seatIndex);
        targetSeat.participantKind = 'BOT';
        targetSeat.ready = true;
        room.version += 1;
        return { kind: 'success', room, presence: null };
      });
    },

    async removeBot(actorUserId, roomId, request) {
      return mutateRoom(actorUserId, roomId, (room) => {
        if (!hasMembership(room, actorUserId)) return { kind: 'error', code: 'NOT_ROOM_MEMBER' };
        if (!isRoomHost(room, actorUserId)) return { kind: 'error', code: 'NOT_ALLOWED' };
        if (room.status === 'CLOSED') return { kind: 'error', code: 'ROOM_CLOSED' };
        if (room.status !== 'WAITING' || room.currentMatchId !== null) {
          return { kind: 'error', code: 'ROOM_ALREADY_ACTIVE' };
        }
        const stale = checkExpectedVersion(room, request.expectedRoomVersion);
        if (stale) return stale;
        const targetSeat = seatByIndex(room, request.seatIndex);
        if (!targetSeat || targetSeat.participantKind !== 'BOT') {
          return { kind: 'error', code: 'SEAT_NOT_OWNED' };
        }
        targetSeat.userId = null;
        targetSeat.participantId = null;
        targetSeat.participantKind = null;
        targetSeat.ready = false;
        room.version += 1;
        return { kind: 'success', room, presence: null };
      });
    },

    async startMatch(actorUserId, roomId, request) {
      if (!actorUserId) return startMatchError('NOT_ALLOWED');

      try {
        const result = await options.repository.withLockedRoom(roomId, async (tx, room) => {
          if (!hasMembership(room, actorUserId)) {
            return startMatchError('NOT_ROOM_MEMBER');
          }

          if (room.status === 'CLOSED') {
            return startMatchError('ROOM_CLOSED');
          }

          if (room.status !== 'WAITING' || room.currentMatchId !== null) {
            return startMatchError('ROOM_ALREADY_ACTIVE');
          }

          if (room.version !== request.expectedRoomVersion) {
            return startMatchError('STALE_ROOM_VERSION');
          }

          const presence = await options.presenceStore.snapshot(room.roomId);
          const seatedParticipants = room.seats
            .filter(
              (
                seat,
              ): seat is typeof seat & {
                participantId: string;
                participantKind: ParticipantKind;
              } => seat.participantId !== null && seat.participantKind !== null,
            )
            .map((seat) => ({
              participantId: seat.participantId,
              participantKind: seat.participantKind,
              userId: seat.userId,
              seatIndex: seat.seatIndex,
              ready: seat.ready,
              connected:
                seat.participantKind === 'BOT'
                  ? true
                  : seat.userId !== null && (presence.get(seat.userId) ?? false),
            }))
            .sort((left, right) => left.seatIndex - right.seatIndex);

          if (
            !seatedParticipants.some(
              (participant) =>
                participant.participantKind === 'HUMAN' && participant.userId === actorUserId,
            )
          ) {
            return startMatchError('SEAT_NOT_OWNED');
          }

          const soloDebugStart =
            options.enableSoloGameDebug === true &&
            seatedParticipants.length === 1 &&
            seatedParticipants[0]?.userId === actorUserId;
          const soloDebugParticipant = soloDebugStart ? seatedParticipants[0] : null;
          const humanCount = seatedParticipants.filter(
            (participant) => participant.participantKind === 'HUMAN',
          ).length;

          if (seatedParticipants.length < 2 && !soloDebugStart) {
            return startMatchError('ROOM_NOT_READY');
          }

          if (humanCount < 1) {
            return startMatchError('ROOM_NOT_READY');
          }

          if (seatedParticipants.length > 4) {
            return startMatchError('ROOM_FULL');
          }

          if (
            seatedParticipants.some(
              (participant) => participant.participantKind === 'HUMAN' && !participant.ready,
            )
          ) {
            return startMatchError('ROOM_NOT_READY');
          }

          if (seatedParticipants.some((participant) => !participant.connected)) {
            return startMatchError('SEATED_PARTICIPANT_DISCONNECTED');
          }
          if (soloDebugStart && !soloDebugParticipant) {
            return startMatchError('NOT_ALLOWED');
          }

          const dummyPlayerId = soloDebugDummyPlayerId(room.roomId);
          const matchParticipants = (() => {
            if (!soloDebugStart) return seatedParticipants;
            if (!soloDebugParticipant) return null;
            return [
                soloDebugParticipant,
                {
                  userId: dummyPlayerId,
                  participantId: dummyPlayerId,
                  participantKind: 'DEBUG_DUMMY' as const,
                  seatIndex: 1 as RoomSeatIndex,
                  ready: true,
                  connected: true,
                },
              ];
          })();
          if (!matchParticipants) {
            return startMatchError('NOT_ALLOWED');
          }

          const firstPlayerId = soloDebugStart
            ? actorUserId
            : selectFirstPlayerId(
                matchParticipants.map((participant) => ({
                  userId: participant.participantId,
                  seatIndex: participant.seatIndex,
                })),
              );
          if (!matchParticipants.some((participant) => participant.participantId === firstPlayerId)) {
            return startMatchError('NOT_ALLOWED');
          }

          const seatOrder = matchParticipants.map((participant) => participant.participantId);
          const activeState = createActiveGameState({
            playerCount: seatOrder.length as 2 | 3 | 4,
            seatOrder: seatOrder as
              | [string, string]
              | [string, string, string]
              | [string, string, string, string],
            firstPlayerId,
          });
          const initialState: GameState = soloDebugStart
            ? {
                ...activeState,
                debugMode: SOLO_DEBUG_MATCH_MODE,
                players: activeState.players.map((player) => ({
                  ...player,
                  participantKind:
                    player.playerId === dummyPlayerId
                      ? SOLO_DEBUG_DUMMY_PARTICIPANT_KIND
                      : 'HUMAN',
                })),
              }
            : {
                ...activeState,
                players: activeState.players.map((player) => ({
                  ...player,
                  participantKind:
                    matchParticipants.find(
                      (participant) => participant.participantId === player.playerId,
                    )?.participantKind ?? 'HUMAN',
                })),
              };

          const match = options.matchStore
            ? await options.matchStore.createInitialMatch({
                tx,
                roomId: room.roomId,
                firstPlayerId,
                seatOrder,
                snapshot: initialState as Prisma.InputJsonValue,
              })
            : await tx.match.create({
                data: {
                  roomKey: room.roomId,
                  firstPlayerId,
                  seatOrder,
                  snapshot: initialState as Prisma.InputJsonValue,
                },
                select: { id: true },
              });

          const saved = await persistRoom(tx, {
            ...room,
            status: 'ACTIVE',
            version: room.version + 1,
            currentMatchId: match.id,
          });

          return {
            ok: true as const,
            room: await loadView(saved, actorUserId),
            matchId: match.id,
            status: 'ACTIVE' as const,
            stateVersion: initialState.stateVersion,
            lastSequence: 0,
          };
        });
        if (result.ok) options.onMatchStarted?.(result.matchId);
        return result;
      } catch (error) {
        if (isRoomNotFoundError(error)) {
          return startMatchError('ROOM_NOT_FOUND');
        }
        throw error;
      }
    },

    async connectPresence(actorUserId, roomId) {
      const room = await options.repository.loadRoom(roomId);
      if (!room || room.status === 'CLOSED') throw new Error('ROOM_NOT_FOUND');

      await options.presenceStore.connect({ roomId, userId: actorUserId });
      return loadView(room, actorUserId);
    },

    async disconnectPresence(actorUserId, roomId) {
      const room = await options.repository.loadRoom(roomId);
      if (!room || room.status === 'CLOSED') throw new Error('ROOM_NOT_FOUND');

      await options.presenceStore.disconnect({ roomId, userId: actorUserId });
      return loadView(room, actorUserId);
    },
  };
}
