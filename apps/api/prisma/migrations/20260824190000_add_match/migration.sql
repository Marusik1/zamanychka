-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "firstPlayerId" TEXT NOT NULL,
    "seatOrder" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_roomKey_key" ON "Match"("roomKey");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roomKey_fkey" FOREIGN KEY ("roomKey") REFERENCES "Room"("key") ON DELETE CASCADE ON UPDATE CASCADE;
