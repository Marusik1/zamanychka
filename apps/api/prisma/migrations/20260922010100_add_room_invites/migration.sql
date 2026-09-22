CREATE TABLE "RoomInvite" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "RoomInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomInvite_tokenHash_key" ON "RoomInvite"("tokenHash");
CREATE INDEX "RoomInvite_roomId_idx" ON "RoomInvite"("roomId");
CREATE INDEX "RoomInvite_createdByUserId_idx" ON "RoomInvite"("createdByUserId");
CREATE INDEX "RoomInvite_expiresAt_idx" ON "RoomInvite"("expiresAt");

ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("key") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
