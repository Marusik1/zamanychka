import { z } from 'zod';
import { roomStatusSchema } from './rooms.js';

const inviteToken = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const createRoomInviteRequestSchema = z.object({}).strict();

export const createRoomInviteResponseSchema = z
  .object({
    ok: z.literal(true),
    token: inviteToken,
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const resolveRoomInviteRequestSchema = z
  .object({
    token: inviteToken,
  })
  .strict();

export const roomInviteErrorCodeSchema = z.enum([
  'INVITE_NOT_FOUND',
  'INVITE_EXPIRED',
  'INVITE_REVOKED',
  'ROOM_NOT_FOUND',
  'ROOM_CLOSED',
  'ROOM_ALREADY_ACTIVE',
  'NOT_ROOM_MEMBER',
  'VALIDATION_ERROR',
]);

export const roomInviteErrorSchema = z
  .object({
    error: z
      .object({
        code: roomInviteErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const resolveRoomInviteResponseSchema = z
  .object({
    ok: z.literal(true),
    roomId: z.string().min(1),
    roomStatus: roomStatusSchema,
  })
  .strict();

export type CreateRoomInviteRequest = z.infer<typeof createRoomInviteRequestSchema>;
export type CreateRoomInviteResponse = z.infer<typeof createRoomInviteResponseSchema>;
export type ResolveRoomInviteRequest = z.infer<typeof resolveRoomInviteRequestSchema>;
export type ResolveRoomInviteResponse = z.infer<typeof resolveRoomInviteResponseSchema>;
export type RoomInviteErrorCode = z.infer<typeof roomInviteErrorCodeSchema>;
