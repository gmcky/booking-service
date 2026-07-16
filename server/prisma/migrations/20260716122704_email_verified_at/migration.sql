-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- Backfill: pre-existing users count as verified.
UPDATE "users" SET "emailVerifiedAt" = now();
