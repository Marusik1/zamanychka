import type { AuthUser, DevAuthCapability } from '@zamanushka/shared';

import { AuthApiError, type AuthApi } from './api.js';

export type AuthState =
  | { status: 'BOOTSTRAPPING' }
  | { status: 'AUTHENTICATING' }
  | { status: 'AUTHENTICATED'; user: AuthUser; rulesOnboardingSeenAt: string | null }
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
  signal?: AbortSignal,
  transition?: (state: AuthState) => void,
): Promise<AuthState> {
  try {
    const me = await api.me(signal);
    signal?.throwIfAborted();
    return {
      status: 'AUTHENTICATED',
      user: me.user,
      rulesOnboardingSeenAt: me.rulesOnboardingSeenAt,
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof AuthApiError) || error.status !== 401) return genericError;
  }

  try {
    signal?.throwIfAborted();
    if (initData) {
      transition?.({ status: 'AUTHENTICATING' });
      const result = await api.loginTelegram(initData, signal);
      signal?.throwIfAborted();
      return {
        status: 'AUTHENTICATED',
        user: result.user,
        rulesOnboardingSeenAt: result.rulesOnboardingSeenAt,
      };
    }
    const capability = await api.developmentCapability(signal);
    signal?.throwIfAborted();
    if (capability.enabled) return { status: 'DEV_AUTH_REQUIRED', users: capability.users };
    return {
      status: 'ERROR',
      message: 'Вход доступен только внутри Telegram.',
      retryable: true,
    };
  } catch {
    signal?.throwIfAborted();
    return genericError;
  }
}
