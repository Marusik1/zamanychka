ALTER TABLE "Match"
ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "terminalResult" JSONB,
ADD COLUMN "finishedAt" TIMESTAMP(3);

CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessedAction" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxRow" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "resultingStateVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchEvent_matchId_sequence_key" ON "MatchEvent"("matchId", "sequence");
CREATE INDEX "MatchEvent_matchId_stateVersion_idx" ON "MatchEvent"("matchId", "stateVersion");
CREATE UNIQUE INDEX "ProcessedAction_matchId_actionId_key" ON "ProcessedAction"("matchId", "actionId");
CREATE UNIQUE INDEX "OutboxRow_matchId_resultingStateVersion_key" ON "OutboxRow"("matchId", "resultingStateVersion");
CREATE INDEX "OutboxRow_publishedAt_createdAt_idx" ON "OutboxRow"("publishedAt", "createdAt");

ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessedAction" ADD CONSTRAINT "ProcessedAction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboxRow" ADD CONSTRAINT "OutboxRow_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
