import {
  authSuccessSchema,
  devAuthCapabilitySchema,
  logoutResponseSchema,
  meResponseSchema,
  publicErrorSchema,
  type AuthSuccess,
  type DevAuthCapability,
  type LogoutResponse,
  type MeResponse,
  type PublicErrorCode,
} from '@zamanushka/shared';
type Fetcher = typeof fetch;
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: PublicErrorCode | 'INVALID_RESPONSE' = 'INVALID_RESPONSE',
    message = 'Unexpected authentication response',
  ) {
    super(message);
  }
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AuthApiError(response.status);
  }
  if (!response.ok) {
    const error = publicErrorSchema.safeParse(body);
    if (!error.success) throw new AuthApiError(response.status);
    throw new AuthApiError(response.status, error.data.error.code, error.data.error.message);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new AuthApiError(response.status);
  return result.data;
}

function getOptions(signal?: AbortSignal): RequestInit {
  return { credentials: 'include', ...(signal ? { signal } : {}) };
}

function post(body?: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...(signal ? { signal } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export interface AuthApi {
  me(signal?: AbortSignal): Promise<MeResponse>;
  loginTelegram(initData: string, signal?: AbortSignal): Promise<AuthSuccess>;
  developmentCapability(signal?: AbortSignal): Promise<DevAuthCapability>;
  loginDevelopment(devUserKey: string, signal?: AbortSignal): Promise<AuthSuccess>;
  logout(signal?: AbortSignal): Promise<LogoutResponse>;
}

export function createAuthApi(fetcher: Fetcher = fetch): AuthApi {
  return {
    async me(signal) {
      return parse(await fetcher('/api/me', getOptions(signal)), meResponseSchema);
    },
    async loginTelegram(initData, signal) {
      return parse(
        await fetcher('/api/auth/telegram', post({ initData }, signal)),
        authSuccessSchema,
      );
    },
    async developmentCapability(signal) {
      return parse(await fetcher('/api/auth/dev', getOptions(signal)), devAuthCapabilitySchema);
    },
    async loginDevelopment(devUserKey, signal) {
      return parse(await fetcher('/api/auth/dev', post({ devUserKey }, signal)), authSuccessSchema);
    },
    async logout(signal) {
      return parse(
        await fetcher('/api/auth/logout', post(undefined, signal)),
        logoutResponseSchema,
      );
    },
  };
}
