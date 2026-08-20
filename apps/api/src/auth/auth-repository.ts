import type { AuthMethod } from '../generated/prisma/enums.js';
import type { AppPrismaClient } from '../infrastructure/prisma.js';

interface TelegramProfile {
  telegramId: bigint;
  username?: string;
  firstName: string;
  lastName?: string;
  languageCode?: string;
  photoUrl?: string;
}

interface SessionInput {
  userId: string;
  tokenHash: string;
  authMethod: AuthMethod;
  expiresAt: Date;
}

interface ReplacementInput {
  currentTokenHash: string;
  nextTokenHash: string;
  userId: string;
  authMethod: AuthMethod;
  expiresAt: Date;
  now: Date;
}

export type ReplacementResult =
  | { kind: 'replaced'; session: { id: string; expiresAt: Date } }
  | { kind: 'no-current-session' }
  | { kind: 'not-replaceable' }
  | { kind: 'replacement-conflict' };

interface LockedSession {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedAt: Date | null;
}

export function createAuthRepository(prisma: AppPrismaClient) {
  return {
    upsertTelegramUser(profile: TelegramProfile) {
      const data = {
        telegramId: profile.telegramId,
        username: profile.username ?? null,
        firstName: profile.firstName,
        lastName: profile.lastName ?? null,
        languageCode: profile.languageCode ?? null,
        photoUrl: profile.photoUrl ?? null,
      };
      return prisma.$transaction((tx) =>
        tx.user.upsert({ where: { telegramId: profile.telegramId }, create: data, update: data }),
      );
    },

    upsertDevelopmentUser(input: { devUserKey: string; displayName: string }) {
      return prisma.$transaction((tx) =>
        tx.user.upsert({
          where: { devUserKey: input.devUserKey },
          create: { devUserKey: input.devUserKey, firstName: input.displayName },
          update: { firstName: input.displayName },
        }),
      );
    },

    createSession(input: SessionInput) {
      return prisma.$transaction(async (tx) => {
        const session = await tx.authSession.create({ data: input });
        return { id: session.id, expiresAt: session.expiresAt };
      });
    },

    resolveActiveSession(tokenHash: string, now: Date) {
      return prisma.authSession.findFirst({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
        include: { user: true },
      });
    },

    revokeSession(tokenHash: string, now: Date) {
      return prisma.$transaction((tx) =>
        tx.authSession.updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: now },
        }),
      );
    },

    replaceSession(input: ReplacementInput): Promise<ReplacementResult> {
      return prisma.$transaction(
        async (tx) => {
          const observed = await tx.$queryRaw<LockedSession[]>`
            SELECT "id", "expiresAt", "revokedAt", "replacedAt"
            FROM "AuthSession"
            WHERE "tokenHash" = ${input.currentTokenHash}
          `;
          const beforeLock = observed[0];
          if (!beforeLock) return { kind: 'no-current-session' };
          if (beforeLock.replacedAt) return { kind: 'replacement-conflict' };
          if (beforeLock.revokedAt) return { kind: 'not-replaceable' };
          if (beforeLock.expiresAt <= input.now) {
            return { kind: 'not-replaceable' };
          }

          const rows = await tx.$queryRaw<LockedSession[]>`
            SELECT "id", "expiresAt", "revokedAt", "replacedAt"
            FROM "AuthSession"
            WHERE "tokenHash" = ${input.currentTokenHash}
            FOR UPDATE
          `;
          const current = rows[0];
          if (!current) return { kind: 'no-current-session' };
          if (current.replacedAt) return { kind: 'replacement-conflict' };
          if (current.revokedAt) return { kind: 'not-replaceable' };
          if (current.expiresAt <= input.now) return { kind: 'not-replaceable' };

          await tx.$executeRaw`
            UPDATE "AuthSession"
            SET "revokedAt" = clock_timestamp(), "replacedAt" = clock_timestamp()
            WHERE "id" = ${current.id}
          `;
          const session = await tx.authSession.create({
            data: {
              userId: input.userId,
              tokenHash: input.nextTokenHash,
              authMethod: input.authMethod,
              expiresAt: input.expiresAt,
            },
          });
          return { kind: 'replaced', session: { id: session.id, expiresAt: session.expiresAt } };
        },
        { isolationLevel: 'ReadCommitted' },
      );
    },
  };
}
