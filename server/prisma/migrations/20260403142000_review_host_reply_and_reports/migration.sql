-- Review host replies (inline) and abuse reports.

-- Add host reply fields directly to reviews.
ALTER TABLE "reviews"
    ADD COLUMN "hostReplyText" TEXT,
    ADD COLUMN "hostReplyCreatedAt" TIMESTAMP(3),
    ADD COLUMN "hostReplyById" TEXT;

ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_hostReplyById_fkey"
    FOREIGN KEY ("hostReplyById") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE INDEX "reviews_hostReplyCreatedAt_idx" ON "reviews"("hostReplyCreatedAt");
CREATE INDEX "reviews_hostReplyById_idx" ON "reviews"("hostReplyById");

-- Keep host reply columns consistent: either all NULL or all present.
ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_host_reply_consistency_check"
    CHECK (
        (
            "hostReplyText" IS NULL
            AND "hostReplyCreatedAt" IS NULL
            AND "hostReplyById" IS NULL
        )
        OR
        (
            "hostReplyText" IS NOT NULL
            AND "hostReplyCreatedAt" IS NOT NULL
            AND "hostReplyById" IS NOT NULL
        )
    );

-- Create enum for report moderation status.
CREATE TYPE "ReviewReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

CREATE TABLE "review_reports" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReviewReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "review_reports_reviewId_reporterId_key"
    ON "review_reports"("reviewId", "reporterId");
CREATE INDEX "review_reports_status_idx" ON "review_reports"("status");
CREATE INDEX "review_reports_createdAt_idx" ON "review_reports"("createdAt");

ALTER TABLE "review_reports"
    ADD CONSTRAINT "review_reports_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "reviews"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_reports"
    ADD CONSTRAINT "review_reports_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
