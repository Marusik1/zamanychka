import {
  createRoomInviteResponseSchema,
  listRoomsResponseSchema,
  createRoomResultSchema,
  resolveRoomInviteResponseSchema,
  roomChatHistorySchema,
  roomCommandErrorSchema,
  roomInviteErrorSchema,
  roomCommandResultSchema,
  roomStateSchema,
  sendRoomChatMessageResponseSchema,
  startMatchResultSchema,
  type CreateRoomInviteResponse,
  type ListRoomsResponse,
  type CreateRoomResult,
  type ResolveRoomInviteResponse,
  type RoomChatMessage,
  type RoomChatHistory,
  type RoomCommandErrorCode,
  type RoomInviteErrorCode,
  type RoomCommandResult,
  type RoomState,
  type RoomSeatIndex,
  type StartMatchResult,
} from '@zamanushka/shared';

import { frontendBuildInfo } from '../build-info.js';

type Fetcher = typeof fetch;
type RoomTelemetryEvent = Readonly<{
  event: string;
  at: string;
  [key: string]: unknown;
}>;

declare global {
  interface Window {
    __zRoomDiagnostics?: RoomTelemetryEvent[];
  }
}

export type RoomView = RoomState;
export type StartMatchSuccess = Extract<StartMatchResult, { ok: true }>;

export class RoomApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: RoomCommandErrorCode | RoomInviteErrorCode | 'INVALID_RESPONSE' = 'INVALID_RESPONSE',
    message = 'Не удалось обработать ответ комнаты.',
  ) {
    super(message);
  }
}

function roomTelemetryConsoleEnabled() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('zamanushka:roomTelemetry') === 'true';
}

export function recordRoomTelemetry(event: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const entry: RoomTelemetryEvent = {
    event,
    at: new Date().toISOString(),
    releaseId: frontendBuildInfo.releaseId,
    ...payload,
  };
  window.__zRoomDiagnostics = [...(window.__zRoomDiagnostics ?? []), entry].slice(-300);
  if (roomTelemetryConsoleEnabled() || import.meta.env.DEV) {
    console.info('[room-entry]', entry);
  }
}

async function parse<T>(
  response: Response,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  context: { operation: string; roomId?: string },
): Promise<T> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    recordRoomTelemetry('rest-invalid-json', {
      ...context,
      status: response.status,
      ok: response.ok,
    });
    throw new RoomApiError(response.status);
  }

  if (!response.ok) {
    const error = roomCommandErrorSchema.safeParse(body);
    const inviteError = roomInviteErrorSchema.safeParse(body);
    const parsedError = error.success ? error : inviteError;
    if (!parsedError.success) {
      recordRoomTelemetry('rest-error-invalid-shape', {
        ...context,
        status: response.status,
      });
      throw new RoomApiError(response.status);
    }
    recordRoomTelemetry('rest-error', {
      ...context,
      status: response.status,
      code: parsedError.data.error.code,
    });
    throw new RoomApiError(response.status, parsedError.data.error.code, parsedError.data.error.message);
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    recordRoomTelemetry('rest-success-invalid-shape', {
      ...context,
      status: response.status,
    });
    throw new RoomApiError(response.status);
  }
  recordRoomTelemetry('rest-success', {
    ...context,
    status: response.status,
  });
  return result.data;
}

async function request<T>(
  fetcher: Fetcher,
  url: string,
  options: RequestInit,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  context: { operation: string; roomId?: string },
) {
  recordRoomTelemetry('rest-start', {
    ...context,
    url,
    apiOrigin: typeof window === 'undefined' ? 'server' : window.location.origin,
  });
  try {
    return await parse(await fetcher(url, options), schema, context);
  } catch (error) {
    recordRoomTelemetry('rest-failed', {
      ...context,
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof RoomApiError ? error.code : undefined,
      status: error instanceof RoomApiError ? error.status : undefined,
    });
    throw error;
  }
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
  createRoom(signal?: AbortSignal): Promise<CreateRoomResult>;
  createInvite(roomId: string, signal?: AbortSignal): Promise<CreateRoomInviteResponse>;
  resolveInvite(token: string, signal?: AbortSignal): Promise<ResolveRoomInviteResponse>;
  getRoom(roomId: string, signal?: AbortSignal): Promise<RoomView>;
  joinRoom(roomId: string, signal?: AbortSignal): Promise<RoomCommandResult>;
  takeSeat(
    roomId: string,
    seatIndex: RoomSeatIndex,
    expectedRoomVersion: number,
    signal?: AbortSignal,
  ): Promise<RoomCommandResult>;
  addBot?(roomId: string, seatIndex: RoomSeatIndex, expectedRoomVersion: number, signal?: AbortSignal): Promise<RoomCommandResult>;
  removeBot?(roomId: string, seatIndex: RoomSeatIndex, expectedRoomVersion: number, signal?: AbortSignal): Promise<RoomCommandResult>;
  leaveSeat(roomId: string, expectedRoomVersion: number, signal?: AbortSignal): Promise<RoomCommandResult>;
  leaveRoom(roomId: string, expectedRoomVersion: number, signal?: AbortSignal): Promise<RoomCommandResult>;
  deleteRoom(roomId: string, expectedRoomVersion: number, signal?: AbortSignal): Promise<RoomCommandResult>;
  setReady(
    roomId: string,
    ready: boolean,
    expectedRoomVersion: number,
    signal?: AbortSignal,
  ): Promise<RoomCommandResult>;
  startMatch(roomId: string, expectedRoomVersion: number, signal?: AbortSignal): Promise<StartMatchResult>;
  reconnect(roomId: string, signal?: AbortSignal): Promise<RoomView>;
  getChat(roomId: string, signal?: AbortSignal): Promise<RoomChatHistory>;
  sendChat(roomId: string, text: string, signal?: AbortSignal): Promise<RoomChatMessage>;
}

