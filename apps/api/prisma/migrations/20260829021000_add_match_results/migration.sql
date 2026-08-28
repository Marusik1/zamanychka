CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "winnerUserId" TEXT NOT NULL,
    "victoryReason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchParticipantResult" (
    "id" TEXT NOT NULL,
    "matchResultId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchParticipantResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchResult_matchId_key" ON "MatchResult"("matchId");
CREATE INDEX "MatchResult_finishedAt_idx" ON "MatchResult"("finishedAt");
CREATE INDEX "MatchResult_winnerUserId_finishedAt_idx" ON "MatchResult"("winnerUserId", "finishedAt");
CREATE INDEX "MatchResult_roomKey_finishedAt_idx" ON "MatchResult"("roomKey", "finishedAt");

CREATE UNIQUE INDEX "MatchParticipantResult_matchResultId_userId_key" ON "MatchParticipantResult"("matchResultId", "userId");
CREATE INDEX "MatchParticipantResult_userId_matchResultId_idx" ON "MatchParticipantResult"("userId", "matchResultId");

ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchId_fkey"
FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchParticipantResult" ADD CONSTRAINT "MatchParticipantResult_matchResultId_fkey"
FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
