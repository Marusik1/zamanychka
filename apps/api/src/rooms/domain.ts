import type {
  LeaveSeatRequest,
  RoomCommandError,
  RoomCommandResult,
  RoomCommandSuccess,
  RoomParticipantState,
  RoomParticipantView,
  RoomPresenceProjection,
  RoomReconnectRequest,
  RoomSeatIndex,
  RoomState,
  SetReadyRequest,
  StartMatchRequest,
  TakeSeatRequest,
} from '@zamanushka/shared';

export type {
  LeaveSeatRequest,
  RoomCommandError,
  RoomCommandResult,
  RoomCommandSuccess,
  RoomParticipantState,
  RoomParticipantView,
  RoomPresenceProjection,
  RoomReconnectRequest,
  RoomSeatIndex,
  RoomState,
  SetReadyRequest,
  StartMatchRequest,
  TakeSeatRequest,
};

export type RoomId = string;
export type ParticipantUserId = string;

export type RoomLifecycleState = 'WAITING_FOR_PLAYERS' | 'WAITING_FOR_START' | 'ACTIVE_MATCH';

export type RoomWithPresence = RoomState & {
  presence: ReadonlyArray<RoomPresenceProjection>;
};