export function createRoomApi(fetcher: Fetcher = fetch): RoomApi {
  return {
    async listRooms(signal) {
      return request(fetcher, '/api/rooms', getOptions(signal), listRoomsResponseSchema, {
        operation: 'listRooms',
      });
    },
    async createRoom(signal) {
      return request(fetcher, '/api/rooms', post({}, signal), createRoomResultSchema, {
        operation: 'createRoom',
      });
    },
    async createInvite(roomId, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/invites`,
        post({}, signal),
        createRoomInviteResponseSchema,
        { operation: 'createInvite', roomId },
      );
    },
    async resolveInvite(token, signal) {
      return request(
        fetcher,
        '/api/room-invites/resolve',
        post({ token }, signal),
        resolveRoomInviteResponseSchema,
        { operation: 'resolveInvite' },
      );
    },
    async getRoom(roomId, signal) {
      return request(fetcher, `/api/rooms/${roomId}`, getOptions(signal), roomStateSchema, {
        operation: 'getRoom',
        roomId,
      });
    },
    async joinRoom(roomId, signal) {
      return request(fetcher, `/api/rooms/${roomId}/join`, post({}, signal), roomCommandResultSchema, {
        operation: 'joinRoom',
        roomId,
      });
    },
    async takeSeat(roomId, seatIndex, expectedRoomVersion, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/seats/${seatIndex}`,
        post({ seatIndex, expectedRoomVersion }, signal),
        roomCommandResultSchema,
        { operation: 'takeSeat', roomId },
      );
    },
    async addBot(roomId, seatIndex, expectedRoomVersion, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/seats/${seatIndex}/bot`,
        post({ seatIndex, expectedRoomVersion }, signal),
        roomCommandResultSchema,
        { operation: 'addBot', roomId },
      );
    },
    async removeBot(roomId, seatIndex, expectedRoomVersion, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/seats/${seatIndex}/bot`,
        del({ seatIndex, expectedRoomVersion }, signal),
        roomCommandResultSchema,
        { operation: 'removeBot', roomId },
      );
    },
    async leaveSeat(roomId, expectedRoomVersion, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/seat`,
        del({ expectedRoomVersion }, signal),
        roomCommandResultSchema,
        { operation: 'leaveSeat', roomId },
      );
    },
    async leaveRoom(roomId, expectedRoomVersion, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/leave`,
        post({ expectedRoomVersion }, signal),
        roomCommandResultSchema,
        { operation: 'leaveRoom', roomId },
      );
    },
    async deleteRoom(roomId, expectedRoomVersion, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}`,
        del({ expectedRoomVersion }, signal),
        roomCommandResultSchema,
        { operation: 'deleteRoom', roomId },
      );
    },
    async setReady(roomId, ready, expectedRoomVersion, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/ready`,
        post({ ready, expectedRoomVersion }, signal),
        roomCommandResultSchema,
        { operation: 'setReady', roomId },
      );
    },
    async startMatch(roomId, expectedRoomVersion, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/start`,
        post({ expectedRoomVersion }, signal),
        startMatchResultSchema,
        { operation: 'startMatch', roomId },
      );
    },
    async reconnect(roomId, signal) {
      return request(
        fetcher,
        `/api/rooms/${roomId}/reconnect`,
        post({}, signal),
        roomStateSchema,
        { operation: 'reconnect', roomId },
      );
    },
    async getChat(roomId, signal) {
      return request(fetcher, `/api/rooms/${roomId}/chat`, getOptions(signal), roomChatHistorySchema, {
        operation: 'getChat',
        roomId,
      });
    },
    async sendChat(roomId, text, signal) {
      const response = await request(
        fetcher,
        `/api/rooms/${roomId}/chat`,
        post({ text }, signal),
        sendRoomChatMessageResponseSchema,
        { operation: 'sendChat', roomId },
      );
      return response.message;
    },
  };
}
