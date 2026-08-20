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

const getOptions = { credentials: 'include' as const };

function post(body?: unknown): RequestInit {
  return {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export interface AuthApi {
  me(): Promise<MeResponse>;
  loginTelegram(initData: string): Promise<AuthSuccess>;
  developmentCapability(): Promise<DevAuthCapability>;
  loginDevelopment(devUserKey: string): Promise<AuthSuccess>;
  logout(): Promise<LogoutResponse>;
}

export function createAuthApi(fetcher: Fetcher = fetch): AuthApi {
  return {
    async me() {
      return parse(await fetcher('/api/me', getOptions), meResponseSchema);
    },
    async loginTelegram(initData) {
      return parse(await fetcher('/api/auth/telegram', post({ initData })), authSuccessSchema);
    },
    async developmentCapability() {
      return parse(await fetcher('/api/auth/dev', getOptions), devAuthCapabilitySchema);
    },
    async loginDevelopment(devUserKey) {
      return parse(await fetcher('/api/auth/dev', post({ devUserKey })), authSuccessSchema);
    },
    async logout() {
      return parse(await fetcher('/api/auth/logout', post()), logoutResponseSchema);
    },
  };
}
