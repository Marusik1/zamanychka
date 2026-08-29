import {
  roomCommandErrorSchema,
  roomCommandResultSchema,
  roomParticipantViewSchema,
  roomPresenceProjectionSchema,
  roomStateSchema,
  type RoomCommandErrorCode,
  type RoomCommandResult,
  type RoomParticipantView,
  type RoomPresenceProjection,
  type RoomState,
  type RoomSeatIndex,
} from '@zamanushka/shared';

type Fetcher = typeof fetch;

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export interface RoomView extends RoomState {
  presence: readonly RoomPresenceProjection[];
  participantViews: readonly RoomParticipantView[];
}

export interface StartMatchSuccess {
  ok: true;
  room: RoomState;
  matchId: string;
}

type StartMatchFailure = Extract<RoomCommandResult, { ok: false }>;

export class RoomApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: RoomCommandErrorCode | 'INVALID_RESPONSE' = 'INVALID_RESPONSE',
    message = 'Unexpected room response',
  ) {
    super(message);
  }
}

const roomViewSchema: Parser<RoomView> = {
  safeParse(value) {
    const room = roomStateSchema.safeParse(value);
    if (!room.success || typeof value !== 'object' || value === null) return { success: false };
    const candidate = value as Record<string, unknown>;
    const presence = Array.isArray(candidate.presence)
      ? candidate.presence.map((entry) => roomPresenceProjectionSchema.safeParse(entry))
      : null;
    const participantViews = Array.isArray(candidate.participantViews)
      ? candidate.participantViews.map((entry) => roomParticipantViewSchema.safeParse(entry))
      : null;
    if (
      !presence ||
      presence.some((entry) => !entry.success) ||
      !participantViews ||
      participantViews.some((entry) => !entry.success)
    ) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        ...room.data,
        presence: presence.map((entry) => (entry as { success: true; data: RoomPresenceProjection }).data),
        participantViews: participantViews.map(
          (entry) => (entry as { success: true; data: RoomParticipantView }).data,
        ),
      },
    };
  },
};

const startMatchSuccessSchema: Parser<StartMatchSuccess> = {
  safeParse(value) {
    if (typeof value !== 'object' || value === null) return { success: false };
    const candidate = value as Record<string, unknown>;
    if (candidate.ok !== true || typeof candidate.matchId !== 'string') return { success: false };
    const room = roomStateSchema.safeParse(candidate.room);
    if (!room.success) return { success: false };
    return {
      success: true,
      data: {
        ok: true,
        room: room.data,
        matchId: candidate.matchId,
      },
    };
  },
};

const startMatchResultSchema: Parser<StartMatchSuccess | StartMatchFailure> = {
  safeParse(value) {
    const success = startMatchSuccessSchema.safeParse(value);
    if (success.success) return success;

    const result = roomCommandResultSchema.safeParse(value);
    if (!result.success || result.data.ok) return { success: false };

    return {
      success: true,
      data: result.data,
    };
  },
};

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
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

export interface RoomApi {
  view(signal?: AbortSignal): Promise<RoomView>;
  takeSeat(seatIndex: RoomSeatIndex, signal?: AbortSignal): Promise<RoomCommandResult>;
  leaveSeat(signal?: AbortSignal): Promise<RoomCommandResult>;
  setReady(ready: boolean, signal?: AbortSignal): Promise<RoomCommandResult>;
  startMatch(signal?: AbortSignal): Promise<StartMatchSuccess | StartMatchFailure>;
  reconnect(signal?: AbortSignal): Promise<RoomView>;
}

export function createRoomApi(fetcher: Fetcher = fetch): RoomApi {
  return {
    async view(signal) {
      return parse(await fetcher('/api/room', getOptions(signal)), roomViewSchema);
    },
    async takeSeat(seatIndex, signal) {
      return parse(
        await fetcher('/api/room/take-seat', post({ seatIndex }, signal)),
        roomCommandResultSchema,
      );
    },
    async leaveSeat(signal) {
      return parse(await fetcher('/api/room/leave-seat', post({}, signal)), roomCommandResultSchema);
    },
    async setReady(ready, signal) {
      return parse(await fetcher('/api/room/set-ready', post({ ready }, signal)), roomCommandResultSchema);
    },
    async startMatch(signal) {
      return parse(await fetcher('/api/room/start-match', post({}, signal)), startMatchResultSchema);
    },
    async reconnect(signal) {
      return parse(await fetcher('/api/room/reconnect', post({}, signal)), roomViewSchema);
    },
  };
}
