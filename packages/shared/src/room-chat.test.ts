import { describe, expect, it } from 'vitest';

import {
  roomChatHistorySchema,
  roomChatMessageSchema,
  sendRoomChatMessageRequestSchema,
  sendRoomChatMessageResponseSchema,
} from './room-chat.js';

describe('room chat schemas', () => {
  it('parses room chat message and history payloads', () => {
    const message = roomChatMessageSchema.parse({
      id: 'msg-1',
      roomId: 'room-1',
      userId: 'user-1',
      displayName: 'Алексей',
      text: 'Привет комнате',
      createdAt: '2026-08-31T10:00:00.000Z',
    });

    expect(message.displayName).toBe('Алексей');

    const history = roomChatHistorySchema.parse({ messages: [message] });
    expect(history.messages).toHaveLength(1);
  });

  it('rejects blank messages and parses send responses', () => {
    expect(() => sendRoomChatMessageRequestSchema.parse({ text: '   ' })).toThrow();

    const response = sendRoomChatMessageResponseSchema.parse({
      ok: true,
      message: {
        id: 'msg-2',
        roomId: 'room-1',
        userId: 'user-1',
        displayName: 'Мария',
        text: 'Ходи',
        createdAt: '2026-08-31T10:01:00.000Z',
      },
    });

    expect(response.message.text).toBe('Ходи');
  });
});
