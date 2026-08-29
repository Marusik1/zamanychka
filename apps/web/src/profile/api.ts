import {
  matchHistoryPageSchema,
  profileResponseSchema,
  publicErrorSchema,
  type MatchHistoryPageDto,
  type ProfileResponseDto,
  type PublicErrorCode,
} from '@zamanushka/shared';

type Fetcher = typeof fetch;

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export class ProfileApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: PublicErrorCode | 'INVALID_RESPONSE' = 'INVALID_RESPONSE',
    message = 'Unexpected profile response',
  ) {
    super(message);
  }
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProfileApiError(response.status);
  }

  if (!response.ok) {
    const error = publicErrorSchema.safeParse(body);
    if (!error.success) throw new ProfileApiError(response.status);
    throw new ProfileApiError(response.status, error.data.error.code, error.data.error.message);
  }

  const result = schema.safeParse(body);
  if (!result.success) throw new ProfileApiError(response.status);
  return result.data;
}

function getOptions(signal?: AbortSignal): RequestInit {
  return { credentials: 'include', ...(signal ? { signal } : {}) };
}

export interface ProfileApi {
  profile(signal?: AbortSignal): Promise<ProfileResponseDto>;
  history(
    input?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<MatchHistoryPageDto>;
}

export function createProfileApi(fetcher: Fetcher = fetch): ProfileApi {
  return {
    async profile(signal) {
      return parse(await fetcher('/api/profile', getOptions(signal)), profileResponseSchema);
    },
    async history(input = {}, signal) {
      const params = new URLSearchParams();
      if (input.limit !== undefined) params.set('limit', String(input.limit));
      if (input.cursor) params.set('cursor', input.cursor);
      const query = params.toString();
      const url = query ? `/api/profile/history?${query}` : '/api/profile/history';
      return parse(await fetcher(url, getOptions(signal)), matchHistoryPageSchema);
    },
  };
}
