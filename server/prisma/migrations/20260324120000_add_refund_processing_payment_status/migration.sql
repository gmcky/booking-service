-- Add intermediate status to mark started auto-refund workflow before provider call
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_PROCESSING';
