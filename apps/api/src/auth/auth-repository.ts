import type { AuthMethod } from '../generated/prisma/enums.js';
import type { AppPrismaClient } from '../infrastructure/prisma.js';

type TelegramProfile = {
  telegramId: bigint;
  username?: string;
  firstName: string;
  lastName?: string;
  languageCode?: string;
  photoUrl?: string;
};

type SessionInput = {
  userId: string;
  tokenHash: string;
  authMethod: AuthMethod;
  expiresAt: Date;
};

type ReplacementInput = {
  currentTokenHash: string;
  nextTokenHash: string;
  userId: string;
  authMethod: AuthMethod;
  expiresAt: Date;
  now: Date;
};

export type ReplacementResult =
  | { kind: 'replaced'; session: { id: string; expiresAt: Date } }
  | { kind: 'no-current-session' }
  | { kind: 'not-replaceable' }
  | { kind: 'replacement-conflict' };

type LockedSession = {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export function createAuthRepository(prisma: AppPrismaClient) {
  const replacementsInFlight = new Map<string, number>();

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

    async replaceSession(input: ReplacementInput): Promise<ReplacementResult> {
      const concurrentRequest = (replacementsInFlight.get(input.currentTokenHash) ?? 0) > 0;
      replacementsInFlight.set(
        input.currentTokenHash,
        (replacementsInFlight.get(input.currentTokenHash) ?? 0) + 1,
      );
      try {
        return await prisma.$transaction(
          async (tx) => {
            const observed = await tx.$queryRaw<LockedSession[]>`
            SELECT "id", "expiresAt", "revokedAt"
            FROM "AuthSession"
            WHERE "tokenHash" = ${input.currentTokenHash}
          `;
            const beforeLock = observed[0];
            if (!beforeLock) return { kind: 'no-current-session' };
            if (beforeLock.revokedAt) {
              return concurrentRequest
                ? { kind: 'replacement-conflict' }
                : { kind: 'not-replaceable' };
            }
            if (beforeLock.expiresAt <= input.now) {
              return { kind: 'not-replaceable' };
            }

            const rows = await tx.$queryRaw<LockedSession[]>`
            SELECT "id", "expiresAt", "revokedAt"
            FROM "AuthSession"
            WHERE "tokenHash" = ${input.currentTokenHash}
            FOR UPDATE
          `;
            const current = rows[0];
            if (!current) return { kind: 'no-current-session' };
            if (current.revokedAt) return { kind: 'replacement-conflict' };
            if (current.expiresAt <= input.now) return { kind: 'not-replaceable' };

            await tx.$executeRaw`
            UPDATE "AuthSession"
            SET "revokedAt" = clock_timestamp()
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
      } finally {
        const remaining = (replacementsInFlight.get(input.currentTokenHash) ?? 1) - 1;
        if (remaining === 0) replacementsInFlight.delete(input.currentTokenHash);
        else replacementsInFlight.set(input.currentTokenHash, remaining);
      }
    },
  };
}
