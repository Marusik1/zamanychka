CREATE TABLE "RoomChatMessage" (
    "id" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoomChatMessage_roomKey_createdAt_idx" ON "RoomChatMessage"("roomKey", "createdAt");
CREATE INDEX "RoomChatMessage_userId_createdAt_idx" ON "RoomChatMessage"("userId", "createdAt");

ALTER TABLE "RoomChatMessage" ADD CONSTRAINT "RoomChatMessage_roomKey_fkey" FOREIGN KEY ("roomKey") REFERENCES "Room"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomChatMessage" ADD CONSTRAINT "RoomChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
