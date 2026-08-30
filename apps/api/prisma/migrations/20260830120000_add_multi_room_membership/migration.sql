ALTER TABLE "Room" ADD COLUMN "code" TEXT;
ALTER TABLE "Room" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'WAITING';

UPDATE "Room"
SET "code" = CASE WHEN "key" = 'single-room' THEN 'MAIN' ELSE UPPER(SUBSTRING(MD5("key") FOR 4)) END,
    "status" = CASE WHEN "currentMatchId" IS NULL THEN 'WAITING' ELSE 'ACTIVE' END;

ALTER TABLE "Room" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");
CREATE UNIQUE INDEX "Room_currentMatchId_key" ON "Room"("currentMatchId");

CREATE TABLE "RoomMembership" (
  "id" TEXT NOT NULL,
  "roomKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomMembership_userId_key" ON "RoomMembership"("userId");
CREATE UNIQUE INDEX "RoomMembership_roomKey_userId_key" ON "RoomMembership"("roomKey", "userId");
CREATE INDEX "RoomMembership_roomKey_idx" ON "RoomMembership"("roomKey");

DO $$
BEGIN
  IF EXISTS (
    SELECT rs."roomKey", rs."userId"
    FROM "RoomSeat" rs
    WHERE rs."userId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "User" u
        WHERE u."id" = rs."userId"
      )
  ) THEN
    RAISE EXCEPTION 'Cannot backfill RoomMembership: RoomSeat references a missing User';
  END IF;

  IF EXISTS (
    SELECT rs."userId"
    FROM "RoomSeat" rs
    WHERE rs."userId" IS NOT NULL
    GROUP BY rs."userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot backfill RoomMembership: duplicate legacy room seat ownership';
  END IF;
END $$;

INSERT INTO "RoomMembership" ("id", "roomKey", "userId")
SELECT 'legacy-' || MD5(rs."roomKey" || ':' || rs."userId"), rs."roomKey", rs."userId"
FROM "RoomSeat" rs
JOIN "User" u ON u."id" = rs."userId"
WHERE rs."userId" IS NOT NULL
ON CONFLICT ("userId") DO NOTHING;

ALTER TABLE "RoomMembership" ADD CONSTRAINT "RoomMembership_roomKey_fkey"
  FOREIGN KEY ("roomKey") REFERENCES "Room"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomMembership" ADD CONSTRAINT "RoomMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoomSeat" ADD CONSTRAINT "RoomSeat_roomKey_userId_membership_fkey"
  FOREIGN KEY ("roomKey", "userId") REFERENCES "RoomMembership"("roomKey", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "RoomSeat" VALIDATE CONSTRAINT "RoomSeat_roomKey_userId_membership_fkey";

ALTER TABLE "Match" DROP CONSTRAINT "Match_roomKey_fkey";
ALTER TABLE "Match" ADD CONSTRAINT "Match_roomKey_fkey"
  FOREIGN KEY ("roomKey") REFERENCES "Room"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_currentMatchId_fkey"
  FOREIGN KEY ("currentMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Room" ADD CONSTRAINT "Room_status_check"
  CHECK (("status" = 'ACTIVE') = ("currentMatchId" IS NOT NULL) AND "status" IN ('WAITING', 'ACTIVE', 'CLOSED'));
