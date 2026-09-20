import type {
  ParticipantKind,
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
  participantId?: string | null;
  participantKind?: ParticipantKind | null;
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
  enableSoloGameDebug?: boolean;
}

function buildCounts(room: PersistedRoom) {
  return {
    memberCount: room.members.length,
    seatedCount: room.seats.filter((seat) => (seat.participantId ?? seat.userId) !== null).length,
    readyCount: room.seats.filter((seat) => (seat.participantId ?? seat.userId) !== null && seat.ready).length,
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
  enableSoloGameDebug = false,
): RoomCurrentUser {
  const membership = room.members.find((member) => member.userId === actorUserId) ?? null;
  const ownedSeat = room.seats.find((seat) => seat.userId === actorUserId) ?? null;
  const seatedParticipants = room.seats.filter(
    (seat): seat is typeof seat & { participantId: string; participantKind: ParticipantKind } =>
      (seat.participantId ?? seat.userId) !== null && (seat.participantKind ?? (seat.userId ? 'HUMAN' : null)) !== null,
  );
  const seatedHumans = seatedParticipants.filter((seat) => seat.participantKind === 'HUMAN');
  const ownsHumanSeat = ownedSeat?.participantKind === 'HUMAN' && ownedSeat.userId === actorUserId;

  const enoughPlayers = seatedParticipants.length >= 2 && seatedParticipants.length <= 4;
  const hasHuman = seatedHumans.length > 0;
  const soloDebugReady =
    enableSoloGameDebug &&
    seatedParticipants.length === 1 &&
    seatedParticipants[0]?.userId === actorUserId &&
    seatedParticipants[0].ready &&
    (presence.get(actorUserId) ?? false);
  const allReady = enoughPlayers && seatedParticipants.every((seat) => seat.ready);
  const allConnected =
    enoughPlayers &&
    seatedParticipants.every((seat) =>
      seat.participantKind === 'BOT' ? true : presence.get(seat.userId ?? '') ?? false,
    );
  const canManageBots =
    membership !== null &&
    room.status === 'WAITING' &&
    room.currentMatchId === null &&
    room.members[0]?.userId === actorUserId;

  const canStart =
    membership !== null &&
    ownsHumanSeat &&
    room.status === 'WAITING' &&
    room.currentMatchId === null &&
    hasHuman &&
    ((enoughPlayers && allReady && allConnected) || soloDebugReady);

  let startBlockedReason: string | null = null;

  if (membership === null) {
    startBlockedReason = 'NOT_ROOM_MEMBER';
  } else if (room.status === 'CLOSED') {
    startBlockedReason = 'ROOM_CLOSED';
  } else if (room.status !== 'WAITING' || room.currentMatchId !== null) {
    startBlockedReason = 'ROOM_ALREADY_ACTIVE';
  } else if (!ownsHumanSeat) {
    startBlockedReason = 'SEAT_NOT_OWNED';
  } else if (!hasHuman || !((enoughPlayers && allReady) || soloDebugReady)) {
    startBlockedReason = 'ROOM_NOT_READY';
  } else if (!(allConnected || soloDebugReady)) {
    startBlockedReason = 'SEATED_PARTICIPANT_DISCONNECTED';
  }

  return {
    isMember: membership !== null,
    seatIndex: ownedSeat?.seatIndex ?? null,
    ready: ownedSeat?.ready ?? false,
    canLeave: membership !== null && room.currentMatchId === null && room.status !== 'ACTIVE',
    canStart,
    canManageBots,
    startBlockedReason,
  };
}

export function toRoomState({
  room,
  actorUserId,
  presence,
  displayNames,
  enableSoloGameDebug,
}: RoomMapperInput): RoomState {
  return {
    id: room.roomId,
    code: room.code,
    status: room.status,
    version: room.version,
    currentMatchId: room.currentMatchId,
    members: buildMembers(room, displayNames),
    seats: room.seats.map((seat) => ({
      ...seat,
      participantId: seat.participantId ?? seat.userId,
      participantKind: seat.participantKind ?? (seat.userId ? 'HUMAN' : null),
    })) as RoomSeat[],
    counts: buildCounts(room),
    currentUser: buildCurrentUser(room, actorUserId, presence, enableSoloGameDebug),
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
