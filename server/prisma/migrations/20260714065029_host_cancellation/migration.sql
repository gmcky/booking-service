-- CreateEnum
CREATE TYPE "CancelActor" AS ENUM ('GUEST', 'HOST', 'ADMIN');

-- CreateEnum
CREATE TYPE "HostCancellationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'VOIDED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancelledBy" "CancelActor";

-- CreateTable
CREATE TABLE "host_cancellation_requests" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HostCancellationStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "host_cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "hostCancelAutoApproveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hostCancelAutoApproveDays" INTEGER NOT NULL DEFAULT 7,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "host_cancellation_requests_status_idx" ON "host_cancellation_requests"("status");

-- CreateIndex
CREATE INDEX "host_cancellation_requests_bookingId_idx" ON "host_cancellation_requests"("bookingId");

-- CreateIndex
CREATE INDEX "host_cancellation_requests_createdAt_idx" ON "host_cancellation_requests"("createdAt");

-- AddForeignKey
ALTER TABLE "host_cancellation_requests" ADD CONSTRAINT "host_cancellation_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_cancellation_requests" ADD CONSTRAINT "host_cancellation_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_cancellation_requests" ADD CONSTRAINT "host_cancellation_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one open (PENDING) cancellation request per booking. Prisma cannot
-- express a partial unique index, so it is added by hand here.
CREATE UNIQUE INDEX "host_cancellation_requests_one_open_per_booking"
  ON "host_cancellation_requests"("bookingId")
  WHERE "status" = 'PENDING';

-- Backfill: every historically CANCELLED booking could only have been cancelled
-- by the guest (host cancellation did not exist before this migration).
UPDATE "bookings" SET "cancelledBy" = 'GUEST' WHERE "status" = 'CANCELLED';
