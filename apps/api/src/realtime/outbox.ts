import type { AppPrismaClient } from '../infrastructure/prisma.js';
import type { ClaimedOutboxRow, OutboxLeaseStore } from './outbox-dispatcher.js';

export function createPostgresOutboxLeaseStore(
  prisma: AppPrismaClient,
  options: { now?: () => Date; leaseDurationMs?: number } = {},
): OutboxLeaseStore {
  const now = options.now ?? (() => new Date());
  const leaseDurationMs = options.leaseDurationMs ?? 30_000;

  return {
    async claim({ leaseToken }): Promise<ClaimedOutboxRow | null> {
      const claimedAt = now();
      const leaseExpiresAt = new Date(claimedAt.getTime() + leaseDurationMs);
      return prisma.$transaction(async (tx) => {
        const candidates = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "OutboxRow"
          WHERE "publishedAt" IS NULL
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${claimedAt})
          ORDER BY "createdAt" ASC, "id" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;
        const candidate = candidates[0];
        if (!candidate) return null;
        const claimed = await tx.outboxRow.update({
          where: { id: candidate.id },
          data: { leaseToken, leaseExpiresAt, publishAttempts: { increment: 1 } },
        });
        return {
          id: claimed.id,
          matchId: claimed.matchId,
          resultingStateVersion: claimed.resultingStateVersion,
          payload: claimed.payload,
        };
      });
    },

    async markPublished({ outboxId, leaseToken }) {
      const result = await prisma.outboxRow.updateMany({
        where: { id: outboxId, publishedAt: null, leaseToken },
        data: { publishedAt: now(), leaseToken: null, leaseExpiresAt: null },
      });
      return result.count === 1;
    },

    async release({ outboxId, leaseToken }) {
      await prisma.outboxRow.updateMany({
        where: { id: outboxId, publishedAt: null, leaseToken },
        data: { leaseToken: null, leaseExpiresAt: null },
      });
    },
  };
}
