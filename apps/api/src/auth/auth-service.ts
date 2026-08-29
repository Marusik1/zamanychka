import type { AuthUser, DevAuthCapability } from '@zamanushka/shared';

import type { TelegramInitDataResult } from './telegram-init-data.js';
import type { ReplacementResult } from './auth-repository.js';
import { createSessionToken, hashSessionToken } from './session-token.js';

interface UserRow {
  id: string;
  telegramId: bigint | null;
  devUserKey: string | null;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  languageCode?: string | null;
  photoUrl?: string | null;
  rulesOnboardingSeenAt?: Date | null;
}
interface SessionRow {
  user: UserRow;
  authMethod: 'TELEGRAM' | 'DEVELOPMENT';
}
export interface AuthRepository {
  upsertTelegramUser(input: {
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    languageCode?: string;
    photoUrl?: string;
  }): Promise<UserRow>;
  upsertDevelopmentUser(input: { devUserKey: string; displayName: string }): Promise<UserRow>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    authMethod: 'TELEGRAM' | 'DEVELOPMENT';
    expiresAt: Date;
  }): Promise<{ id: string; expiresAt: Date }>;
  replaceSession(input: {
    currentTokenHash: string;
    nextTokenHash: string;
    userId: string;
    authMethod: 'TELEGRAM' | 'DEVELOPMENT';
    expiresAt: Date;
    now: Date;
  }): Promise<ReplacementResult>;
  resolveActiveSession(hash: string, now: Date): Promise<SessionRow | null>;
  markRulesOnboardingSeen(userId: string, now: Date): Promise<Date>;
  revokeSession(hash: string, now: Date): Promise<unknown>;
}

export class AuthServiceError extends Error {
  constructor(
    readonly code:
      'VALIDATION_ERROR' | 'TELEGRAM_AUTH_INVALID' | 'AUTH_REQUIRED' | 'AUTH_SESSION_REPLACED',
  ) {
    super(code);
  }
}

function view(user: UserRow, method: 'TELEGRAM' | 'DEVELOPMENT'): AuthUser {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return {
    id: user.id,
    displayName,
    authProvider: method,
    ...(user.username ? { username: user.username } : {}),
    ...(user.photoUrl ? { photoUrl: user.photoUrl } : {}),
    ...(user.languageCode ? { languageCode: user.languageCode } : {}),
  };
}

function toSeenAtIso(user: UserRow) {
  return user.rulesOnboardingSeenAt?.toISOString() ?? null;
}

export function createAuthService(options: {
  repository: AuthRepository;
  now?: () => Date;
  createToken?: () => string;
  sessionTtlSeconds: number;
  verifyTelegram?: (raw: string) => TelegramInitDataResult;
  devUsers?: { devUserKey: string; displayName: string }[];
}) {
  const now = options.now ?? (() => new Date());
  async function issue(user: UserRow, method: 'TELEGRAM' | 'DEVELOPMENT', currentToken?: string) {
    const at = now();
    const expiresAt = new Date(at.getTime() + options.sessionTtlSeconds * 1000);
    const token = (options.createToken ?? createSessionToken)();
    const tokenHash = hashSessionToken(token);
    if (currentToken) {
      const result = await options.repository.replaceSession({
        currentTokenHash: hashSessionToken(currentToken),
        nextTokenHash: tokenHash,
        userId: user.id,
        authMethod: method,
        expiresAt,
        now: at,
      });
      if (result.kind === 'replacement-conflict')
        throw new AuthServiceError('AUTH_SESSION_REPLACED');
      if (result.kind === 'no-current-session' || result.kind === 'not-replaceable')
        await options.repository.createSession({
          userId: user.id,
          tokenHash,
          authMethod: method,
          expiresAt,
        });
    } else
      await options.repository.createSession({
        userId: user.id,
        tokenHash,
        authMethod: method,
        expiresAt,
      });
    return {
      token,
      user: view(user, method),
      session: { expiresAt: expiresAt.toISOString() },
      rulesOnboardingSeenAt: toSeenAtIso(user),
    };
  }
  return {
    capability(): DevAuthCapability {
      return options.devUsers
        ? { enabled: true, users: options.devUsers }
        : { enabled: false, users: [] };
    },
    async loginTelegram(raw: string, current?: string) {
      const verified = options.verifyTelegram?.(raw);
      if (!verified?.ok) throw new AuthServiceError('TELEGRAM_AUTH_INVALID');
      const u = verified.user;
      const user = await options.repository.upsertTelegramUser({
        telegramId: BigInt(u.id),
        firstName: u.firstName,
        ...(u.lastName ? { lastName: u.lastName } : {}),
        ...(u.username ? { username: u.username } : {}),
        ...(u.languageCode ? { languageCode: u.languageCode } : {}),
        ...(u.photoUrl ? { photoUrl: u.photoUrl } : {}),
      });
      return issue(user, 'TELEGRAM', current);
    },
    async loginDevelopment(key: string, current?: string) {
      const configured = options.devUsers?.find((u) => u.devUserKey === key);
      if (!configured) throw new AuthServiceError('VALIDATION_ERROR');
      return issue(
        await options.repository.upsertDevelopmentUser(configured),
        'DEVELOPMENT',
        current,
      );
    },
    async me(token?: string) {
      if (!token) throw new AuthServiceError('AUTH_REQUIRED');
      const session = await options.repository.resolveActiveSession(hashSessionToken(token), now());
      if (!session) throw new AuthServiceError('AUTH_REQUIRED');
      return {
        user: view(session.user, session.authMethod),
        rulesOnboardingSeenAt: toSeenAtIso(session.user),
      };
    },
    async markRulesOnboardingSeen(token?: string) {
      if (!token) throw new AuthServiceError('AUTH_REQUIRED');
      const session = await options.repository.resolveActiveSession(hashSessionToken(token), now());
      if (!session) throw new AuthServiceError('AUTH_REQUIRED');
      const seenAt = await options.repository.markRulesOnboardingSeen(session.user.id, now());
      return { rulesOnboardingSeenAt: seenAt.toISOString() };
    },
    async logout(token?: string) {
      if (token) await options.repository.revokeSession(hashSessionToken(token), now());
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
