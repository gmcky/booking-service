-- Split single-string address into structured fields. Existing addresses
-- carry over into "street" verbatim; house/apartment stay empty until hosts
-- edit their listings (or the DB is reseeded).
ALTER TABLE "properties" ADD COLUMN "street" TEXT;
ALTER TABLE "properties" ADD COLUMN "houseNumber" TEXT;
ALTER TABLE "properties" ADD COLUMN "apartment" TEXT;

UPDATE "properties" SET "street" = "address";

ALTER TABLE "properties" ALTER COLUMN "street" SET NOT NULL;
ALTER TABLE "properties" DROP COLUMN "address";
