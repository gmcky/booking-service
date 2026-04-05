/*
  Warnings:

  - You are about to drop the `reviews_legacy_archive` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_hostReplyById_fkey";

-- DropTable
DROP TABLE "reviews_legacy_archive";

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hostReplyById_fkey" FOREIGN KEY ("hostReplyById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
