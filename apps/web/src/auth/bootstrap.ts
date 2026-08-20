import type { AuthUser, DevAuthCapability } from '@zamanushka/shared';

import { AuthApiError, type AuthApi } from './api.js';

export type AuthState =
  | { status: 'BOOTSTRAPPING' }
  | { status: 'AUTHENTICATING' }
  | { status: 'AUTHENTICATED'; user: AuthUser }
  | { status: 'DEV_AUTH_REQUIRED'; users: Extract<DevAuthCapability, { enabled: true }>['users'] }
  | { status: 'ERROR'; message: string; retryable: boolean };

const genericError: AuthState = {
  status: 'ERROR',
  message: 'Не удалось проверить вход. Попробуйте ещё раз.',
  retryable: true,
};

export async function bootstrapAuth(
  api: AuthApi,
  initData?: string,
  transition?: (state: AuthState) => void,
): Promise<AuthState> {
  try {
    const me = await api.me();
    return { status: 'AUTHENTICATED', user: me.user };
  } catch (error) {
    if (!(error instanceof AuthApiError) || error.status !== 401) return genericError;
  }

  try {
    if (initData) {
      transition?.({ status: 'AUTHENTICATING' });
      const result = await api.loginTelegram(initData);
      return { status: 'AUTHENTICATED', user: result.user };
    }
    const capability = await api.developmentCapability();
    if (capability.enabled) return { status: 'DEV_AUTH_REQUIRED', users: capability.users };
    return {
      status: 'ERROR',
      message: 'Вход доступен только внутри Telegram.',
      retryable: true,
    };
  } catch {
    return genericError;
  }
}
