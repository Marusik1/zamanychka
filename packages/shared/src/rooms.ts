import { z } from 'zod';

export const roomSeatIndexSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const roomStatusSchema = z.enum(['WAITING', 'ACTIVE', 'CLOSED']);

export const roomMemberSchema = z
  .object({
    userId: z.string().min(1),
    displayName: z.string().min(1),
    joinedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const roomSeatSchema = z
  .object({
    seatIndex: roomSeatIndexSchema,
    userId: z.string().min(1).nullable(),
    ready: z.boolean(),
  })
  .strict();

export const roomPresenceProjectionSchema = z
  .object({
    userId: z.string().min(1),
    connected: z.boolean(),
  })
  .strict();

export const roomParticipantStateSchema = z
  .object({
    userId: z.string().min(1),
    seatIndex: roomSeatIndexSchema,
    ready: z.boolean(),
  })
  .strict();

export const roomParticipantViewSchema = roomParticipantStateSchema
  .extend({
    displayName: z.string().trim().min(1).max(200),
    connected: z.boolean(),
  })
  .strict();

export const roomCountsSchema = z
  .object({
    memberCount: z.number().int().min(0),
    seatedCount: z.number().int().min(0).max(4),
    readyCount: z.number().int().min(0).max(4),
  })
  .strict();

export const roomCurrentUserSchema = z
  .object({
    isMember: z.boolean(),
    seatIndex: roomSeatIndexSchema.nullable(),
    ready: z.boolean(),
    canLeave: z.boolean(),
    canStart: z.boolean(),
    startBlockedReason: z.string().min(1).nullable(),
  })
  .strict();

export const roomSummarySchema = z
  .object({
    id: z.string().min(1),
    code: z.string().min(1),
    status: roomStatusSchema,
    currentMatchId: z.string().min(1).nullable(),
    counts: roomCountsSchema,
  })
  .strict();

export const currentMembershipRoomSchema = z
  .object({
    roomId: z.string().min(1),
    code: z.string().min(1),
    status: roomStatusSchema,
    version: z.number().int().nonnegative(),
    currentMatchId: z.string().min(1).nullable(),
  })
  .strict();

export const roomStateSchema = z
  .object({
    id: z.string().min(1),
    code: z.string().min(1),
    status: roomStatusSchema,
    version: z.number().int().nonnegative(),
    currentMatchId: z.string().min(1).nullable(),
    members: z.array(roomMemberSchema),
    seats: z.array(roomSeatSchema).length(4),
    counts: roomCountsSchema,
    currentUser: roomCurrentUserSchema,
  })
  .strict();

export const listRoomsResponseSchema = z
  .object({
    rooms: z.array(roomSummarySchema),
    currentMembershipRoom: currentMembershipRoomSchema.nullable().default(null),
  })
  .strict();

export const createRoomRequestSchema = z.object({}).strict();
export const joinRoomRequestSchema = z.object({}).strict();

export const takeSeatRequestSchema = z
  .object({
    seatIndex: roomSeatIndexSchema,
    expectedRoomVersion: z.number().int().nonnegative(),
  })
  .strict();

export const leaveSeatRequestSchema = z
  .object({
    expectedRoomVersion: z.number().int().nonnegative(),
  })
  .strict();

export const leaveRoomRequestSchema = z
  .object({
    expectedRoomVersion: z.number().int().nonnegative(),
  })
  .strict();

export const setReadyRequestSchema = z
  .object({
    ready: z.boolean(),
    expectedRoomVersion: z.number().int().nonnegative(),
  })
  .strict();

export const startMatchRequestSchema = z
  .object({
    expectedRoomVersion: z.number().int().nonnegative(),
  })
  .strict();

export const roomReconnectRequestSchema = z.object({}).strict();

export const roomCommandErrorCodeSchema = z.enum([
  'ROOM_NOT_FOUND',
  'ROOM_ALREADY_ACTIVE',
  'ROOM_NOT_READY',
  'ROOM_FULL',
  'ROOM_CLOSED',
  'SEAT_TAKEN',
  'SEAT_NOT_OWNED',
  'SEATED_PARTICIPANT_DISCONNECTED',
  'STALE_ROOM_VERSION',
  'NOT_ALLOWED',
  'NOT_ROOM_MEMBER',
  'USER_ALREADY_IN_ANOTHER_ROOM',
]);

export const roomCommandErrorSchema = z
  .object({
    error: z
      .object({
        code: roomCommandErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const roomCommandSuccessSchema = z
  .object({
    ok: z.literal(true),
    room: roomStateSchema,
  })
  .strict();

export const roomCommandResultSchema = z.discriminatedUnion('ok', [
  roomCommandSuccessSchema,
  z
    .object({
      ok: z.literal(false),
      error: roomCommandErrorSchema.shape.error,
    })
    .strict(),
]);

export const roomViewResponseSchema = roomStateSchema;

export const startMatchSuccessSchema = z
  .object({
    ok: z.literal(true),
    room: roomStateSchema,
    matchId: z.string().min(1),
    status: z.enum(['ACTIVE']),
    stateVersion: z.number().int().nonnegative(),
    lastSequence: z.number().int().nonnegative(),
  })
  .strict();

export const startMatchResultSchema = z.discriminatedUnion('ok', [
  startMatchSuccessSchema,
  z
    .object({
      ok: z.literal(false),
      error: roomCommandErrorSchema.shape.error,
    })
    .strict(),
]);

export type RoomSeatIndex = z.infer<typeof roomSeatIndexSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type RoomMember = z.infer<typeof roomMemberSchema>;
export type RoomSeat = z.infer<typeof roomSeatSchema>;
export type RoomPresenceProjection = z.infer<typeof roomPresenceProjectionSchema>;
export type RoomParticipantState = z.infer<typeof roomParticipantStateSchema>;
export type RoomParticipantView = z.infer<typeof roomParticipantViewSchema>;
export type RoomCounts = z.infer<typeof roomCountsSchema>;
export type RoomCurrentUser = z.infer<typeof roomCurrentUserSchema>;
export type RoomSummary = z.infer<typeof roomSummarySchema>;
export type RoomState = z.infer<typeof roomStateSchema>;
export type ListRoomsResponse = z.infer<typeof listRoomsResponseSchema>;
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;
export type TakeSeatRequest = z.infer<typeof takeSeatRequestSchema>;
export type LeaveSeatRequest = z.infer<typeof leaveSeatRequestSchema>;
export type LeaveRoomRequest = z.infer<typeof leaveRoomRequestSchema>;
export type SetReadyRequest = z.infer<typeof setReadyRequestSchema>;
export type StartMatchRequest = z.infer<typeof startMatchRequestSchema>;
export type RoomReconnectRequest = z.infer<typeof roomReconnectRequestSchema>;
export type RoomCommandErrorCode = z.infer<typeof roomCommandErrorCodeSchema>;
export type RoomCommandError = z.infer<typeof roomCommandErrorSchema>;
export type RoomCommandSuccess = z.infer<typeof roomCommandSuccessSchema>;
export type RoomCommandResult = z.infer<typeof roomCommandResultSchema>;
export type StartMatchSuccess = z.infer<typeof startMatchSuccessSchema>;
export type StartMatchResult = z.infer<typeof startMatchResultSchema>;
