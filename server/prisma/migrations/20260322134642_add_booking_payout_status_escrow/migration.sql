-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'READY', 'PAID_OUT');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "bookings_payoutStatus_idx" ON "bookings"("payoutStatus");
