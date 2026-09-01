import { z } from 'zod';

const id = z.string().min(1);

export const roomChatMessageSchema = z
  .object({
    id,
    roomId: id,
    userId: id,
    displayName: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(1000),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const roomChatHistorySchema = z
  .object({
    messages: z.array(roomChatMessageSchema),
  })
  .strict();

export const sendRoomChatMessageRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
  })
  .strict();

export const sendRoomChatMessageResponseSchema = z
  .object({
    ok: z.literal(true),
    message: roomChatMessageSchema,
  })
  .strict();

export type RoomChatMessage = z.infer<typeof roomChatMessageSchema>;
export type RoomChatHistory = z.infer<typeof roomChatHistorySchema>;
export type SendRoomChatMessageRequest = z.infer<typeof sendRoomChatMessageRequestSchema>;
export type SendRoomChatMessageResponse = z.infer<typeof sendRoomChatMessageResponseSchema>;
