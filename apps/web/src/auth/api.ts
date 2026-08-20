import {
  authSuccessSchema,
  devAuthCapabilitySchema,
  meResponseSchema,
  publicErrorSchema,
  type AuthSuccess,
  type DevAuthCapability,
  type MeResponse,
} from '@zamanushka/shared';
type Fetcher = typeof fetch;
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export class AuthApiError extends Error {
  constructor(readonly status: number) {
    super('Authentication request failed');
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
    publicErrorSchema.safeParse(body);
    throw new AuthApiError(response.status);
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
  logout(): Promise<void>;
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
      const response = await fetcher('/api/auth/logout', post());
      if (!response.ok) throw new AuthApiError(response.status);
    },
  };
}
