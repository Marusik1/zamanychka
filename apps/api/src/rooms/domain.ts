import type {
  LeaveRoomRequest,
  LeaveSeatRequest,
  RoomCommandError,
  RoomCommandResult,
  RoomCommandSuccess,
  RoomCurrentUser,
  RoomMember,
  RoomSeat,
  RoomSeatIndex,
  RoomState,
  RoomSummary,
  SetReadyRequest,
  StartMatchRequest,
  TakeSeatRequest,
} from '@zamanushka/shared';

export type {
  LeaveRoomRequest,
  LeaveSeatRequest,
  RoomCommandError,
  RoomCommandResult,
  RoomCommandSuccess,
  RoomCurrentUser,
  RoomMember,
  RoomSeat,
  RoomSeatIndex,
  RoomState,
  RoomSummary,
  SetReadyRequest,
  StartMatchRequest,
  TakeSeatRequest,
};

export type RoomId = string;
export type ParticipantUserId = string;

export interface RoomSeatRecord {
  seatIndex: RoomSeatIndex;
  userId: ParticipantUserId | null;
  ready: boolean;
}

export interface RoomMemberRecord {
  userId: ParticipantUserId;
  joinedAt: string;
}

export interface PersistedRoom {
  roomId: RoomId;
  code: string;
  status: 'WAITING' | 'ACTIVE' | 'CLOSED';
  version: number;
  currentMatchId: string | null;
  members: readonly RoomMemberRecord[];
  seats: readonly RoomSeatRecord[];
}

export interface RoomWithPresence extends RoomState {
  presence: readonly { userId: string; connected: boolean }[];
}

export interface RoomMapperInput {
  room: PersistedRoom;
  actorUserId: string;
  presence: ReadonlyMap<string, boolean>;
  displayNames: ReadonlyMap<string, string>;
}

function buildCounts(room: PersistedRoom) {
  return {
    memberCount: room.members.length,
    seatedCount: room.seats.filter((seat) => seat.userId !== null).length,
    readyCount: room.seats.filter((seat) => seat.userId !== null && seat.ready).length,
  };
}

function buildMembers(
  room: PersistedRoom,
  displayNames: ReadonlyMap<string, string>,
): RoomMember[] {
  return room.members.map((member) => ({
    userId: member.userId,
    displayName: displayNames.get(member.userId) ?? member.userId,
    joinedAt: member.joinedAt,
  }));
}

function buildCurrentUser(
  room: PersistedRoom,
  actorUserId: string,
  presence: ReadonlyMap<string, boolean>,
): RoomCurrentUser {
  const membership = room.members.find((member) => member.userId === actorUserId) ?? null;
  const ownedSeat = room.seats.find((seat) => seat.userId === actorUserId) ?? null;
  const seatedMembers = room.seats.filter(
    (seat): seat is typeof seat & { userId: string } => seat.userId !== null,
  );

  const enoughPlayers = seatedMembers.length >= 2 && seatedMembers.length <= 4;
  const allReady = enoughPlayers && seatedMembers.every((seat) => seat.ready);
  const allConnected =
    enoughPlayers && seatedMembers.every((seat) => presence.get(seat.userId) ?? false);

  const canStart =
    membership !== null &&
    ownedSeat !== null &&
    room.status === 'WAITING' &&
    room.currentMatchId === null &&
    enoughPlayers &&
    allReady &&
    allConnected;

  let startBlockedReason: string | null = null;

  if (membership === null) {
    startBlockedReason = 'NOT_ROOM_MEMBER';
  } else if (room.status === 'CLOSED') {
    startBlockedReason = 'ROOM_CLOSED';
  } else if (room.status !== 'WAITING' || room.currentMatchId !== null) {
    startBlockedReason = 'ROOM_ALREADY_ACTIVE';
  } else if (ownedSeat === null) {
    startBlockedReason = 'SEAT_NOT_OWNED';
  } else if (!enoughPlayers || !allReady) {
    startBlockedReason = 'ROOM_NOT_READY';
  } else if (!allConnected) {
    startBlockedReason = 'SEATED_PARTICIPANT_DISCONNECTED';
  }

  return {
    isMember: membership !== null,
    seatIndex: ownedSeat?.seatIndex ?? null,
    ready: ownedSeat?.ready ?? false,
    canLeave: membership !== null && room.currentMatchId === null && room.status !== 'ACTIVE',
    canStart,
    startBlockedReason,
  };
}

export function toRoomState({
  room,
  actorUserId,
  presence,
  displayNames,
}: RoomMapperInput): RoomState {
  return {
    id: room.roomId,
    code: room.code,
    status: room.status,
    version: room.version,
    currentMatchId: room.currentMatchId,
    members: buildMembers(room, displayNames),
    seats: room.seats.map((seat) => ({ ...seat })) as RoomSeat[],
    counts: buildCounts(room),
    currentUser: buildCurrentUser(room, actorUserId, presence),
  };
}

export function toRoomSummary(room: PersistedRoom): RoomSummary {
  return {
    id: room.roomId,
    code: room.code,
    status: room.status,
    currentMatchId: room.currentMatchId,
    counts: buildCounts(room),
  };
}

export function cloneRoom(room: PersistedRoom): PersistedRoom {
  return {
    roomId: room.roomId,
    code: room.code,
    status: room.status,
    version: room.version,
    currentMatchId: room.currentMatchId,
    members: room.members.map((member) => ({ ...member })),
    seats: room.seats.map((seat) => ({ ...seat })),
  };
}

export function seatByIndex(room: PersistedRoom, seatIndex: RoomSeatIndex) {
  return room.seats.find((seat) => seat.seatIndex === seatIndex) ?? null;
}

export function seatOfUser(room: PersistedRoom, userId: string) {
  return room.seats.find((seat) => seat.userId === userId) ?? null;
}
