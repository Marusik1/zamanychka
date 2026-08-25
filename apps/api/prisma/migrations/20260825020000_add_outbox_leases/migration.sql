ALTER TABLE "OutboxRow"
ADD COLUMN "leaseToken" TEXT,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "publishAttempts" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "OutboxRow_publishedAt_createdAt_idx";
CREATE INDEX "OutboxRow_publishedAt_leaseExpiresAt_createdAt_idx"
ON "OutboxRow"("publishedAt", "leaseExpiresAt", "createdAt");
