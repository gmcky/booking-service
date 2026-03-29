-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE');

-- AlterTable
ALTER TABLE "payments"
ALTER COLUMN "provider" TYPE "PaymentProvider"
USING ("provider"::"PaymentProvider");
