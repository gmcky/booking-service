-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "accuracy" SMALLINT,
ADD COLUMN     "checkIn" SMALLINT,
ADD COLUMN     "cleanliness" SMALLINT,
ADD COLUMN     "communication" SMALLINT,
ADD COLUMN     "location" SMALLINT,
ADD COLUMN     "value" SMALLINT;

-- Range checks: each category is null (legacy / not provided) or 1-5.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_cleanliness_check" CHECK ("cleanliness" IS NULL OR ("cleanliness" >= 1 AND "cleanliness" <= 5)),
  ADD CONSTRAINT "reviews_accuracy_check" CHECK ("accuracy" IS NULL OR ("accuracy" >= 1 AND "accuracy" <= 5)),
  ADD CONSTRAINT "reviews_checkIn_check" CHECK ("checkIn" IS NULL OR ("checkIn" >= 1 AND "checkIn" <= 5)),
  ADD CONSTRAINT "reviews_communication_check" CHECK ("communication" IS NULL OR ("communication" >= 1 AND "communication" <= 5)),
  ADD CONSTRAINT "reviews_location_check" CHECK ("location" IS NULL OR ("location" >= 1 AND "location" <= 5)),
  ADD CONSTRAINT "reviews_value_check" CHECK ("value" IS NULL OR ("value" >= 1 AND "value" <= 5));
