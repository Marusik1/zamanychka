-- CreateTable
CREATE TABLE "Room" (
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "currentMatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RoomSeat" (
    "roomKey" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "userId" TEXT,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomSeat_pkey" PRIMARY KEY ("roomKey","seatIndex")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomSeat_userId_key" ON "RoomSeat"("userId");

-- CreateIndex
CREATE INDEX "RoomSeat_roomKey_idx" ON "RoomSeat"("roomKey");

-- AddForeignKey
ALTER TABLE "RoomSeat" ADD CONSTRAINT "RoomSeat_roomKey_fkey" FOREIGN KEY ("roomKey") REFERENCES "Room"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSeat" ADD CONSTRAINT "RoomSeat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
