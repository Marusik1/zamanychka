import type { RoomPresenceStore } from './room-service.js';

export function createInMemoryRoomPresenceStore(): RoomPresenceStore {
  const states = new Map<string, Map<string, boolean>>();

  function room(roomId: string) {
    const current = states.get(roomId);
    if (current) return current;
    const created = new Map<string, boolean>();
    states.set(roomId, created);
    return created;
  }

  return {
    async connect(input) {
      room(input.roomId).set(input.userId, true);
    },
    async disconnect(input) {
      room(input.roomId).set(input.userId, false);
    },
    async snapshot(roomId) {
      return new Map(room(roomId));
    },
  };
}
