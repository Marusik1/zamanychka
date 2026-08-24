import { z } from 'zod';

export const roomSeatIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

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
    connected: z.boolean(),
  })
  .strict();

export const roomStateSchema = z
  .object({
    roomId: z.string().min(1),
    version: z.number().int().nonnegative(),
    currentMatchId: z.string().min(1).nullable(),
    participants: z.array(roomParticipantStateSchema),
  })
  .strict();

export const takeSeatRequestSchema = z
  .object({
    seatIndex: roomSeatIndexSchema,
  })
  .strict();

export const leaveSeatRequestSchema = z.object({}).strict();

export const setReadyRequestSchema = z
  .object({
    ready: z.boolean(),
  })
  .strict();

export const startMatchRequestSchema = z.object({}).strict();

export const roomReconnectRequestSchema = z.object({}).strict();

export const roomCommandErrorCodeSchema = z.enum([
  'ROOM_NOT_FOUND',
  'ROOM_ALREADY_ACTIVE',
  'ROOM_NOT_READY',
  'ROOM_FULL',
  'SEAT_TAKEN',
  'SEAT_NOT_OWNED',
  'SEATED_PARTICIPANT_DISCONNECTED',
  'STALE_ROOM_VERSION',
  'NOT_ALLOWED',
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

export type RoomSeatIndex = z.infer<typeof roomSeatIndexSchema>;
export type RoomPresenceProjection = z.infer<typeof roomPresenceProjectionSchema>;
export type RoomParticipantState = z.infer<typeof roomParticipantStateSchema>;
export type RoomParticipantView = z.infer<typeof roomParticipantViewSchema>;
export type RoomState = z.infer<typeof roomStateSchema>;
export type TakeSeatRequest = z.infer<typeof takeSeatRequestSchema>;
export type LeaveSeatRequest = z.infer<typeof leaveSeatRequestSchema>;
export type SetReadyRequest = z.infer<typeof setReadyRequestSchema>;
export type StartMatchRequest = z.infer<typeof startMatchRequestSchema>;
export type RoomReconnectRequest = z.infer<typeof roomReconnectRequestSchema>;
export type RoomCommandErrorCode = z.infer<typeof roomCommandErrorCodeSchema>;
export type RoomCommandError = z.infer<typeof roomCommandErrorSchema>;
export type RoomCommandSuccess = z.infer<typeof roomCommandSuccessSchema>;
export type RoomCommandResult = z.infer<typeof roomCommandResultSchema>;
