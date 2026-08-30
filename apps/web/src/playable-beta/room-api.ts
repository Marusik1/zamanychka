import {
  listRoomsResponseSchema,
  roomCommandErrorSchema,
  roomCommandResultSchema,
  roomStateSchema,
  startMatchResultSchema,
  type ListRoomsResponse,
  type RoomCommandErrorCode,
  type RoomCommandResult,
  type RoomState,
  type RoomSeatIndex,
  type StartMatchResult,
} from '@zamanushka/shared';

type Fetcher = typeof fetch;

export type RoomView = RoomState;
export type StartMatchSuccess = Extract<StartMatchResult, { ok: true }>;

export class RoomApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: RoomCommandErrorCode | 'INVALID_RESPONSE' = 'INVALID_RESPONSE',
    message = 'Unexpected room response',
  ) {
    super(message);
  }
}

async function parse<T>(
  response: Response,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): Promise<T> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new RoomApiError(response.status);
  }

  if (!response.ok) {
    const error = roomCommandErrorSchema.safeParse(body);
    if (!error.success) throw new RoomApiError(response.status);
    throw new RoomApiError(response.status, error.data.error.code, error.data.error.message);
  }

  const result = schema.safeParse(body);
  if (!result.success) throw new RoomApiError(response.status);
  return result.data;
}

function getOptions(signal?: AbortSignal): RequestInit {
  return { credentials: 'include', ...(signal ? { signal } : {}) };
}

function post(body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  };
}

function del(body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  };
}

export interface RoomApi {
  listRooms(signal?: AbortSignal): Promise<ListRoomsResponse>;
  createRoom(signal?: AbortSignal): Promise<RoomCommandResult>;
  getRoom(roomId: string, signal?: AbortSignal): Promise<RoomView>;
  joinRoom(roomId: string, signal?: AbortSignal): Promise<RoomCommandResult>;
  takeSeat(
    roomId: string,
    seatIndex: RoomSeatIndex,
    expectedRoomVersion: number,
    signal?: AbortSignal,
  ): Promise<RoomCommandResult>;
  leaveSeat(roomId: string, expectedRoomVersion: number, signal?: AbortSignal): Promise<RoomCommandResult>;
  leaveRoom(roomId: string, expectedRoomVersion: number, signal?: AbortSignal): Promise<RoomCommandResult>;
  setReady(
    roomId: string,
    ready: boolean,
    expectedRoomVersion: number,
    signal?: AbortSignal,
  ): Promise<RoomCommandResult>;
  startMatch(roomId: string, expectedRoomVersion: number, signal?: AbortSignal): Promise<StartMatchResult>;
  reconnect(roomId: string, signal?: AbortSignal): Promise<RoomView>;
}

export function createRoomApi(fetcher: Fetcher = fetch): RoomApi {
  return {
    async listRooms(signal) {
      return parse(await fetcher('/api/rooms', getOptions(signal)), listRoomsResponseSchema);
    },
    async createRoom(signal) {
      return parse(await fetcher('/api/rooms', post({}, signal)), roomCommandResultSchema);
    },
    async getRoom(roomId, signal) {
      return parse(await fetcher(`/api/rooms/${roomId}`, getOptions(signal)), roomStateSchema);
    },
    async joinRoom(roomId, signal) {
      return parse(await fetcher(`/api/rooms/${roomId}/join`, post({}, signal)), roomCommandResultSchema);
    },
    async takeSeat(roomId, seatIndex, expectedRoomVersion, signal) {
      return parse(
        await fetcher(
          `/api/rooms/${roomId}/seats/${seatIndex}`,
          post({ seatIndex, expectedRoomVersion }, signal),
        ),
        roomCommandResultSchema,
      );
    },
    async leaveSeat(roomId, expectedRoomVersion, signal) {
      return parse(
        await fetcher(`/api/rooms/${roomId}/seat`, del({ expectedRoomVersion }, signal)),
        roomCommandResultSchema,
      );
    },
    async leaveRoom(roomId, expectedRoomVersion, signal) {
      return parse(
        await fetcher(`/api/rooms/${roomId}/leave`, post({ expectedRoomVersion }, signal)),
        roomCommandResultSchema,
      );
    },
    async setReady(roomId, ready, expectedRoomVersion, signal) {
      return parse(
        await fetcher(`/api/rooms/${roomId}/ready`, post({ ready, expectedRoomVersion }, signal)),
        roomCommandResultSchema,
      );
    },
    async startMatch(roomId, expectedRoomVersion, signal) {
      return parse(
        await fetcher(`/api/rooms/${roomId}/start`, post({ expectedRoomVersion }, signal)),
        startMatchResultSchema,
      );
    },
    async reconnect(roomId, signal) {
      return parse(
        await fetcher(`/api/rooms/${roomId}/reconnect`, post({}, signal)),
        roomStateSchema,
      );
    },
  };
}
