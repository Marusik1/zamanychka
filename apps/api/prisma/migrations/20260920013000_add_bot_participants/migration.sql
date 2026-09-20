-- Add explicit participant kind for human/bot room seats.
CREATE TYPE "ParticipantKind" AS ENUM ('HUMAN', 'BOT');

ALTER TABLE "RoomSeat"
  ADD COLUMN "participantId" TEXT,
  ADD COLUMN "participantKind" "ParticipantKind";

UPDATE "RoomSeat"
SET
  "participantId" = "userId",
  "participantKind" = CASE
    WHEN "userId" IS NULL THEN NULL
    ELSE 'HUMAN'::"ParticipantKind"
  END;

CREATE UNIQUE INDEX "RoomSeat_participantId_key" ON "RoomSeat"("participantId");
CREATE INDEX "RoomSeat_participantKind_idx" ON "RoomSeat"("participantKind");
