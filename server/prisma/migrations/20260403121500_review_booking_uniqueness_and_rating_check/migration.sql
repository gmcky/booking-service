-- Archive legacy reviews before introducing booking-scoped review constraints.
CREATE TABLE "reviews_legacy_archive" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "reviews_legacy_archive" (
    "id",
    "rating",
    "comment",
    "createdAt",
    "updatedAt",
    "userId",
    "propertyId"
)
SELECT
    "id",
    "rating",
    "comment",
    "createdAt",
    "updatedAt",
    "userId",
    "propertyId"
FROM "reviews";

DELETE FROM "reviews";

-- Switch review model to booking-scoped uniqueness and strict rating constraints.
ALTER TABLE "reviews"
    ADD COLUMN "bookingId" TEXT,
    ALTER COLUMN "rating" TYPE SMALLINT;

ALTER TABLE "reviews"
    ALTER COLUMN "bookingId" SET NOT NULL;

CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");

ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_rating_check"
    CHECK ("rating" >= 1 AND "rating" <= 5);
